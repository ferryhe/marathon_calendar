/**
 * 定期校验/修复脚本：赛事日期与年份错位（race_date / year 与页面事实不符）
 *
 * 背景（2026-09-20 重写）：
 *   旧实现有两处结构性缺陷 ——
 *     a) 它自带一份 `parseRaceDate()` 拷贝，和 import-zuicool-trail.ts 一样在
 *        正文没有年份时兜底"抓取当年"，于是"重抓 → 重新解析"永远得出同一个错年；
 *     b) 候选筛选写成 `highlights ~ '定于\d{4}年'`，而 zuicool 有 771 行正文只写
 *        "定于10月1日"（无年份）→ 这些行根本进不了候选集，周报长期报 0 条。
 *   现在两处都改为复用 shared/race-date.ts 的每站适配器（导入脚本与巡检脚本
 *   同一份解析器），候选筛选扩展到"正文无年份"与"延期/改期"的行。
 *
 * 候选来源：marathon_editions.highlights（源页面正文首句的镜像），命中任一条件：
 *   1. 正文写 "定于YYYY年" 且该年份 ≠ edition.year（旧逻辑，保留）；
 *   2. 正文写 "定于M月D日" 但没有年份（旧逻辑的盲区）；
 *   3. 正文写 延期/改期/推迟 … 至 M月D日。
 *   publish_status 不再限制为 published —— archived 行同样参与校验。
 *
 * 逐行判定：按 marathon_sources.source_url 重抓页面 → 用对应的站点适配器解析：
 *   - YEAR_MISMATCH  解析出的年份 ≠ edition.year → 自动修复候选（--apply 时写库）
 *   - DATE_MISMATCH  年份一致但 race_date 不同（多日赛 / 延期 / 页面改日）
 *                    → 仅报告，标注 multi-day / rescheduled，不自动改
 *   - UNFETCHABLE    403/302/404 等抓取失败、没有 source_url、或页面信息不足以
 *                    确定年份 → 跳过 + 计数（绝不猜）
 *
 * 运行：
 *   npx tsx script/fix-year-mismatch.ts                     # DRY-RUN（默认）
 *   npx tsx script/fix-year-mismatch.ts --apply             # 实际修复 YEAR_MISMATCH
 *   npx tsx script/fix-year-mismatch.ts --only=id1,id2      # 只跑指定 edition id
 *   npx tsx script/fix-year-mismatch.ts --limit=50          # 只处理前 N 个候选
 *   npx tsx script/fix-year-mismatch.ts --source=zuicool    # 只看某个源
 *   npx tsx script/fix-year-mismatch.ts --concurrency=6     # 抓取并发（默认 6）
 *   npx tsx script/fix-year-mismatch.ts --archive-stale     # 额外：把"解析出的日期
 *                                                           # 早已过去且挂在今年"的行
 *                                                           # 归档（默认关闭）
 *
 * Env:
 *   DATABASE_URL / TARGET_DB_URL
 */

import "dotenv/config";
import { Pool, type PoolClient } from "pg";
import {
  classifySourceKind,
  resolveRaceDateBySource,
  type PageDateResult,
  type RaceSourceKind,
} from "../shared/race-date.js";

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY; // 默认 dry-run（"--dry-run" 也接受，语义相同）
const ARCHIVE_STALE = process.argv.includes("--archive-stale");
const ONLY_IDS = (() => {
  const m = process.argv.find((a) => a.startsWith("--only="));
  return m ? m.split("=")[1].split(",") : null;
})();
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const CONCURRENCY = (() => {
  const m = process.argv.find((a) => a.startsWith("--concurrency="));
  return m ? Math.max(1, parseInt(m.split("=")[1], 10)) : 6;
})();
const ONLY_SOURCES = (() => {
  const m = process.argv.find((a) => a.startsWith("--source="));
  return m ? new Set(m.split("=")[1].split(",").map((s) => s.trim())) : null;
})();

const DB_URL: string = (() => {
  const u = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
  if (!u) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  return u;
})();
const pool = new Pool({ connectionString: DB_URL });

const UA = "Mozilla/5.0 (compatible; MarathonCalendarFixBot/1.0)";
/** zuicool source row id (same constant the previous revision hard-coded). */
const ZUICOOL_SOURCE_ID = "8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724";
const FETCH_TIMEOUT_MS = 20_000;
/** "resolution says the race belongs to a year that is already well past". */
const STALE_DAYS = 30;

