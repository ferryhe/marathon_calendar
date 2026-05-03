/**
 * International trail-run crawler for raceroster.com.
 *
 * Source map:
 *   Sitemap idx:  https://sitemap.raceroster.com/sitemaps/sitemap.xml
 *   Per-year:     https://sitemap.raceroster.com/sitemaps/events_{YYYY}.xml
 *                 → 17k+ event URLs per year. URL pattern:
 *                   https://raceroster.com/events/{year}/{id}/{slug}
 *   Filter:       slug must contain trail|ultra|skyrun|sky-run|sky-race|
 *                 fell-race|backyard so we narrow to trail-specific events
 *                 (gives ~330 candidates across 2026+2027).
 *   Detail page (HTML, server-rendered):
 *     - <meta property="og:title" content="{year} — {name} —">
 *     - <meta property="og:description" content="{name} {address} - ...desc... - {Month D, YYYY}">
 *     - JSON-LD-ish blob with "addressLocality", "addressRegion",
 *       "addressCountry" (ISO-2), "startDate" "YYYY-MM-DDTHH:MM:SS±ZZ:ZZ"
 *
 * Per matched event we upsert:
 *   marathons         (race_kind='trail', country=mapped from ISO-2,
 *                      canonical_name='raceroster-{id}')
 *   marathon_editions (race_date, distance_options derived from name,
 *                      status='upcoming'/'ended')
 *   marathon_sources  (links to detail URL)
 *
 * Run:
 *   npx tsx script/import-raceroster-trail.ts [--dry] [--limit=N] [--skip-existing] [--years=2026,2027]
 *   DATABASE_URL=$PROD_DATABASE_URL npx tsx script/import-raceroster-trail.ts --skip-existing
 */
import "dotenv/config";
import { Pool } from "pg";

const DRY = process.argv.includes("--dry");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const OFFSET = (() => {
  const m = process.argv.find((a) => a.startsWith("--offset="));
  return m ? parseInt(m.split("=")[1], 10) : 0;
})();
const YEARS = (() => {
  const m = process.argv.find((a) => a.startsWith("--years="));
  return m ? m.split("=")[1].split(",").map((s) => s.trim()) : ["2026", "2027"];
})();
const URL_CACHE = "/tmp/raceroster_trail_urls.txt";
const TRAIL_SLUG_RE = /(trail|ultra|skyrun|sky-run|sky-race|fell-race|backyard|vertical-k|vk-race)/i;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

const UA = "Mozilla/5.0 (compatible; MarathonCalendarTrailBot/1.0)";
const SOURCE_NAME = "Race Roster (international trail)";

// ISO-2 → display name. Race Roster's footprint is mostly Anglosphere.
const COUNTRY_MAP: Record<string, string> = {
  US: "USA",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  GB: "UK",
  IE: "Ireland",
  ZA: "South Africa",
  IN: "India",
  PH: "Philippines",
  SG: "Singapore",
  HK: "Hong Kong",
  TW: "Taiwan",
  JP: "Japan",
  KR: "South Korea",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  CH: "Switzerland",
  AT: "Austria",
  NL: "Netherlands",
  BE: "Belgium",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  PT: "Portugal",
  CZ: "Czech Republic",
  IS: "Iceland",
  CN: "China",
  MY: "Malaysia",
  TT: "Trinidad and Tobago",
  MP: "Northern Mariana Islands",
  VN: "Vietnam",
  TH: "Thailand",
  ID: "Indonesia",
  KE: "Kenya",
  ET: "Ethiopia",
  MA: "Morocco",
  EG: "Egypt",
  PE: "Peru",
  CL: "Chile",
  CO: "Colombia",
  CR: "Costa Rica",
  PA: "Panama",
  EC: "Ecuador",
  UY: "Uruguay",
};

interface ParsedEvent {
  rrId: string;
  url: string;
  name: string;
  raceDate: string | null; // YYYY-MM-DD
  year: number;
  city: string | null;
  region: string | null; // state / province
  country: string; // mapped display name; falls back to "International"
  websiteUrl: string;
  distanceOptions: Array<{ kind: string; capacity?: number }>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*/?>`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  const re2 = new RegExp(
    `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]*property=["']${prop}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : null;
}

