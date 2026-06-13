import { db } from "../server/db";
import { sql } from "drizzle-orm";

// For each of 8 WMM, find ANY OTHER marathon row (different canonical_name) with:
//   - race_date matches WMM edition's race_date (within +/- 7 days, since some sources round dates)
//   - city matches (by ZH or EN)
//   - race_kind = marathon
// Treat: same race_date + same city + same race_kind = DUPLICATE (not separate race)

const wmm: Array<[string, string, string, string]> = [
  ["tokyo-marathon", "2027-03-07", "东京", "Tokyo"],
  ["london-marathon", "2027-04-25", "伦敦", "London"],
  ["sydney-marathon", "2026-08-30", "悉尼", "Sydney"],
  ["berlin-marathon", "2026-09-27", "柏林", "Berlin"],
  ["boston-marathon", "2027-04-19", "波士顿", "Boston"],
  ["new-york-city-marathon", "2026-11-01", "纽约", "New York"],
  ["chicago-marathon", "2026-10-11", "芝加哥", "Chicago"],
  ["capetown-marathon", "2027-05-23", "开普敦", "Cape Town"],
];

let totalDups = 0;
for (const [cname, wmmDate, cityZh, cityEn] of wmm) {
  const r = await db.execute(sql`
    SELECT m.id, m.canonical_name, m.name_zh, m.name_en, m.city_zh, m.city_en, m.country, m.race_kind,
           e.race_date::text AS race_date, e.status,
           m.website_url
    FROM marathons m
    JOIN marathon_editions e ON e.marathon_id = m.id
    WHERE m.canonical_name != ${cname}
      AND m.race_kind = 'marathon'
      AND e.race_date BETWEEN (${wmmDate}::date - 7) AND (${wmmDate}::date + 7)
      AND (m.city_zh = ${cityZh} OR m.city_en ILIKE ${cityEn} OR m.canonical_name ILIKE ${"%" + cname.split("-")[0] + "%"})
  `);
  if (r.rows.length === 0) {
    console.log(`✓ ${cname} (${wmmDate}, ${cityZh}) — no duplicates`);
  } else {
    console.log(`⚠ ${cname} (${wmmDate}, ${cityZh}) — ${r.rows.length} duplicate(s):`);
    for (const row of r.rows as any[]) {
      console.log(`    ${row.id.slice(0,8)} | ${(row.canonical_name||'').padEnd(60)} | city=${row.city_zh||row.city_en||'?'} | ${row.country} | ${row.race_date||'?'} (${row.status||'?'}) | ${(row.website_url||'').slice(0,50)}`);
      totalDups++;
    }
  }
}
console.log(`\n=== Total duplicate rows: ${totalDups} ===`);
process.exit(0);