// ---------- 抓取 ----------

interface FetchOutcome {
  ok: boolean;
  status: number;
  html: string | null;
  error?: string;
  finalUrl?: string;
}

async function fetchPage(url: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, status: res.status, html: null, finalUrl: res.url };
    return { ok: true, status: res.status, html: await res.text(), finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: 0, html: null, error: (e as Error).message };
  }
}

// ---------- 候选 ----------

interface Row {
  id: string;
  marathon_id: string;
  race_name: string;
  canonical_name: string;
  year: number;
  race_date: string | null;
  status: string;
  publish_status: string | null;
  highlights: string | null;
  source_url: string | null;
  source_id: string | null;
}

async function loadCandidates(client: PoolClient, onlyIds: string[] | null): Promise<Row[]> {
  const args: unknown[] = [ZUICOOL_SOURCE_ID];
  let idFilter = "";
  if (onlyIds && onlyIds.length) {
    args.push(onlyIds);
    idFilter = `AND e.id = ANY($${args.length}::text[])`;
  }
  const sql = `
    SELECT e.id, e.marathon_id, m.name AS race_name,
           COALESCE(m.name_en, m.name) AS canonical_name,
           e.year, e.race_date::text, e.status, e.publish_status, e.highlights,
           ms.source_url, ms.source_id
    FROM marathon_editions e
    JOIN marathons m ON m.id = e.marathon_id
    -- Prefer the zuicool link when a marathon has several, otherwise use whatever
    -- source link exists (so non-zuicool rows are checked instead of silently
    -- dropped with a NULL url).
    LEFT JOIN LATERAL (
      SELECT ms.source_url, ms.source_id
      FROM marathon_sources ms
      WHERE ms.marathon_id = e.marathon_id
        AND ms.source_url IS NOT NULL
      ORDER BY (ms.source_id = $1) DESC, ms.source_id
      LIMIT 1
    ) ms ON TRUE
    WHERE e.highlights IS NOT NULL
      AND (
        -- (1) explicit year in the copy contradicts the stored year
        (e.highlights ~ '定于\\d{4}年'
          AND SUBSTRING(e.highlights FROM '定于(\\d{4})年')::int <> e.year)
        -- (2) structural blind spot of the previous revision: month/day, no year
        OR (e.highlights ~ '定于\\d{1,2}月\\d{1,2}日'
          AND e.highlights !~ '定于\\d{4}年')
        -- (3) reschedule wording
        OR e.highlights ~ '(延期|改期|推迟)[^。]{0,16}(至|到)\\s*\\d{1,2}\\s*月'
      )
      -- archived rows must be checked too (they were invisible before)
      AND (e.publish_status IS NULL OR e.publish_status IN ('published', 'archived'))
      ${idFilter}
    ORDER BY e.year DESC, e.race_date DESC NULLS LAST
  `;
  const { rows } = await client.query(sql, args);
  return rows as Row[];
}

// ---------- 判定 ----------

type Bucket = "YEAR_MISMATCH" | "DATE_MISMATCH" | "UNFETCHABLE" | "OK";

interface Decision {
  row: Row;
  sourceKind: RaceSourceKind;
  bucket: Bucket;
  /** granular reason for the bucket, used in the summary */
  detail: string;
  resolved: PageDateResult | null;
  httpStatus?: number;
  /** YEAR_MISMATCH only: archive instead of rewriting the year */
  archive?: boolean;
  archiveReason?: string;
  note?: string;
}

function daysPast(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - t) / 86_400_000);
}

