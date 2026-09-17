/**
 * 一次性修复脚本：年份错位（highlights 里的年份 vs edition.year）
 *
 * 策略（用户确认 2026-09-17）：
 *   1) 对每个错位行，按 marathon_sources.source_url 重抓 og:description；
 *   2) 用与 import-zuicool-trail.ts 完全相同的 parseRaceDate() 重新解析
 *      "X年X月X日"，重设 race_date + year；
 *   3) 如果不是 zuicool 源（拉不到 og:description），fallback：用 highlights
 *      里的第一个 "X年X月X日"；
 *   4) 仍然解不到的、且 highlights 有 "page=已截止" + 提到去年年份的 → 归档
 *      （publish_status = 'archived'，保留记录供 review）；
 *
 * 运行：
 *   npx tsx script/fix-year-mismatch.ts [--dry]            # 扫描不写库
 *   npx tsx script/fix-year-mismatch.ts [--apply]          # 实际修复
 *   npx tsx script/fix-year-mismatch.ts [--only=ids...]    # 只跑指定id
 *
 * 产出（stdout）：
 *   - 修复明细 + 统计：{ fixed, reaped, skipped, errors }
 *   - 留待人工 review 的争议行（heuristic 不确定）
 *
 * Env:
 *   DATABASE_URL    （连接生产/本地 DB）
 */

import "dotenv/config";
import { Pool, type PoolClient } from "pg";

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY; // 默认 dry-run
const ONLY_IDS = (() => {
  const m = process.argv.find((a) => a.startsWith("--only="));
  return m ? m.split("=")[1].split(",") : null;
})();

const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

const UA = "Mozilla/5.0 (compatible; MarathonCalendarFixBot/1.0)";

// ---------- 与 import-zuicool-trail.ts 保持一致的解析函数 ----------

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\\]/g, "\\$&")}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*/?>`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  const re2 = new RegExp(
    `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]*(?:name|property)=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : null;
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Best-effort parse of race_date from description text (matches the
 *  conventions documented in import-zuicool-trail.ts). */
function parseRaceDate(desc: string, title: string): { date: string | null; year: number | null } {
  const fullYear = desc.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (fullYear) {
    const [, y, m, d] = fullYear;
    return { date: iso(+y, +m, +d), year: +y };
  }
  const monthDay = desc.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  // Year heuristic: first 4-digit year anywhere in title (e.g. "...2025重庆..."),
  // otherwise current calendar year + bump to next year if the parsed date is
  // already > 60 days in the past.
  const titleYear = (title.match(/(20\d\d)/) ?? [])[1];
  let year = titleYear ? +titleYear : new Date().getFullYear();
  if (!monthDay) return { date: null, year };
  const month = +monthDay[1];
  const day = +monthDay[2];
  if (!titleYear) {
    const candidate = new Date(year, month - 1, day);
    const now = new Date();
    if (candidate.getTime() < now.getTime() - 60 * 86400000) year += 1;
  }
  return { date: iso(year, month, day), year };
}

/** Fallback：直接从 highlights 里第一个 "X年X月X日" 拿。 */
function parseFromHighlights(highlights: string): { date: string | null; year: number | null } {
  const m = highlights.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return { date: null, year: null };
  const [, y, mo, d] = m;
  return { date: iso(+y, +mo, +d), year: +y };
}

async function fetchOgDescription(url: string): Promise<{ title: string; description: string } | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const html = await r.text();
    const title = metaContent(html, "og:title") ?? "";
    const description = metaContent(html, "og:description") ?? "";
    return { title, description };
  } catch {
    return null;
  }
}

// ---------- 主流程 ----------

interface Row {
  id: string;
  marathon_id: string;
  year: number;
  race_date: string | null;
  status: string;
  highlights: string | null;
  registration_url: string | null;
  source_url: string | null;
  source_id: string | null;
}

async function loadCandidates(client: PoolClient, onlyIds: string[] | null): Promise<Row[]> {
  const args: any[] = [];
  let idFilter = "";
  if (onlyIds && onlyIds.length) {
    args.push(onlyIds);
    idFilter = `AND e.id = ANY($${args.length}::text[])`;
  }
  const sql = `
    SELECT e.id, e.marathon_id, e.year, e.race_date::text, e.status,
           e.highlights, e.registration_url,
           ms.source_url, ms.source_id
    FROM marathon_editions e
    LEFT JOIN marathon_sources ms
      ON ms.marathon_id = e.marathon_id
      AND ms.source_id = '8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724'   -- zuicool source_id
    -- Strict year-mismatch: find rows where highlights says "定于YYYY年"
    -- but edition.year differs. This catches zuicool og:description-style
    -- text without false positives from "2027年烟台站至..." or import
    -- timestamps like "[2026-09-04 worldsmarathons import]".
    WHERE e.highlights IS NOT NULL
      AND e.highlights ~ '定于\d{4}年'
      AND SUBSTRING(e.highlights FROM '定于(\d{4})年')::int <> e.year
      ${idFilter}
    ORDER BY e.year DESC, e.race_date DESC NULLS LAST
  `;
  const { rows } = await client.query(sql, args);
  return rows as Row[];
}

