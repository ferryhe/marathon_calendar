/**
 * Bravelog (台灣) crawler — pulls Taiwan road-running races from
 * https://www.bravelog.tw via their `/search` endpoint.
 *
 * API:
 *   GET https://www.bravelog.tw/search?start=YYYY/MM/DD&end=YYYY/MM/DD
 *   Headers: X-Requested-With: XMLHttpRequest  (otherwise returns HTML)
 *   Returns:  { contestCount: N, contests: [...] }
 *
 *   Each contest has: uid (e.g. "2026051001"), title, start_date, city,
 *   township, address, tags ([10KM, 21KM, ...]), host, website, statusTag,
 *   is_passed, is_hide, is_delete, is_online, is_dor.
 *
 * Mapping to schema:
 *   marathons:
 *     canonical_name = `bravelog-{uid}`
 *     country = 'China'  (HK/Macau/Taiwan are normalized to China per
 *                         shared/utils.CHINA_COUNTRY_ALIASES)
 *     city  = `${city} (${township})`  (e.g. "臺北市 (信義區)")
 *     race_kind = 'trail' if any tag contains 越野/Trail, else 'marathon'
 *     website_url = upstream `website` if present, else /contest/{uid} page
 *   marathon_editions:
 *     race_date = first 10 chars of start_date (YYYY-MM-DD)
 *     distance_options = derived from tags
 *     status = computed from race_date via shared/status.computeEditionStatus
 *
 * Cross-source dedup: we do NOT auto-merge across sources. Each importer
 * writes only inside its own canonical_name namespace (`bravelog-*`), and
 * the name-clash guard in upsertContest() rejects new inserts that would
 * shadow an existing same-name row owned by another source. See
 * `.local/skills/crawler-overseas/SKILL.md` §5 for the rationale.
 *
 * We skip:
 *   - is_delete=1 (deleted upstream)
 *   - is_dor=true OR is_online=1 ("DOR / Online Run" virtual races — either
 *     flag alone is sufficient evidence the race is not in-person).
 *   - title OR tags carry triathlon markers (鐵人/Ironman/triathlon) and there
 *     is no plain KM running tag — Bravelog also lists triathlons; we keep
 *     the run/trail subset.
 *
 * Run:
 *   npx tsx script/import-bravelog.ts [--dry] [--year=2026] [--years=2026,2027]
 *
 * Env: DATABASE_URL or TARGET_DB_URL (e.g. PROD_DATABASE_URL).
 */
import "dotenv/config";
import { Pool } from "pg";
import { computeEditionStatus } from "../shared/status.js";

const DRY = process.argv.includes("--dry");
const YEARS = (() => {
  const m = process.argv.find((a) => a.startsWith("--years="));
  if (m) return m.split("=")[1].split(",").map((s) => parseInt(s, 10)).filter(Number.isFinite);
  const y = process.argv.find((a) => a.startsWith("--year="));
  if (y) return [parseInt(y.split("=")[1], 10)];
  // Default: current year + next year so we capture the rolling 18-month window.
  const cur = new Date().getFullYear();
  return [cur, cur + 1];
})();

const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

const SOURCE_NAME = "Bravelog 台灣賽事";
const UA = "Mozilla/5.0 (compatible; MarathonCalendarBravelogBot/1.0)";

interface BravelogContest {
  id: number;
  uid: string;
  title: string;
  start_date: string;
  city: string | null;
  township: string | null;
  address: string | null;
  host: string | null;
  website: string | null;
  facebook: string | null;
  tags: string[] | null;
  statusTag: string | null;
  is_passed: 0 | 1;
  is_hide: 0 | 1;
  is_delete: 0 | 1;
  is_online: 0 | 1;
  is_dor: boolean;
}

async function fetchSearch(year: number): Promise<BravelogContest[]> {
  const url = `https://www.bravelog.tw/search?start=${year}%2F01%2F01&end=${year}%2F12%2F31`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = (await res.json()) as { contests?: BravelogContest[]; contestCount?: number };
  return json.contests ?? [];
}

const TRAIL_TAG_RE = /越野|trail/i;
const TRIATHLON_RE = /鐵人|ironman|triathlon|113km|51\.5km/i;
const RUN_KM_RE = /^\d+(?:\.\d+)?\s*(?:KM|K|公里)$/i;

function classify(c: BravelogContest): { keep: boolean; raceKind: "marathon" | "trail"; reason?: string } {
  if (c.is_delete) return { keep: false, raceKind: "marathon", reason: "deleted" };
  if (c.is_dor || c.is_online) return { keep: false, raceKind: "marathon", reason: "online/DOR" };
  const tags = c.tags ?? [];
  // Trail detection: tags rarely carry "越野", but the race title almost
  // always does (e.g. "山羚羊越野", "鳴鳳越野"). Check both.
  const isTrail = tags.some((t) => TRAIL_TAG_RE.test(t)) || TRAIL_TAG_RE.test(c.title);
  if (isTrail) return { keep: true, raceKind: "trail" };
  // Triathlon: skip if title OR any tag matches the triathlon pattern, AND
  // there is no plain KM running tag to suggest it's a multi-event package
  // that includes a real run leg we'd want.
  const hasTri = tags.some((t) => TRIATHLON_RE.test(t)) || TRIATHLON_RE.test(c.title);
  const hasRun = tags.some((t) => RUN_KM_RE.test(t));
  if (hasTri && !hasRun) return { keep: false, raceKind: "marathon", reason: "triathlon" };
  return { keep: true, raceKind: "marathon" };
}