async function decide(row: Row): Promise<Decision> {
  const sourceKind = classifySourceKind(row.source_url);
  if (!row.source_url) {
    return { row, sourceKind, bucket: "UNFETCHABLE", detail: "no_source_url", resolved: null };
  }
  const fetched = await fetchPage(row.source_url);
  if (!fetched.ok || !fetched.html) {
    return {
      row,
      sourceKind,
      bucket: "UNFETCHABLE",
      detail: fetched.status ? `http_${fetched.status}` : `fetch_error:${fetched.error ?? "?"}`,
      resolved: null,
      httpStatus: fetched.status,
    };
  }

  const resolved = resolveRaceDateBySource(sourceKind, fetched.html, {
    trackedName: row.race_name,
    eventUrl: row.source_url,
  });
  if (!resolved.year || !resolved.date) {
    return {
      row,
      sourceKind,
      bucket: "UNFETCHABLE",
      detail: `unresolvable:${resolved.reason ?? "unknown"}`,
      resolved,
      httpStatus: fetched.status,
    };
  }

  const note = resolved.multiDay
    ? `multi-day (first day stored)${resolved.reason === "rescheduled" ? " + rescheduled" : ""}`
    : resolved.reason === "rescheduled"
      ? "rescheduled"
      : undefined;

  if (resolved.year !== row.year) {
    const decision: Decision = {
      row,
      sourceKind,
      bucket: "YEAR_MISMATCH",
      detail: resolved.source,
      resolved,
      httpStatus: fetched.status,
      note,
    };
    // Opt-in (--archive-stale): a race that really belongs to a past year but is
    // sitting on this/next year's calendar gets archived instead of rewritten.
    const past = daysPast(resolved.date);
    if (ARCHIVE_STALE && past > STALE_DAYS && row.year >= new Date().getFullYear()) {
      decision.archive = true;
      decision.archiveReason = `resolved ${resolved.date} is ${past}d past but edition.year=${row.year} — archive`;
    }
    return decision;
  }

  if (row.race_date !== resolved.date) {
    return {
      row,
      sourceKind,
      bucket: "DATE_MISMATCH",
      detail: resolved.source,
      resolved,
      httpStatus: fetched.status,
      note,
    };
  }

  return {
    row,
    sourceKind,
    bucket: "OK",
    detail: resolved.source,
    resolved,
    httpStatus: fetched.status,
  };
}

// ---------- 写库 ----------

async function apply(client: PoolClient, d: Decision): Promise<void> {
  if (d.bucket !== "YEAR_MISMATCH" || !d.resolved?.date || !d.resolved.year) return;
  if (d.archive) {
    await client.query(
      `UPDATE marathon_editions
         SET publish_status='archived', updated_at=NOW(),
             highlights = COALESCE(highlights,'') || E'\n[year-mismatch: ${
               d.archiveReason ?? "stale"
             }]'
       WHERE id=$1`,
      [d.row.id],
    );
    return;
  }
  await client.query(
    `UPDATE marathon_editions SET year=$2, race_date=$3, updated_at=NOW() WHERE id=$1`,
    [d.row.id, d.resolved.year, d.resolved.date],
  );
}

// ---------- 主流程 ----------