interface FixDecision {
  id: string;
  before: { year: number; race_date: string | null };
  after: { year: number; race_date: string };
  source: "og" | "highlights" | "archived" | "skip";
  reason: string;
  url: string | null;
  mentioned_year_in_highlights: number;
}

async function decide(row: Row): Promise<FixDecision> {
  const mentionedYear =
    parseInt((row.highlights?.match(/(20\d\d)/)?.[1] ?? "0"), 10) || 0;
  const today = new Date();

  // 1) 尝试从 og:description 拉
  if (row.source_url) {
    const og = await fetchOgDescription(row.source_url);
    if (og && og.description) {
      const parsed = parseRaceDate(og.description, og.title);
      if (parsed.date && parsed.year && parsed.year !== row.year) {
        // 如果修复后 race_date 早已过去（>30 天），且 row.year 是当前/未来，
        // 说明这其实是去年的赛事被错标到今年 — 归档而不是改 year，
        // 避免污染"今年赛事日历"。
        const parsedDate = new Date(parsed.date);
        const daysPast = (today.getTime() - parsedDate.getTime()) / 86400000;
        if (daysPast > 30 && row.year >= today.getFullYear()) {
          return {
            id: row.id,
            before: { year: row.year, race_date: row.race_date },
            after: { year: parsed.year, race_date: parsed.date },
            source: "archived",
            reason: `og says ${parsed.date} (${daysPast.toFixed(0)}d past) but edition.year=${row.year} — race belongs to ${parsed.year}, archive`,
            url: row.source_url,
            mentioned_year_in_highlights: mentionedYear,
          };
        }
        return {
          id: row.id,
          before: { year: row.year, race_date: row.race_date },
          after: { year: parsed.year, race_date: parsed.date },
          source: "og",
          reason: "og:description re-parsed",
          url: row.source_url,
          mentioned_year_in_highlights: mentionedYear,
        };
      }
      // og 年份与 edition.year 一致 — 不是错位，skip（但保留在 candidates 仅作审计）
      return {
        id: row.id,
        before: { year: row.year, race_date: row.race_date },
        after: { year: row.year, race_date: row.race_date ?? "0001-01-01" },
        source: "skip",
        reason: "og re-parsed: year matches edition.year — text contains future year only (legacy highlight)",
        url: row.source_url,
        mentioned_year_in_highlights: mentionedYear,
      };
    }
  }

  // 2) fallback: highlights 自身
  //    candidates already pass the WHERE filter (mentioned year != edition year).
  //    - For non-zuicool sources we can't reliably re-parse, so use the first
  //      "X年X月X日" inside highlights as the year signal (with the same 30-day
  //      past-rule deciding archive vs fix).
  //    - For zuicool sources we already tried og first (step 1).
  if (row.highlights) {
    const fb = parseFromHighlights(row.highlights);
    if (fb.date && fb.year && fb.year !== row.year) {
      const fbDate = new Date(fb.date);
      const daysPast = (today.getTime() - fbDate.getTime()) / 86400000;
      if (daysPast > 30 && row.year >= today.getFullYear()) {
        return {
          id: row.id,
          before: { year: row.year, race_date: row.race_date },
          after: { year: fb.year, race_date: fb.date },
          source: "archived",
          reason: `highlights says ${fb.date} (${daysPast.toFixed(0)}d past) but edition.year=${row.year} — race belongs to ${fb.year}, archive`,
          url: row.source_url,
          mentioned_year_in_highlights: mentionedYear,
        };
      }
      return {
        id: row.id,
        before: { year: row.year, race_date: row.race_date },
        after: { year: fb.year, race_date: fb.date },
        source: "highlights",
        reason: "highlights-only fallback",
        url: row.source_url,
        mentioned_year_in_highlights: mentionedYear,
      };
    }
  }

  // 3) 仍然解不到 → 候选归档（highlights 提到去年，并且有 page=已截止/ended）
  const looksClosed =
    row.status === "closed" ||
    row.status === "ended" ||
    (row.highlights ?? "").includes("page=已截止") ||
    (row.highlights ?? "").includes("cron:");
  const looksLikeLastYear =
    mentionedYear > 0 && mentionedYear < new Date().getFullYear();
  if (looksClosed && looksLikeLastYear) {
    return {
      id: row.id,
      before: { year: row.year, race_date: row.race_date },
      after: { year: row.year, race_date: row.race_date ?? "0001-01-01" },
      source: "archived",
      reason: "page=closed + mentions last year → archive (last-resort)",
      url: row.source_url,
      mentioned_year_in_highlights: mentionedYear,
    };
  }

  // 4) 真不确定
  return {
    id: row.id,
    before: { year: row.year, race_date: row.race_date },
    after: { year: row.year, race_date: row.race_date ?? "0001-01-01" },
    source: "skip",
    reason: "no signal — needs human review",
    url: row.source_url,
    mentioned_year_in_highlights: mentionedYear,
  };
}

