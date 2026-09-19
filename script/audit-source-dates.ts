/**
 * 按源独立体检：把库里某个源的 race_date 与源站页面事实逐一对照。
 *
 * 每个源都走它自己的适配器（shared/race-date.ts 里的 per-source resolver），
 * 所以"某个源该怎么读日期"只在一个地方定义；本脚本只负责取样、抓取、判档、汇总。
 *
 * 用法：
 *   npx tsx script/audit-source-dates.ts --source=runsignup [--sample=30]
 *   npx tsx script/audit-source-dates.ts --source=nowrun --sample=0     # 0 = 全部
 *   npx tsx script/audit-source-dates.ts --source=zuicool --out=/tmp/a.json
 *   npx tsx script/audit-source-dates.ts --source=zuicool --canonical=zuicool-8
 *
 * 注意 `--sample=N` 取的是 **race_date 最新的 N 条**（有偏：抽不到翻届/历史群体）；
 * 要全貌请用 `--sample=0`。`--source=` 只按**源名/源 id** 匹配，canonical 前缀请用
 * `--canonical=`（否则 `--source=Marathon` 会同时命中 runsignup / worldsmarathons / 官网源）。
 *
 * 判档：
 *   OK                    库里的日期就是源站该届次的日期
 *   TZ_SHIFT              页面本地日 = 库里日 ±1 天（典型时区换算错误，最要紧的一类）
 *   DATE_DIFF             同为一年，天数差得更多（改期 / 页面改日 / 届次选错）
 *   STALE_EDITION         页面已翻到下一届（相差 >300 天）—— 属采集新鲜度，不算提取错
 *   OLD_EDITION_RETAINED  页面已翻届，且**新届已经建好入库**—— 旧届留历史，不是错（2026-09-20 加）
 *   YEAR_DIFF             年份不一致
 *   MULTI_AMBIG           页面多场次，且按赛事名/URL 都定位不到这一届 —— 拒绝猜（原样报出）
 *   DB_DAY_IS_SIBLING     按名定位到了这一届，但**库里那天属于同页别的场次**（旧名 MULTI_NO_MATCH
 *                         易被读成"名字匹配不上"，与含义相反，2026-09-20 改名）
 *   UNRESOLVABLE          适配器读不出年份（no_year / rescheduled_unparsed / …）
 *   FETCH_FAIL            抓不到页面
 *
 * 只读：只 SELECT + 抓页面，绝不写库。
 */
import "dotenv/config";
import { Pool } from "pg";
import { writeFileSync } from "node:fs";
import {
  CST_OFFSET_MINUTES,
  classifySourceKind,
  collectJsonLdEvents,
  calendarDay,
  resolveRaceDateBySource,
  type PageDateResult,
  type RaceSourceKind,
} from "../shared/race-date.js";

/**
 * 每个源「读哪一天」的规则不同，体检必须跟着源走，否则会把正确的行判成错的：
 *   - nowrun 的 JSON-LD startDate 是 **UTC 瞬时**（2026-12-30T16:00Z = 12-31 00:00 北京时间）
 *     → 该源要 +08:00 折算（本次就踩到：用通用口径把 15 行正确数据误判为差异）。
 *   - zuicool / runsignup / worldsmarathons 给的是当地时间字面量 → 不加偏移。
 */
const TZ_BY_KIND: Record<RaceSourceKind, number> = {
  nowrun: CST_OFFSET_MINUTES,
  zuicool: 0,
  runsignup: 0,
  worldsmarathons: 0,
  unknown: 0,
};

const UA = "Mozilla/5.0 (compatible; MarathonCalendarAuditBot/1.0)";
const CONC = 6;

const arg = (name: string, dflt: string | null = null): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : dflt;
};