async function main() {
  const mode = APPLY ? "APPLY" : "DRY-RUN";
  console.log(`# marathon year/date mismatch checker — mode=${mode}`);
  console.log(`# db = ${DB_URL.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(
    `# concurrency=${CONCURRENCY}${LIMIT !== Infinity ? ` limit=${LIMIT}` : ""}` +
      `${ONLY_SOURCES ? ` sources=${Array.from(ONLY_SOURCES).join(",")}` : ""}` +
      `${ARCHIVE_STALE ? " archive-stale=on" : ""}`,
  );
  const t0 = Date.now();

  const client = await pool.connect();
  try {
    let rows = await loadCandidates(client, ONLY_IDS);
    console.log(`# candidates: ${rows.length}`);
    if (ONLY_SOURCES) {
      rows = rows.filter((r) => ONLY_SOURCES.has(classifySourceKind(r.source_url)));
      console.log(`# candidates after --source filter: ${rows.length}`);
    }
    if (rows.length === 0) {
      console.log("# no candidates — DB clean");
      return;
    }
    const targets = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
    if (targets.length !== rows.length) console.log(`# processing first ${targets.length}`);

    // Fetch + judge with a small concurrency pool (politeness + wall-clock).
    const decisions: Decision[] = new Array(targets.length);
    let cursor = 0;
    let done = 0;
    const worker = async (): Promise<void> => {
      while (cursor < targets.length) {
        const i = cursor++;
        const row = targets[i];
        try {
          decisions[i] = await decide(row);
        } catch (e) {
          decisions[i] = {
            row,
            sourceKind: classifySourceKind(row.source_url),
            bucket: "UNFETCHABLE",
            detail: `exception:${(e as Error).message}`,
            resolved: null,
          };
        }
        if (++done % 25 === 0) console.log(`  … ${done}/${targets.length}`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));

    const buckets: Record<Bucket, Decision[]> = {
      YEAR_MISMATCH: [],
      DATE_MISMATCH: [],
      UNFETCHABLE: [],
      OK: [],
    };
    for (const d of decisions) buckets[d.bucket].push(d);

    if (APPLY) {
      const fixable = buckets.YEAR_MISMATCH.filter((d) => d.resolved?.date);
      console.log(`\n# applying ${fixable.length} YEAR_MISMATCH row(s)…`);
      await client.query("BEGIN");
      try {
        for (const d of fixable) await apply(client, d);
        await client.query("COMMIT");
        console.log("# committed");
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`# ROLLBACK: ${(e as Error).message}`);
        process.exit(1);
      }
    }

    // ---- required three-bucket report ----
    console.log(`\n# buckets (of ${targets.length} candidates checked):`);
    console.log(`  YEAR_MISMATCH : ${buckets.YEAR_MISMATCH.length}   (auto-fix candidates)`);
    console.log(`  DATE_MISMATCH : ${buckets.DATE_MISMATCH.length}   (report only — multi-day / rescheduled / page changed)`);
    console.log(`  UNFETCHABLE   : ${buckets.UNFETCHABLE.length}   (403/302/404, no source_url, or no resolvable year — skipped)`);
    console.log(`  [aux] OK      : ${buckets.OK.length}   (page agrees with DB)`);

    const tally = (ds: Decision[], key: (d: Decision) => string) => {
      const m = new Map<string, number>();
      for (const d of ds) m.set(key(d), (m.get(key(d)) ?? 0) + 1);
      return Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}=${n}`)
        .join(" ");
    };
    console.log(`\n# bucket detail:`);
    console.log(`  YEAR_MISMATCH by source : ${tally(buckets.YEAR_MISMATCH, (d) => `${d.sourceKind}/${d.detail}`) || "-"}`);
    console.log(`  DATE_MISMATCH by source : ${tally(buckets.DATE_MISMATCH, (d) => `${d.sourceKind}/${d.note ?? "date changed"}`) || "-"}`);
    console.log(`  UNFETCHABLE   by reason : ${tally(buckets.UNFETCHABLE, (d) => d.detail) || "-"}`);

    const show = (d: Decision) => {
      const r = d.resolved;
      return (
        `  ${d.row.id}  ${d.row.publish_status ?? "-"}  ${d.sourceKind}  ` +
        `year=${d.row.year}→${r?.year ?? "?"}  race=${d.row.race_date ?? "null"}→${r?.date ?? "?"}  ` +
        `src=${r?.source ?? "-"}${d.note ? `  [${d.note}]` : ""}  '${d.row.race_name}'`
      );
    };

    console.log(`\n# YEAR_MISMATCH preview (first 30 of ${buckets.YEAR_MISMATCH.length}):`);
    for (const d of buckets.YEAR_MISMATCH.slice(0, 30)) {
      console.log(`${show(d)}${d.archive ? "  → ARCHIVE" : ""}`);
    }
    if (buckets.YEAR_MISMATCH.length > 30) {
      console.log(`  ... +${buckets.YEAR_MISMATCH.length - 30} more`);
    }

    console.log(`\n# DATE_MISMATCH list (${buckets.DATE_MISMATCH.length} rows, first 50):`);
    for (const d of buckets.DATE_MISMATCH.slice(0, 50)) console.log(show(d));
    if (buckets.DATE_MISMATCH.length > 50) {
      console.log(`  ... +${buckets.DATE_MISMATCH.length - 50} more`);
    }

    console.log(`\n# UNFETCHABLE list (${buckets.UNFETCHABLE.length} rows, first 30):`);
    for (const d of buckets.UNFETCHABLE.slice(0, 30)) {
      console.log(
        `  ${d.row.id}  ${d.sourceKind}  reason=${d.detail}  url=${d.row.source_url ?? "(none)"}  '${d.row.race_name}'`,
      );
    }
    if (buckets.UNFETCHABLE.length > 30) {
      console.log(`  ... +${buckets.UNFETCHABLE.length - 30} more`);
    }

    if (!APPLY) {
      console.log(`\n# DRY-RUN — no DB writes. Re-run with --apply to commit YEAR_MISMATCH rows.`);
    }
    console.log(`\n# done in ${Date.now() - t0}ms`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
