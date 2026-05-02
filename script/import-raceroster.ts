import * as fs from "fs";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const SOURCE_ID = "raceroster-001-international-2026";
const SOURCE_NAME = "Race Roster";
const SOURCE_BASE_URL = "https://raceroster.com";
const TSV = "/tmp/rr-events.tsv";

const NOISE = [
  /charity\s+(portal|partner|program)/i,
  /volunteer/i,
  /\bexpo\b/i,
  /\bvendors?\b/i,
  /shake\s*out|shakeout/i,
  /workout\s+wednesday/i,
  /pacer\s+team|expression\s+of\s+interest/i,
  /first.timer\s+program/i,
  /high\s+performance\s+application/i,
  /run\s+club|running\s+club/i,
  /corporate\s+challenge/i,
  /kick\s*off\s+run/i,
  /mental\s+health\s+and\s+addiction/i,
  /\bmini\s+marathon\b/i,
  /\bxc\s+#\d/i,
  /^bénévoles\s+-/i,
  /\b5\s*miler\b/i,
];
const HALF_RE = /\bdemi[\s-]?marathon\b/i;

interface Override {
  pattern: RegExp;
  city: string;
  country: string;
}
const COUNTRY_OVERRIDE: Override[] = [
  { pattern: /\basuncion\b.*paraguay/i, city: "Asunción", country: "Paraguay" },
  { pattern: /\blima\b.*peru/i, city: "Lima", country: "Peru" },
  { pattern: /\bsanta cruz\b.*bolivia/i, city: "Santa Cruz", country: "Bolivia" },
  { pattern: /\bbuenos aires\b.*argentina/i, city: "Buenos Aires", country: "Argentina" },
  { pattern: /\bbogota\b.*colombia/i, city: "Bogotá", country: "Colombia" },
  { pattern: /\bmontevideo\b.*uruguay/i, city: "Montevideo", country: "Uruguay" },
  { pattern: /\bbelize\b/i, city: "Belize City", country: "Belize" },
  { pattern: /\bcosta rica\b.*san jose|\bsan jose\b.*costa rica/i, city: "San José", country: "Costa Rica" },
  { pattern: /\bguatemala\b/i, city: "Guatemala City", country: "Guatemala" },
  { pattern: /\bmanagua\b.*nicaragua/i, city: "Managua", country: "Nicaragua" },
  { pattern: /\bsan salvador\b.*el salvador/i, city: "San Salvador", country: "El Salvador" },
  { pattern: /\btegucigalpa\b.*honduras/i, city: "Tegucigalpa", country: "Honduras" },
  { pattern: /\bmacau\b/i, city: "Macau", country: "Macau" },
  { pattern: /\btaiwan\b.*taipei|\btaipei\b.*taiwan/i, city: "Taipei", country: "Taiwan" },
  { pattern: /\bbrunei\b/i, city: "Bandar Seri Begawan", country: "Brunei" },
  { pattern: /\bkota kinabalu\b/i, city: "Kota Kinabalu", country: "Malaysia" },
  { pattern: /\bhangzhou\b/i, city: "Hangzhou", country: "China" },
  { pattern: /\bcancun\b/i, city: "Cancún", country: "Mexico" },
  { pattern: /\bquito\b.*ecuador/i, city: "Quito", country: "Ecuador" },
  { pattern: /\bburundi\b.*gitega/i, city: "Gitega", country: "Burundi" },
  { pattern: /\beswatini\b.*mbabane/i, city: "Mbabane", country: "Eswatini" },
  { pattern: /\bfreetown\b.*sierra leone/i, city: "Freetown", country: "Sierra Leone" },
  { pattern: /\blesotho\b.*maseru/i, city: "Maseru", country: "Lesotho" },
  { pattern: /\bluanda\b.*angola/i, city: "Luanda", country: "Angola" },
  { pattern: /\bmalawi\b.*lilongwe/i, city: "Lilongwe", country: "Malawi" },
  { pattern: /\bmauritania\b|\bnouakchott\b/i, city: "Nouakchott", country: "Mauritania" },
  { pattern: /\bmozambique\b.*maputo/i, city: "Maputo", country: "Mozambique" },
  { pattern: /\brwanda\b.*kigali/i, city: "Kigali", country: "Rwanda" },
  { pattern: /\bjohannesburg\b/i, city: "Johannesburg", country: "South Africa" },
  { pattern: /\btunisia\b.*tunis/i, city: "Tunis", country: "Tunisia" },
  { pattern: /\buganda\b.*kampala/i, city: "Kampala", country: "Uganda" },
  { pattern: /\bgrenada\b/i, city: "St. George's", country: "Grenada" },
  { pattern: /\bantigua and barbuda\b/i, city: "St John's", country: "Antigua and Barbuda" },
  { pattern: /\bmontserrat\b/i, city: "Plymouth", country: "Montserrat" },
  { pattern: /\bsaint vincent and the grenadines\b/i, city: "Argyle", country: "Saint Vincent and the Grenadines" },
  { pattern: /\bsint maarten|saint martin\b/i, city: "Simpson Bay", country: "Sint Maarten" },
  { pattern: /\bsaipan\b/i, city: "Saipan", country: "Northern Mariana Islands" },
];