/** og:title format: "{year} — {name} —"  (em-dash, with trailing dash). */
function parseName(ogTitle: string): string {
  // Strip optional "{year} — " prefix and trailing " —" or " — "
  let s = ogTitle
    .replace(/^\s*\d{4}\s*[—–-]\s*/, "")
    .replace(/\s*[—–-]\s*$/, "")
    .trim();
  return s || ogTitle.trim();
}

/** ISO-8601 startDate from inline JSON. */
function parseDate(html: string): string | null {
  const m = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseLocation(html: string): { city: string | null; region: string | null; country: string } {
  const city = html.match(/"addressLocality"\s*:\s*"([^"]+)"/);
  const region = html.match(/"addressRegion"\s*:\s*"([^"]+)"/);
  const cc = html.match(/"addressCountry"\s*:\s*"([A-Z]{2})"/);
  const code = cc ? cc[1] : null;
  return {
    city: city ? decodeEntities(city[1]).trim() : null,
    region: region ? decodeEntities(region[1]).trim() : null,
    country: code ? COUNTRY_MAP[code] ?? code : "International",
  };
}

/** Convert km/k/公里 (1:1) and mile/miles/mi/英里 (× 1.609344) to canonical
 *  "<float>KM" with 2dp rounded and trailing zeros trimmed. */
function toKm(value: string, unit: string): string | null {
  const u = unit.toLowerCase();
  let km: number;
  if (u === "km" || u === "k" || u === "公里") km = parseFloat(value);
  else if (u === "mile" || u === "miles" || u === "mi" || u === "英里") km = parseFloat(value) * 1.609344;
  else return null;
  if (!Number.isFinite(km)) return null;
  const s = km.toFixed(2).replace(/\.?0+$/, "");
  return `${s}KM`;
}

/** Parse distance options from event name + slug. Slug carries the most
 *  exhaustive enumeration ("…-50k-25k-10k-5k"); name is the human label. */
function parseDistances(name: string, slug: string): Array<{ kind: string }> {
  const text = `${name} ${slug.replace(/-/g, " ")}`.toLowerCase();
  const out: Array<{ kind: string }> = [];
  const seen = new Set<string>();
  const push = (kind: string) => {
    if (!seen.has(kind)) {
      seen.add(kind);
      out.push({ kind });
    }
  };

  // Numeric distances with unit. Require word-boundary on both sides so we
  // don't pick up "100 mile" inside "100 milestone" etc.
  const numRe = /\b(\d+(?:\.\d+)?)\s*(km|k|公里|miles?|mi|英里)\b/g;
  for (const m of text.matchAll(numRe)) {
    const km = toKm(m[1], m[2]);
    if (km) push(km);
  }

  // Word-form distances. We strip "half marathon" first so that the leftover
  // "marathon" check only fires for full-marathon mentions.
  const hasHalf = /\bhalf[- ]marathon\b|\bhalf[- ]mara\b/.test(text);
  if (hasHalf) push("21.1KM");
  const stripped = text.replace(/\bhalf[- ]marathon\b|\bhalf[- ]mara\b/g, "");
  if (/\b(?:full[- ])?marathon\b/.test(stripped)) push("42.2KM");
  if (/\b(?:50[- ]?mile|50[- ]?miler)\b/.test(text)) push("80.47KM");
  if (/\b(?:100[- ]?mile|100[- ]?miler)\b/.test(text)) push("160.93KM");
  if (/\b(?:200[- ]?mile|200[- ]?miler)\b/.test(text)) push("321.87KM");
  if (/\bbackyard\b/.test(text)) push("backyard");
  if (/\bvertical[- ]k\b|\bVK\b/i.test(text)) push("vertical-K");

  return out;
}