function parseDistances(tags: string[] | null): Array<{ kind: string }> {
  if (!tags) return [];
  const out: Array<{ kind: string }> = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const m = t.trim().match(/^(\d+(?:\.\d+)?)\s*(KM|K|公里|km)$/i);
    if (!m) continue;
    const km = parseFloat(m[1]);
    if (!Number.isFinite(km)) continue;
    // Canonical "<float>KM" with trailing zeros trimmed.
    const s = km.toFixed(2).replace(/\.?0+$/, "");
    const kind = `${s}KM`;
    if (!seen.has(kind)) {
      seen.add(kind);
      out.push({ kind });
    }
  }
  return out;
}

async function ensureSourceId(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM sources WHERE name=$1 LIMIT 1",
    [SOURCE_NAME],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO sources(name, type, strategy, base_url, priority, notes)
     VALUES($1, 'aggregator', 'JSON', 'https://www.bravelog.tw', 5,
            'Bravelog 台灣賽事計時與日歷，/search?start=YYYY/MM/DD&end=YYYY/MM/DD')
     RETURNING id`,
    [SOURCE_NAME],
  );
  return inserted.rows[0].id;
}

async function upsertContest(
  c: BravelogContest,
  raceKind: "marathon" | "trail",
  sourceId: string,
): Promise<"inserted" | "updated" | "skipped"> {
  const canonical = `bravelog-${c.uid}`;
  const detailUrl = `https://www.bravelog.tw/contest/${c.uid}`;
  const websiteUrl = (c.website && c.website.trim()) || detailUrl;
  const cityDisplay = c.township && c.city ? `${c.city}（${c.township}）` : c.city ?? null;
  const raceDate = c.start_date ? c.start_date.slice(0, 10) : null;
  const year = raceDate ? parseInt(raceDate.slice(0, 4), 10) : new Date().getFullYear();
  const distances = parseDistances(c.tags);
  const description = c.host ? `主辦：${c.host}` : null;

  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM marathons WHERE canonical_name=$1 LIMIT 1",
    [canonical],
  );

  // Name-clash guard (same convention as zuicool importer): never overwrite a
  // marathon row owned by another source's canonical_name.
  const nameClash = await pool.query<{ id: string; canonical_name: string }>(
    "SELECT id, canonical_name FROM marathons WHERE name=$1 AND canonical_name<>$2 LIMIT 1",
    [c.title, canonical],
  );
  if (nameClash.rows[0] && !existing.rows[0]) {
    console.warn(
      `  ! skip name-clash bravelog-${c.uid} → existing ${nameClash.rows[0].canonical_name} ('${c.title}')`,
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
        [c.title, cityDisplay, description, websiteUrl, raceKind, marathonId],
      );
    }
  } else {
    if (DRY) {
      console.log(`  [dry] insert ${raceKind.padEnd(8)} ${c.title} (${canonical})`);
      return "inserted";
    }
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO marathons
          (name, name_zh, canonical_name, city, city_zh, country,
           description, website_url, race_kind)
       VALUES($1,$1,$2,$3,$3,'China',$4,$5,$6)
       RETURNING id`,
      [c.title, canonical, cityDisplay, description, websiteUrl, raceKind],
    );
    marathonId = ins.rows[0].id;
    action = "inserted";
  }

  if (DRY) return action;

  const status = computeEditionStatus({ raceDate });
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
    [marathonId, year, raceDate, status, JSON.stringify(distances), c.address ?? null],
  );

  await pool.query(
    `INSERT INTO marathon_sources(marathon_id, source_id, source_url)
     VALUES($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [marathonId, sourceId, detailUrl],
  );

  return action;
}

async function main() {
  console.log(`Bravelog crawler — DRY=${DRY} years=${YEARS.join(",")}`);
  const sourceId = DRY ? "dry-source" : await ensureSourceId();
  const stats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const skipReasons: Record<string, number> = {};
  let processed = 0;

  for (const year of YEARS) {
    console.log(`\n=== Year ${year} ===`);
    let contests: BravelogContest[];
    try {
      contests = await fetchSearch(year);
    } catch (err) {
      console.error(`! search failed for ${year}: ${(err as Error).message}`);
      continue;
    }
    console.log(`  fetched ${contests.length} contests`);

    for (const c of contests) {
      processed++;
      const verdict = classify(c);
      if (!verdict.keep) {
        stats.skipped++;
        const r = verdict.reason ?? "other";
        skipReasons[r] = (skipReasons[r] ?? 0) + 1;
        continue;
      }
      try {
        const result = await upsertContest(c, verdict.raceKind, sourceId);
        stats[result]++;
        if (result === "inserted" || processed % 25 === 0) {
          console.log(
            `  [${processed}] ${result.padEnd(8)} ${verdict.raceKind.padEnd(8)} ${c.title}  ${c.start_date.slice(0, 10)}  ${c.city ?? ""}`,
          );
        }
      } catch (err) {
        stats.failed++;
        console.warn(`  ! ${c.uid} failed: ${(err as Error).message}`);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(stats);
  if (Object.keys(skipReasons).length) console.log("skip reasons:", skipReasons);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
