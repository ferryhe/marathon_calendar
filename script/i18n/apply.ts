// Apply i18n translations to marathons table.
// Usage:
//   tsx script/i18n/apply.ts --dry-run             # check coverage on dev
//   tsx script/i18n/apply.ts --apply               # apply on dev
//   TARGET_DB_URL=$PROD_DATABASE_URL tsx script/i18n/apply.ts --apply  # apply on prod
//
// 匹配按 name / city 原值（dev 与 prod ID 不同），保证跨环境可复用。

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

import { CITY_EN_BY_ZH, CITY_ZH_BY_EN } from "./cities";
import { RACE_NAME_EN_BY_ZH, RACE_NAME_ZH_BY_EN } from "./race-names";

const apply = process.argv.includes("--apply");
const dbUrl = process.env.TARGET_DB_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL or TARGET_DB_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });
const db = drizzle(pool);

async function main() {
  // 当前未译统计
  const before = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE name_zh IS NULL) AS need_zh,
      COUNT(*) FILTER (WHERE name_en IS NULL) AS need_en,
      COUNT(*) FILTER (WHERE city_zh IS NULL AND city IS NOT NULL) AS city_need_zh,
      COUNT(*) FILTER (WHERE city_en IS NULL AND city IS NOT NULL) AS city_need_en
    FROM marathons
  `);
  console.log("BEFORE:", before.rows[0]);

  // 一致性自检：所有待译值是否都在字典里
  const missingNameZh = await db.execute(sql`SELECT name FROM marathons WHERE name_zh IS NULL`);
  const missingNameEn = await db.execute(sql`SELECT name FROM marathons WHERE name_en IS NULL`);
  const missingCityZh = await db.execute(sql`SELECT DISTINCT city FROM marathons WHERE city_zh IS NULL AND city IS NOT NULL AND city <> ''`);
  const missingCityEn = await db.execute(sql`SELECT DISTINCT city FROM marathons WHERE city_en IS NULL AND city IS NOT NULL AND city <> ''`);

  const ungeneratedNameZh = missingNameZh.rows
    .map((r) => r.name as string)
    .filter((n) => !(n in RACE_NAME_ZH_BY_EN));
  const ungeneratedNameEn = missingNameEn.rows
    .map((r) => r.name as string)
    .filter((n) => !(n in RACE_NAME_EN_BY_ZH));
  const ungeneratedCityZh = missingCityZh.rows
    .map((r) => r.city as string)
    .filter((c) => !(c in CITY_ZH_BY_EN));
  const ungeneratedCityEn = missingCityEn.rows
    .map((r) => r.city as string)
    .filter((c) => !(c in CITY_EN_BY_ZH));

  console.log(
    `Coverage gaps: name_zh=${ungeneratedNameZh.length}, name_en=${ungeneratedNameEn.length}, city_zh=${ungeneratedCityZh.length}, city_en=${ungeneratedCityEn.length}`,
  );
  if (ungeneratedNameZh.length) console.log("  missing name_zh:", ungeneratedNameZh.slice(0, 10));
  if (ungeneratedNameEn.length) console.log("  missing name_en:", ungeneratedNameEn.slice(0, 10));
  if (ungeneratedCityZh.length) console.log("  missing city_zh:", ungeneratedCityZh.slice(0, 10));
  if (ungeneratedCityEn.length) console.log("  missing city_en:", ungeneratedCityEn.slice(0, 10));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  // 事务包裹
  await db.transaction(async (tx) => {
    let nameZhUpdated = 0;
    let nameEnUpdated = 0;
    let cityZhUpdated = 0;
    let cityEnUpdated = 0;

    for (const [enName, zhName] of Object.entries(RACE_NAME_ZH_BY_EN)) {
      const r = await tx.execute(sql`
        UPDATE marathons SET name_zh = ${zhName}
        WHERE name = ${enName} AND name_zh IS NULL
      `);
      nameZhUpdated += (r as { rowCount?: number }).rowCount ?? 0;
    }
    for (const [zhName, enName] of Object.entries(RACE_NAME_EN_BY_ZH)) {
      const r = await tx.execute(sql`
        UPDATE marathons SET name_en = ${enName}
        WHERE name = ${zhName} AND name_en IS NULL
      `);
      nameEnUpdated += (r as { rowCount?: number }).rowCount ?? 0;
    }
    for (const [enCity, zhCity] of Object.entries(CITY_ZH_BY_EN)) {
      const r = await tx.execute(sql`
        UPDATE marathons SET city_zh = ${zhCity}
        WHERE city = ${enCity} AND city_zh IS NULL
      `);
      cityZhUpdated += (r as { rowCount?: number }).rowCount ?? 0;
    }
    for (const [zhCity, enCity] of Object.entries(CITY_EN_BY_ZH)) {
      const r = await tx.execute(sql`
        UPDATE marathons SET city_en = ${enCity}
        WHERE city = ${zhCity} AND city_en IS NULL
      `);
      cityEnUpdated += (r as { rowCount?: number }).rowCount ?? 0;
    }

    console.log(
      `Updated: name_zh=${nameZhUpdated}, name_en=${nameEnUpdated}, city_zh=${cityZhUpdated}, city_en=${cityEnUpdated}`,
    );
  });

  const after = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE name_zh IS NULL) AS need_zh,
      COUNT(*) FILTER (WHERE name_en IS NULL) AS need_en,
      COUNT(*) FILTER (WHERE city_zh IS NULL AND city IS NOT NULL) AS city_need_zh,
      COUNT(*) FILTER (WHERE city_en IS NULL AND city IS NOT NULL) AS city_need_en
    FROM marathons
  `);
  console.log("AFTER:", after.rows[0]);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