async function listTrailEventUrls(): Promise<Array<{ id: string; year: string; slug: string; url: string }>> {
  // Use 24h cache to avoid re-fetching multi-MB sitemaps every run.
  try {
    const fs = await import("fs");
    const stat = fs.statSync(URL_CACHE);
    if (Date.now() - stat.mtimeMs < 24 * 3600_000) {
      const lines = fs.readFileSync(URL_CACHE, "utf8").split("\n").filter(Boolean);
      console.log(`Using cached URL list (${lines.length} entries)`);
      return lines.map(parseUrlLine).filter((x): x is NonNullable<typeof x> => !!x);
    }
  } catch {
    /* no cache yet */
  }
  const urls: string[] = [];
  for (const year of YEARS) {
    const sm = `https://sitemap.raceroster.com/sitemaps/events_${year}.xml`;
    let xml: string;
    try {
      xml = await fetchText(sm);
    } catch (err) {
      console.warn(`! sitemap ${year} failed: ${(err as Error).message}`);
      continue;
    }
    const re = /<loc>(https:\/\/raceroster\.com\/events\/\d{4}\/\d+\/[a-z0-9_-]+)<\/loc>/g;
    const all = [...xml.matchAll(re)].map((m) => m[1]);
    // Drop sub-pages (.../participants, .../sponsors etc.) — keep root URLs only.
    const roots = all.filter((u) => /\/events\/\d{4}\/\d+\/[a-z0-9_-]+$/.test(u));
    const trail = roots.filter((u) => TRAIL_SLUG_RE.test(u));
    console.log(`year ${year}: ${roots.length} events, ${trail.length} trail-keyword`);
    urls.push(...trail);
  }
  const uniq = [...new Set(urls)];
  try {
    const fs = await import("fs");
    fs.writeFileSync(URL_CACHE, uniq.join("\n"));
  } catch {
    /* non-fatal */
  }
  return uniq.map(parseUrlLine).filter((x): x is NonNullable<typeof x> => !!x);
}

function parseUrlLine(url: string): { id: string; year: string; slug: string; url: string } | null {
  const m = url.match(/\/events\/(\d{4})\/(\d+)\/([a-z0-9_-]+)$/);
  if (!m) return null;
  return { year: m[1], id: m[2], slug: m[3], url };
}

async function parseEvent(item: { id: string; year: string; slug: string; url: string }): Promise<ParsedEvent | null> {
  const html = await fetchText(item.url);
  const ogTitle = metaContent(html, "og:title");
  if (!ogTitle) return null;
  const name = parseName(ogTitle);
  // Reject if neither name nor slug actually contains a trail keyword. Keeps
  // out false positives where the slug only mentioned "trail" as part of a
  // venue name (e.g. "trailhead-fun-run").
  if (!TRAIL_SLUG_RE.test(`${name} ${item.slug}`)) return null;
  const raceDate = parseDate(html);
  const loc = parseLocation(html);
  const distances = parseDistances(name, item.slug);
  return {
    rrId: item.id,
    url: item.url,
    name,
    raceDate,
    year: parseInt(item.year, 10),
    city: loc.city,
    region: loc.region,
    country: loc.country,
    websiteUrl: item.url,
    distanceOptions: distances,
  };
}