const SOURCE = arg("source");
if (!SOURCE) {
  console.error("用法: npx tsx script/audit-source-dates.ts --source=<zuicool|runsignup|nowrun|worldsmarathons|wmm-official|…> [--sample=30] [--out=/tmp/x.json]");
  process.exit(1);
}
const SAMPLE = Number(arg("sample", "30")); // 0 = 全部
/** 另开一个开关按 canonical 前缀取样，避免把别的源拉进来（--source=Marathon 曾混进 3 个源）。 */
const CANONICAL = arg("canonical", "");
const OUT = arg("out", "/tmp/source-audit.json")!;

type Verdict =
  | "OK" | "TZ_SHIFT" | "DATE_DIFF" | "STALE_EDITION" | "OLD_EDITION_RETAINED" | "YEAR_DIFF"
  | "MULTI_AMBIG" | "DB_DAY_IS_SIBLING" | "UNRESOLVABLE" | "FETCH_FAIL";

interface Row {
  id: string;
  canonical_name: string | null;
  race_name: string;
  year: number;
  db_date: string | null;
  status: string;
  publish_status: string | null;
  url: string;
  /** 同 marathon 下已入库的、年份更大的 published 届次（翻届后旧届不再告警用）。 */
  newer_published_year: number | null;
  kind: RaceSourceKind;
}

interface Result extends Row {
  verdict: Verdict;
  resolved: PageDateResult | null;
  pageDays: string[];
  evidence?: string;
  note?: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://marathon:marathon@localhost:5432/marathon_calendar",
});