async function apply(client: PoolClient, d: FixDecision): Promise<void> {
  if (d.source === "og" || d.source === "highlights") {
    await client.query(
      `UPDATE marathon_editions SET year=$2, race_date=$3, updated_at=NOW() WHERE id=$1`,
      [d.id, d.after.year, d.after.race_date],
    );
  } else if (d.source === "archived") {
    // 加一个 flag，不真正删除
    await client.query(
      `UPDATE marathon_editions SET publish_status='archived', updated_at=NOW() WHERE id=$1`,
      [d.id],
    );
  }
}

async function main() {
  const mode = APPLY ? "APPLY" : "DRY-RUN";
  console.log(`# marathon year-mismatch fixer — mode=${mode}`);
  console.log(`# db = ${DB_URL.replace(/:[^:@/]+@/, ":***@")}`);
  const t0 = Date.now();

  const client = await pool.connect();
  try {
    const rows = await loadCandidates(client, ONLY_IDS);
    console.log(`# candidates: ${rows.length}`);
    if (rows.length === 0) {
      console.log("# no candidates — DB clean");
      return;
    }

    const decisions: FixDecision[] = [];
    for (const row of rows) {
      const d = await decide(row);
      decisions.push(d);
    }

    // 统计
    const stats = {
      fixed_og: 0,
      fixed_highlights: 0,
      archived: 0,
      skipped_review: 0,
      errors: 0,
    };
    for (const d of decisions) {
      if (d.source === "og") stats.fixed_og++;
      else if (d.source === "highlights") stats.fixed_highlights++;
      else if (d.source === "archived") stats.archived++;
      else stats.skipped_review++;
    }

    console.log(`\n# stats:`);
    console.log(`  fixed via og:description     : ${stats.fixed_og}`);
    console.log(`  fixed via highlights fallback: ${stats.fixed_highlights}`);
    console.log(`  archived (last-resort)       : ${stats.archived}`);
    console.log(`  needs human review           : ${stats.skipped_review}`);

    if (APPLY) {
      console.log(`\n# applying...`);
      await client.query("BEGIN");
      try {
        for (const d of decisions) {
          await apply(client, d);
        }
        await client.query("COMMIT");
        console.log(`# committed`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`# ROLLBACK: ${(e as Error).message}`);
        process.exit(1);
      }
    } else {
      console.log(`\n# DRY-RUN — no DB writes. Re-run with --apply to commit.`);
    }

    // 打印 review 清单（争议行 + 归档行）
    const review = decisions.filter((d) => d.source === "archived" || d.source === "skip");
    // 同时打印 fixed 行（截前 30 行）
    const fixed = decisions.filter((d) => d.source === "og" || d.source === "highlights");
    console.log(`\n# fixed preview (${fixed.length} rows, first 30):`);
    for (const d of fixed.slice(0, 30)) {
      console.log(
        `  ${d.id}  year=${d.before.year}→${d.after.year}  race=${d.before.race_date ?? "null"}→${d.after.race_date}  src=${d.source}`,
      );
    }
    if (fixed.length > 30) console.log(`  ... +${fixed.length - 30} more`);
    console.log(`\n# review list (${review.length} rows):`);
    for (const d of review.slice(0, 50)) {
      console.log(
        `  ${d.id}  year=${d.before.year}→${d.after.year}  race=${d.before.race_date ?? "null"}→${d.after.race_date}  src=${d.source}  reason="${d.reason}"  hl_year=${d.mentioned_year_in_highlights}`,
      );
    }
    if (review.length > 50) console.log(`  ... +${review.length - 50} more`);

    const ms = Date.now() - t0;
    console.log(`\n# done in ${ms}ms`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});