async function ensureSourceId(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM sources WHERE name=$1 LIMIT 1",
    [SOURCE_NAME],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO sources(name, type, strategy, base_url, priority, notes)
     VALUES($1, 'aggregator', 'HTML', 'https://raceroster.com', 6,
            'Race Roster sitemap-driven international trail-run feed')
     RETURNING id`,
    [SOURCE_NAME],
  );
  return inserted.rows[0].id;
}

function computeStatus(raceDate: string | null): string {
  if (!raceDate) return "upcoming";
  const today = new Date().toISOString().slice(0, 10);
  return raceDate >= today ? "upcoming" : "ended";
}

async function upsertEvent(ev: ParsedEvent, sourceId: string): Promise<"inserted" | "updated" | "skipped"> {
  const canonical = `raceroster-${ev.rrId}`;
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM marathons WHERE canonical_name=$1 LIMIT 1",
    [canonical],
  );
  if (SKIP_EXISTING && existing.rows[0]) return "skipped";

  // Refuse to overwrite a row that already exists under a different canonical
  // (prevents flipping a road marathon to trail via name collision).
  const nameClash = await pool.query<{ canonical_name: string }>(
    "SELECT canonical_name FROM marathons WHERE name=$1 AND canonical_name<>$2 LIMIT 1",
    [ev.name, canonical],
  );
  if (nameClash.rows[0]) {
    console.warn(`  ! skip name-clash raceroster-${ev.rrId} → ${nameClash.rows[0].canonical_name}`);
    return "skipped";
  }

  const cityDisplay = ev.city && ev.region
    ? `${ev.city}, ${ev.region}`
    : ev.city ?? ev.region ?? null;

  let marathonId: string;
  let action: "inserted" | "updated";
  if (existing.rows[0]) {
    marathonId = existing.rows[0].id;
    action = "updated";
    if (!DRY) {
      await pool.query(
        `UPDATE marathons SET
            city = COALESCE(city, $1),
            country = COALESCE(country, $2),
            website_url = COALESCE(website_url, $3),
            race_kind = 'trail',
            updated_at = now()
         WHERE id = $4`,
        [cityDisplay, ev.country, ev.websiteUrl, marathonId],
      );
    }
  } else {
    if (DRY) {
      console.log(`  [dry] insert ${ev.name} (${canonical}) ${ev.country} ${ev.raceDate ?? "?"}`);
      return "inserted";
    }
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO marathons
          (name, canonical_name, city, country, website_url, race_kind)
       VALUES($1,$2,$3,$4,$5,'trail')
       RETURNING id`,
      [ev.name, canonical, cityDisplay, ev.country, ev.websiteUrl],
    );
    marathonId = ins.rows[0].id;
    action = "inserted";
  }

  const status = computeStatus(ev.raceDate);
  await pool.query(
    `INSERT INTO marathon_editions
        (marathon_id, year, race_date, status, distance_options,
         publish_status, published_at, last_synced_at)
     VALUES($1,$2,$3,$4,$5::jsonb,'published', now(), now())
     ON CONFLICT (marathon_id, year) DO UPDATE SET
        race_date = COALESCE(EXCLUDED.race_date, marathon_editions.race_date),
        status = EXCLUDED.status,
        distance_options = EXCLUDED.distance_options,
        publish_status = 'published',
        last_synced_at = now(),
        updated_at = now()`,
    [
      marathonId,
      ev.year,
      ev.raceDate,
      status,
      JSON.stringify(ev.distanceOptions),
    ],
  );

  await pool.query(
    `INSERT INTO marathon_sources(marathon_id, source_id, source_url)
     VALUES($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [marathonId, sourceId, ev.url],
  );
  return action;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`raceroster trail crawler — DRY=${DRY} LIMIT=${LIMIT} YEARS=${YEARS.join(",")}`);
  const sourceId = DRY ? "dry-source" : await ensureSourceId();
  const candidates = await listTrailEventUrls();
  console.log(`Total trail-keyword candidates: ${candidates.length}`);
  const targets = candidates.slice(OFFSET, OFFSET + LIMIT);
  console.log(`Processing ${targets.length} (offset=${OFFSET})`);

  let already: Set<string> | null = null;
  if (SKIP_EXISTING && !DRY) {
    const r = await pool.query<{ canonical_name: string }>(
      `SELECT canonical_name FROM marathons WHERE canonical_name LIKE 'raceroster-%'`,
    );
    already = new Set(r.rows.map((x) => x.canonical_name.replace(/^raceroster-/, "")));
    console.log(`Skipping ${already.size} already-imported events`);
  }

  const stats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const CONCURRENCY = 5;
  const pending = [...targets];
  let processed = 0;
  async function worker() {
    while (pending.length) {
      const item = pending.shift();
      if (!item) break;
      processed++;
      const i = processed;
      if (already?.has(item.id)) {
        stats.skipped++;
        continue;
      }
      try {
        const ev = await parseEvent(item);
        if (!ev) {
          stats.failed++;
          continue;
        }
        const result = await upsertEvent(ev, sourceId);
        stats[result]++;
        if (i % 50 === 0 || result === "inserted") {
          console.log(
            `[${i}/${targets.length}] ${result.padEnd(8)} ${ev.name}  ${ev.raceDate ?? "?"}  ${ev.country}  ${ev.distanceOptions.length}×距离`,
          );
        }
      } catch (err) {
        stats.failed++;
        console.warn(`  ! ${item.id} failed: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log("\n=== Summary ===");
  console.log(stats);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