async function load(): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT e.id, m.canonical_name, m.name AS race_name, e.year, e.race_date::text AS db_date,
            e.status, e.publish_status, ms.source_url AS url,
            (SELECT MIN(e2.year) FROM marathon_editions e2
              WHERE e2.marathon_id = e.marathon_id
                AND e2.publish_status = 'published'
                AND e2.year > e.year) AS newer_published_year
       FROM marathon_editions e
       JOIN marathons m ON m.id = e.marathon_id
       JOIN marathon_sources ms ON ms.marathon_id = m.id
       JOIN sources s ON s.id = ms.source_id
      WHERE ms.source_url IS NOT NULL
        AND (s.name ILIKE $1 OR s.id ILIKE $1 OR ($2 <> '' AND m.canonical_name ILIKE $2))
      ORDER BY e.race_date DESC NULLS LAST
      ${SAMPLE > 0 ? "LIMIT " + Math.trunc(SAMPLE) : ""}`,
    [`%${SOURCE}%`, CANONICAL ? `%${CANONICAL}%` : ""],
  );
  return rows.map((r) => ({ ...r, kind: classifySourceKind(r.url) }));
}

async function fetchHtml(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, status: res.status, html: "" };
    return { ok: true, status: res.status, html: await res.text() };
  } catch {
    return { ok: false, status: 0, html: "" };
  }
}

function classify(row: Row, res: PageDateResult | null, pageDays: string[]): Verdict {
  // 页面多场次、适配器按名/URL 都定位不到这一届 → 原样报出（别拿"页面出现过"放过它）
  if (res?.reason === "ambiguous_multi_edition") return "MULTI_AMBIG";
  if (!res || !res.date || !res.year) return "UNRESOLVABLE";
  const db = row.db_date;
  if (!db) return "DATE_DIFF";
  // 适配器（该源的权威规则）给出同一天 → 就是 OK；pageDays 只是诊断用的旁证。
  if (res.date === db) return "OK";
  if (pageDays.includes(db)) {
    // 按赛事名定位到的是另一天 ⇒ 库里这天属于同页别的场次（2026-09-20 的错法：
    // 系列页把每场赛事的日期都写上，旧的"日期在页面上就算 OK"永远抓不到）。
    // 名字务必直白：旧名 MULTI_NO_MATCH 会被读成"名字匹配不上"，与含义相反。
    if (res.matchedBy === "name") return "DB_DAY_IS_SIBLING";
    return "OK";
  }
  // 页面已翻届，且新届**已经建好入库**（status/publish 都上页面了）→ 旧届留历史，
  // 拿旧届去比新届页面必然不符，这不是错。实测：Diablo Trail Run（2026-09-06 → 页面
  // 2027-05-23，差 259 天 < 300）、Hall of Fame Half（2026-08-23 → 2027-04-24）。
  // 放在 STALE/YEAR_DIFF 之前，否则这两条会永远挂在告警里。
  if (row.newer_published_year && res.year && res.year > row.year) return "OLD_EDITION_RETAINED";
  // Order matters: a page that has rolled over to the NEXT edition shows a
  // different year, so checking YEAR_DIFF first swallowed every "rolled over"
  // row and made the documented STALE_EDITION bucket unreachable (found in
  // review round 3: YEAR_DIFF=56, of which 54 have a gap > 300 days).
  const gapDays = (p: string) => Math.abs((Date.parse(db) - Date.parse(p)) / 86_400_000);
  if (pageDays.some((p) => gapDays(p) > 300)) return "STALE_EDITION";
  if (res.year !== row.year) return "YEAR_DIFF";
  if (Math.abs((Date.parse(db) - Date.parse(res.date)) / 86_400_000) === 1) return "TZ_SHIFT";
  if (pageDays.length > 1) return "DB_DAY_IS_SIBLING";
  return "DATE_DIFF";
}

async function main() {
  const rows = await load();
  if (rows.length === 0) {
    console.log(`# --source=${SOURCE}: 库里没有匹配的行（检查源名/canonical 前缀）`);
    await pool.end();
    return;
  }
  console.log(`# --source=${SOURCE}  取样 ${rows.length} 条（sample=${SAMPLE === 0 ? "all" : SAMPLE}）`);

  const results: Result[] = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const i = cursor++;
      const r = rows[i];
      const f = await fetchHtml(r.url);
      if (!f.ok) {
        results[i] = { ...r, verdict: "FETCH_FAIL", resolved: null, pageDays: [], note: `http_${f.status || "err"}` };
        continue;
      }
      // 不用 Set 展开（低 target 的 tsc 会报 TS2802），手动去重
      const pageDays: string[] = [];
      const tz = TZ_BY_KIND[r.kind];
      for (const ev of collectJsonLdEvents(f.html)) {
        const d = calendarDay(ev.startDate, tz);
        if (d && pageDays.indexOf(d) === -1) pageDays.push(d);
      }
      pageDays.sort();
      const resolved = resolveRaceDateBySource(r.kind, f.html, {
        trackedName: r.race_name,
        eventUrl: r.url,
      });
      results[i] = {
        ...r,
        resolved,
        pageDays: pageDays.sort(),
        verdict: classify(r, resolved, pageDays),
        evidence: resolved.evidence,
      };
      if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${rows.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  await pool.end();

  writeFileSync(OUT, JSON.stringify(results, null, 1));

  const order: Verdict[] = ["OK", "TZ_SHIFT", "DATE_DIFF", "STALE_EDITION", "OLD_EDITION_RETAINED", "YEAR_DIFF", "MULTI_AMBIG", "DB_DAY_IS_SIBLING", "UNRESOLVABLE", "FETCH_FAIL"];
  console.log(`\n# 分档（n=${results.length}）`);
  for (const v of order) {
    const n = results.filter((r) => r.verdict === v).length;
    if (n) console.log(`  ${v.padEnd(15)} ${String(n).padStart(4)}  (${((n / results.length) * 100).toFixed(1)}%)`);
  }
  const bad = results.filter((r) => r.verdict !== "OK");
  console.log(`\n# 需处理的 ${bad.length} 条（前 25）`);
  for (const r of bad.slice(0, 25)) {
    console.log(
      `  [${r.verdict}] kind=${r.kind} db=${r.db_date ?? "null"}(y${r.year}) → page=${r.resolved?.date ?? "-"} ` +
        `days=[${r.pageDays.slice(0, 4).join(",")}] '${r.race_name.slice(0, 30)}'\n      ${r.url}\n      ev=${(r.evidence ?? r.note ?? "").slice(0, 96)}`,
    );
  }
  console.log(`\n# 明细已存 ${OUT}`);
  console.log(`# 只读完成：没有写任何库表`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