// rr_id => existing marathon name (looked up at runtime for portability between DBs).
const EXISTING_MATCH_BY_NAME: Record<string, string> = {
  "112460": "2026柏林马拉松",
  "112119": "2026开普敦马拉松",
  "107288": "2026巴黎马拉松",
  "104215": "2026悉尼马拉松",
  "113541": "2026纽约城市马拉松",
  "111850": "2026芝加哥马拉松",
  "112763": "2026波尔多红酒马拉松",
};
const EXISTING_MATCH: Record<string, string> = {};

async function loadExistingMatchIds() {
  const names = Object.values(EXISTING_MATCH_BY_NAME);
  const r = await pool.query(
    `SELECT id, name FROM marathons WHERE name = ANY($1::text[])`,
    [names],
  );
  const byName = new Map<string, string>();
  for (const row of r.rows) byName.set(row.name, row.id);
  for (const [rrId, name] of Object.entries(EXISTING_MATCH_BY_NAME)) {
    const id = byName.get(name);
    if (id) EXISTING_MATCH[rrId] = id;
    else console.warn(`  WARN: no existing marathon named "${name}" — bind for rr=${rrId} will be skipped`);
  }
}

interface RrEvent {
  rrId: string;
  rrUrl: string;
  name: string;
  locality: string;
  country: string;
  countryCode: string;
  startDate: string;
  image: string;
  externalWebsite: string;
  description: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function loadTsv(): RrEvent[] {
  const raw = fs.readFileSync(TSV, "utf8").trim().split("\n");
  const headers = raw[0].split("\t");
  const rows: RrEvent[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cols = raw[i].split("\t");
    const obj: any = {};
    headers.forEach((h, idx) => (obj[h] = decodeEntities(cols[idx] ?? "")));
    rows.push(obj as RrEvent);
  }
  return rows;
}

function applyCountryOverride(ev: RrEvent): RrEvent {
  for (const o of COUNTRY_OVERRIDE) {
    if (o.pattern.test(ev.name)) {
      return { ...ev, locality: o.city, country: o.country };
    }
  }
  return ev;
}

function isNoise(name: string): string | null {
  if (HALF_RE.test(name)) return "half-marathon";
  for (const re of NOISE) if (re.test(name)) return `noise:${re.source.slice(0, 30)}`;
  return null;
}

function nameStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u00c0-\u024f]/g, (c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .replace(/\b(20\d{2}|19\d{2})\b/g, "")
    .replace(/\bmarathon\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Aggressive stem for dedup: also strip variant decorators that distinguish
// duplicate registration entries for the same race.
function dedupeStem(name: string): string {
  let s = nameStem(name);
  const VARIANT_WORDS = [
    "run for a reason",
    "international",
    "official",
    "weekend",
    "events",
    "event",
    "festival",
    "race",
    "day",
    "site",
    "annual",
    "marafun",
    "sun life",
    "beneva",
    "sunlife",
    "edition",
    "race weekend",
    "leg",
    "city",
  ];
  for (const w of VARIANT_WORDS) {
    s = s.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

function canonicalize(name: string, year: number): string {
  const stem = nameStem(name);
  const slug = stem
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return `${slug || "marathon"}-${year}-rr`;
}

const pool = new Pool({ connectionString: DB_URL });

async function ensureSource(): Promise<void> {
  const r = await pool.query(`SELECT id FROM sources WHERE id = $1`, [SOURCE_ID]);
  if (r.rowCount && r.rowCount > 0) {
    console.log(`  source ${SOURCE_ID} already exists.`);
    return;
  }
  if (!APPLY) {
    console.log(`  [dry-run] would insert source ${SOURCE_ID}`);
    return;
  }
  await pool.query(
    `INSERT INTO sources (id, name, type, base_url) VALUES ($1, $2, 'platform', $3)`,
    [SOURCE_ID, SOURCE_NAME, SOURCE_BASE_URL],
  );
  console.log(`  inserted source ${SOURCE_ID}`);
}

async function bindToExisting(ev: RrEvent, marathonId: string): Promise<"bound" | "skipped"> {
  const exists = await pool.query(
    `SELECT 1 FROM marathon_sources WHERE marathon_id = $1 AND source_id = $2`,
    [marathonId, SOURCE_ID],
  );
  if (exists.rowCount && exists.rowCount > 0) return "skipped";
  if (!APPLY) return "bound";
  await pool.query(
    `INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary) VALUES ($1, $2, $3, false)`,
    [marathonId, SOURCE_ID, ev.rrUrl],
  );
  return "bound";
}

// Returns {name, canonical} only if neither is in use — otherwise null,
// causing insert to skip. This makes the script safely idempotent on re-runs.
async function nameAvailable(name: string, canonical: string): Promise<{ name: string; canonical: string } | null> {
  const r = await pool.query(
    `SELECT 1 FROM marathons WHERE name = $1 OR canonical_name = $2`,
    [name, canonical],
  );
  if (r.rowCount && r.rowCount > 0) return null;
  return { name, canonical };
}

async function insertNew(ev: RrEvent): Promise<"inserted" | "skipped"> {
  const raceDate = ev.startDate.slice(0, 10);
  const year = parseInt(raceDate.slice(0, 4), 10);
  if (!year || year < 2025) return "skipped";
  const canon0 = canonicalize(ev.name, year);
  const avail = await nameAvailable(ev.name, canon0);
  if (!avail) return "skipped";
  if (!APPLY) return "inserted";
  const today = new Date().toISOString().slice(0, 10);
  const status =
    raceDate < today ? "已完赛" : "未开放";
  const desc = `${ev.name}, ${raceDate} 在 ${ev.locality || ev.country}（数据来源：Race Roster）`;
  // Wrap all 3 inserts in a transaction so a partial failure (e.g. on
  // edition or source insert) cannot leave an orphan marathon row.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insMarathon = await client.query(
      `INSERT INTO marathons (name, canonical_name, city, country, description, website_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        avail.name,
        avail.canonical,
        ev.locality || null,
        ev.country || null,
        desc,
        ev.externalWebsite || null,
      ],
    );
    const marathonId = insMarathon.rows[0].id as string;
    await client.query(
      `INSERT INTO marathon_editions (marathon_id, year, race_date, registration_status, registration_url, publish_status, published_at)
       VALUES ($1, $2, $3, $4, $5, 'published', now())`,
      [marathonId, year, raceDate, status, ev.rrUrl],
    );
    await client.query(
      `INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary) VALUES ($1, $2, $3, true)`,
      [marathonId, SOURCE_ID, ev.rrUrl],
    );
    await client.query("COMMIT");
    return "inserted";
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`Race Roster import (${APPLY ? "APPLY" : "DRY-RUN"})`);
  await ensureSource();
  await loadExistingMatchIds();

  const rawEvents = loadTsv();
  console.log(`Loaded ${rawEvents.length} events from TSV.`);

  // Apply country override + decode + filter
  const stages = {
    noise: 0,
    halfMarathon: 0,
    dupSeries: 0,
    boundExisting: 0,
    bindAlready: 0,
    inserted: 0,
    insertSkipped: 0,
  };

  const seen = new Set<string>();
  const cleaned: RrEvent[] = [];
  for (const raw of rawEvents) {
    const ev = applyCountryOverride(raw);
    const why = isNoise(ev.name);
    if (why === "half-marathon") {
      stages.halfMarathon++;
      continue;
    }
    if (why) {
      stages.noise++;
      continue;
    }
    // Dedupe by aggressive stem + locality (loose) + date
    const looseLocality = ev.locality
      .toLowerCase()
      .replace(/[^a-z]+/g, "")
      .slice(0, 6);
    const key = `${dedupeStem(ev.name)}|${looseLocality}|${ev.startDate.slice(0, 10)}`;
    if (seen.has(key)) {
      stages.dupSeries++;
      continue;
    }
    seen.add(key);
    cleaned.push(ev);
  }
  console.log(`After filters: ${cleaned.length} events to process.`);
  console.log(
    `  filtered: noise=${stages.noise} half-marathon=${stages.halfMarathon} dup=${stages.dupSeries}`,
  );

  for (const ev of cleaned) {
    const existing = EXISTING_MATCH[ev.rrId];
    if (existing) {
      const r = await bindToExisting(ev, existing);
      if (r === "bound") {
        stages.boundExisting++;
        console.log(`  bind→existing: ${ev.name} → ${existing}`);
      } else stages.bindAlready++;
      continue;
    }
    const r = await insertNew(ev);
    if (r === "inserted") {
      stages.inserted++;
      console.log(`  +insert: ${ev.name} (${ev.locality}, ${ev.country}) ${ev.startDate.slice(0, 10)}`);
    } else stages.insertSkipped++;
  }

  console.log("\n=== Summary ===");
  console.log(stages);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
