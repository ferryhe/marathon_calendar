/**
 * Hand-curated Hong Kong marathon seed.
 *
 * Reason for hand-curation: there is no clean HK race aggregator accessible
 * from a server (gobyrun = dead, sportsoho = Cloudflare, mevents.org.hk has
 * only ~3 marathon events with messy date fields). See
 * `.local/skills/crawler-overseas/SKILL.md` §3 for the full discovery log.
 *
 * Each race below was sourced from www.mevents.org.hk's "Major Sports Event"
 * portal (HK government) cross-referenced with the organizer's own site.
 *
 * canonical_name: `hk-{slug}-{year}`
 * country: 'China'  (HK is normalized to China per CHINA_COUNTRY_ALIASES)
 *
 * Run:
 *   npx tsx script/seed-hk-marathons.ts [--dry]
 *   TARGET_DB_URL=$PROD_DATABASE_URL npx tsx script/seed-hk-marathons.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { computeEditionStatus } from "../shared/status.js";

const DRY = process.argv.includes("--dry");
const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

const SOURCE_NAME = "Hong Kong major sports events (mevents.org.hk)";

interface Seed {
  slug: string;
  name: string;
  nameZh: string;
  city: string;
  websiteUrl: string;
  raceKind: "marathon" | "trail";
  description: string;
  year: number;
  raceDate: string | null;
  distanceOptions: Array<{ kind: string }>;
  startLocation: string | null;
}

// Notes:
// - Standard Chartered Hong Kong Marathon 2026 ran on 2026-02-09 (already
//   ended).  Next confirmed edition is the 2027 race already in DB.
// - HKZMB (Hong Kong-Zhuhai-Macao Bridge) Half Marathon 2026 date not yet
//   announced as of 2026-05-03 — leave date NULL, status=upcoming.
// - 3RS Run (HKIA Three-Runway System 10km) 2026 date not yet announced.
const SEEDS: Seed[] = [
  {
    slug: "standard-chartered-hong-kong-marathon",
    name: "Standard Chartered Hong Kong Marathon",
    nameZh: "渣打香港马拉松",
    city: "香港",
    websiteUrl: "https://www.hkmarathon.com/",
    raceKind: "marathon",
    description: "渣打香港马拉松（SCHKM），香港最具代表性的国际金标马拉松，由香港业余田径总会主办。",
    year: 2026,
    raceDate: "2026-02-09",
    distanceOptions: [{ kind: "10KM" }, { kind: "21KM" }, { kind: "42KM" }],
    startLocation: "中环遮打道",
  },
  {
    slug: "hkzmb-half-marathon",
    name: "HKZMB Half Marathon",
    nameZh: "港珠澳大桥香港段半程马拉松",
    city: "香港",
    websiteUrl: "https://www.hzmb-halfmarathon.com/",
    raceKind: "marathon",
    description: "中银香港·港珠澳大桥（香港段）半程马拉松，由香港业余田径总会主办。",
    year: 2026,
    raceDate: null, // 2026 date TBA as of crawl
    distanceOptions: [{ kind: "21KM" }],
    startLocation: "港珠澳大桥香港口岸",
  },
  {
    slug: "hkia-3rs-run",
    name: "HKIA Three-Runway System 10km International Race",
    nameZh: "香港国际机场三跑道系统10公里国际跑",
    city: "香港",
    websiteUrl: "https://www.3rsrun.com/",
    raceKind: "marathon",
    description: "香港国际机场三跑道系统10公里国际跑，香港业余田径总会与机管局合办，赛道沿全新第三跑道。",
    year: 2026,
    raceDate: null, // 2026 date TBA as of crawl
    distanceOptions: [{ kind: "10KM" }],
    startLocation: "香港国际机场",
  },
];

async function ensureSourceId(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM sources WHERE name=$1 LIMIT 1",
    [SOURCE_NAME],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO sources(name, type, strategy, base_url, priority, notes)
     VALUES($1, 'curated', 'manual', 'http://www.mevents.org.hk', 4,
            '香港政府主办的大型体育赛事门户，参考路赛事人手录入')
     RETURNING id`,
    [SOURCE_NAME],
  );
  return inserted.rows[0].id;
}

async function upsertSeed(s: Seed, sourceId: string): Promise<"inserted" | "updated" | "skipped"> {
  const canonical = `hk-${s.slug}-${s.year}`;

  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM marathons WHERE canonical_name=$1 LIMIT 1",
    [canonical],
  );

  // Name-clash guard.
  const nameClash = await pool.query<{ id: string; canonical_name: string }>(
    "SELECT id, canonical_name FROM marathons WHERE name=$1 AND canonical_name<>$2 LIMIT 1",
    [s.name, canonical],
  );
  if (nameClash.rows[0] && !existing.rows[0]) {
    console.warn(
      `  ! skip name-clash ${canonical} → existing ${nameClash.rows[0].canonical_name}`,
    );
    return "skipped";
  }

  let marathonId: string;
  let action: "inserted" | "updated";
  if (existing.rows[0]) {
    marathonId = existing.rows[0].id;
    action = "updated";
    if (!DRY) {
      await pool.query(
        `UPDATE marathons SET
            name_zh = COALESCE(name_zh, $1),
            city = COALESCE(city, $2),
            city_zh = COALESCE(city_zh, $2),
            country = 'China',
            description = COALESCE(description, $3),
            website_url = COALESCE(website_url, $4),
            race_kind = $5,
            updated_at = now()
         WHERE id = $6`,
        [s.nameZh, s.city, s.description, s.websiteUrl, s.raceKind, marathonId],
      );
    }
  } else {
    if (DRY) {
      console.log(`  [dry] insert ${canonical} ${s.name}`);
      return "inserted";
    }
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO marathons
          (name, name_zh, canonical_name, city, city_zh, country,
           description, website_url, race_kind)
       VALUES($1,$2,$3,$4,$4,'China',$5,$6,$7)
       RETURNING id`,
      [s.name, s.nameZh, canonical, s.city, s.description, s.websiteUrl, s.raceKind],
    );
    marathonId = ins.rows[0].id;
    action = "inserted";
  }

  if (DRY) return action;

  const status = computeEditionStatus({ raceDate: s.raceDate });
  await pool.query(
    `INSERT INTO marathon_editions
        (marathon_id, year, race_date, status, distance_options,
         start_location, publish_status, published_at, last_synced_at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6,'published', now(), now())
     ON CONFLICT (marathon_id, year) DO UPDATE SET
        race_date = COALESCE(EXCLUDED.race_date, marathon_editions.race_date),
        status = EXCLUDED.status,
        distance_options = EXCLUDED.distance_options,
        start_location = COALESCE(EXCLUDED.start_location, marathon_editions.start_location),
        publish_status = 'published',
        last_synced_at = now(),
        updated_at = now()`,
    [
      marathonId,
      s.year,
      s.raceDate,
      status,
      JSON.stringify(s.distanceOptions),
      s.startLocation,
    ],
  );

  await pool.query(
    `INSERT INTO marathon_sources(marathon_id, source_id, source_url)
     VALUES($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [marathonId, sourceId, s.websiteUrl],
  );

  return action;
}

async function main() {
  console.log(`HK marathon seed — DRY=${DRY}`);
  const sourceId = DRY ? "dry-source" : await ensureSourceId();
  const stats = { inserted: 0, updated: 0, skipped: 0 };
  for (const s of SEEDS) {
    const r = await upsertSeed(s, sourceId);
    stats[r]++;
    console.log(`  ${r.padEnd(8)} hk-${s.slug}-${s.year} (${s.name})  date=${s.raceDate ?? "TBA"}`);
  }
  console.log("\n=== Summary ===");
  console.log(stats);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
