/**
 * 自动化陈旧 status 修复：race_date < today 且 status 不在 (ended, cancelled)
 * 的 edition 自动翻成 status='ended'，依赖日期算法作为事实来源。
 *
 * 这是 §7a (umbrella pre-fetch + date-arithmetic fallback) 的脚本实现。
 * 原本分散在 marathon-source-zuicool/nowrun/runsignup/worldsmarathons 各源
 * skill 的 pitfall 里，2026-09-17 第一次集中实现。
 *
 * 来源区分：
 *   - zuicool / runsignup / nowrun / worldsmarathons / wmm-official / manual-cn-*
 *     统一规则：race_date < today + status NOT IN ('ended','cancelled')
 *     → status='ended'
 *   - cancelled 不动（cron 不能覆盖 organizer 的取消决定）
 *   - multi-day 比赛 (race_date 是开始日，end_date 是后)：本期不覆盖；
 *     留 §7a "Sub-pattern — multi-day event window" 处理
 *
 * 运行：
 *   npx tsx script/fix-stale-status.ts            # dry-run
 *   npx tsx script/fix-stale-status.ts --apply    # 实际写 DB
 *   npx tsx script/fix-stale-status.ts --only=id  # 单条测试
 *
 * 输出：打印每个源/状态组合的 count + review 列表 + stats
 *
 * 留痕写哪里（2026-09-20 起）：`field_sources.auditNote*`，**不再写 `highlights`** ——
 * 后者在详情页（`MarathonDetail.tsx`）直接渲染给用户看。见 `shared/provenance.ts`。
 */

import "dotenv/config";
import { Pool, type PoolClient } from "pg";
import { addAuditNoteSql } from "../shared/provenance.js";

const APPLY = process.argv.includes("--apply");
const ONLY_IDS = (() => {
  const m = process.argv.find((a) => a.startsWith("--only="));
  return m ? m.split("=")[1].split(",") : null;
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

interface Row {
  id: string;
  marathon_id: string;
  source_id: string | null;
  year: number;
  race_date: string;
  status: string;
  days_past: number;
}

async function loadCandidates(client: PoolClient, onlyIds: string[] | null): Promise<Row[]> {
  const args: any[] = [];
  let idFilter = "";
  if (onlyIds && onlyIds.length) {
    args.push(onlyIds);
    idFilter = `AND e.id = ANY($${args.length}::text[])`;
  }
  const sql = `
    SELECT e.id, e.marathon_id, ms.source_id, e.year,
           e.race_date::text, e.status,
           (CURRENT_DATE - e.race_date)::int AS days_past
    FROM marathon_editions e
    -- LATERAL + LIMIT 1: a bare LEFT JOIN duplicates the edition row as soon as a
    -- marathon has a second source link, which would double-UPDATE it and append
    -- the annotation twice (review P5).
    LEFT JOIN LATERAL (
      SELECT ms.source_id FROM marathon_sources ms
      WHERE ms.marathon_id = e.marathon_id
      ORDER BY ms.source_id LIMIT 1
    ) ms ON TRUE
    WHERE e.publish_status = 'published'
      AND e.race_date < CURRENT_DATE
      AND e.status NOT IN ('ended', 'cancelled')
      ${idFilter}
    ORDER BY e.race_date ASC, ms.source_id
  `;
  const { rows } = await client.query(sql, args);
  return rows as Row[];
}

async function main() {
  const mode = APPLY ? "APPLY" : "DRY-RUN";
  console.log(`# marathon stale-status fixer — mode=${mode}`);
  console.log(`# db = ${DB_URL.replace(/:[^:@/]+@/, ":***@")}`);
  const t0 = Date.now();

  const client = await pool.connect();
  try {
    const rows = await loadCandidates(client, ONLY_IDS);
    console.log(`# candidates: ${rows.length}`);
    if (rows.length === 0) {
      console.log("# no stale rows — DB clean");
      return;
    }

    // 按源分组
    const bySource: Record<string, { status: string; count: number }[]> = {};
    for (const r of rows) {
      const sid = r.source_id ?? "(no-source)";
      bySource[sid] ??= [];
      const bucket = bySource[sid].find((b) => b.status === r.status);
      if (bucket) bucket.count++;
      else bySource[sid].push({ status: r.status, count: 1 });
    }
    console.log(`\n# by source/status:`);
    for (const [sid, stats] of Object.entries(bySource)) {
      const parts = stats.map((s) => `${s.status}=${s.count}`).join(" ");
      console.log(`  ${sid.padEnd(40)} ${parts}`);
    }

    console.log(`\n# review list (first 50):`);
    for (const r of rows.slice(0, 50)) {
      console.log(`  ${r.id}  src=${r.source_id ?? "(none)"}  status=${r.status}  race=${r.race_date}  days_past=${r.days_past}`);
    }
    if (rows.length > 50) console.log(`  ... +${rows.length - 50} more`);

    if (APPLY) {
      console.log(`\n# applying...`);
      await client.query("BEGIN");
      let applied = 0;
      try {
        for (const r of rows) {
          // Real timestamp — the previous revision stamped a hard-coded
          // '2026-09-17', which made every later run look like the same day
          // (review P4).
          await client.query("SAVEPOINT row_sp");
          try {
            await client.query(
              `UPDATE marathon_editions
               SET status='ended', updated_at=NOW(),
                   ${addAuditNoteSql({
                     noteExpr:
                       `'[stale-status ' || to_char(NOW() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') || ` +
                       `': date-arithmetic flip ' || $2 || '→ended (race_date < today)]'`,
                     whyExpr: "'stale-status flip'",
                     atExpr: "to_char(NOW() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')",
                   })}
               WHERE id=$1`,
              [r.id, r.status],
            );
            await client.query("RELEASE SAVEPOINT row_sp");
            applied++;
          } catch (e) {
            await client.query("ROLLBACK TO SAVEPOINT row_sp");
            console.error(`  ! ${r.id}: ${(e as Error).message}`);
          }
        }
        await client.query("COMMIT");
        console.log(`# committed ${applied} row(s)${applied === rows.length ? "" : `, ${rows.length - applied} failed`}`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`# ROLLBACK: ${(e as Error).message}`);
        process.exit(1);
      }
    } else {
      console.log(`\n# DRY-RUN — no DB writes. Re-run with --apply to commit.`);
    }

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