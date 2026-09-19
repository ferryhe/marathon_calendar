/**
 * 幂等补列：`marathon_editions.race_end_date`（多日赛/两天赛的末日）。
 *
 *   npx tsx script/db-ensure-race-end-date.ts
 *
 * 背景：2027 伦敦马拉松首次跨两天（Saturday 24 and Sunday 25 April 2027），
 * 库里此前只有 `race_date` 一列，第二天无处安放。约定：
 *   race_date     = 赛事**首日**（沿用"多日赛存首日"惯例）
 *   race_end_date = 赛事**末日**（单日赛保持 NULL）
 * 幂等：可重复执行。
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://marathon:marathon@localhost:5432/marathon_calendar",
});

async function main() {
  const before = await pool.query(
    `select 1 from information_schema.columns
      where table_schema='public' and table_name='marathon_editions' and column_name='race_end_date'`,
  );
  if ((before.rowCount ?? 0) > 0) {
    console.log("race_end_date 已存在，跳过（幂等）");
  } else {
    await pool.query(`alter table marathon_editions add column race_end_date date`);
    console.log("已新增列 marathon_editions.race_end_date (date, nullable)");
  }
  const after = await pool.query(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema='public' and table_name='marathon_editions' and column_name='race_end_date'`,
  );
  console.log("当前定义:", after.rows[0] ?? "(缺失！)");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
