/**
 * European trail-run crawler for ITRA (International Trail Running Association).
 *
 * Source map:
 *   Search form:   POST https://itra.run/Races/RaceCalendar
 *                  Body (urlencoded, anti-forgery token + session cookie required):
 *                    __RequestVerificationToken=...
 *                    Input.Country=FR (repeatable; ISO-2)
 *                    Input.DateValue=5  (1=7d, 2=30d, 3=3mo, 4=6mo, 5=12mo)
 *                    Input.isDateFilterApplied=true
 *                    Input.NationalLeagues=false
 *                    Input.NationalLeague=false
 *   Bootstrap GET https://itra.run/Races/RaceCalendar  → token + cookies
 *
 * Response is server-rendered HTML containing:
 *   var raceSearchJsonSidePopupNew = [ ["<div class='center-block1'>...</div>"], ... ];
 * Each entry is a single-element array whose string is one event card. Per card
 * we extract:
 *   - parent event id+slug+year   ← first <a href='/Races/RaceDetails/{slug}/{year}/{id}'> wrapping <h4>
 *   - name                         ← <h4>{name}</h4>
 *   - date                         ← <div class='date'><span>DD</span> Mon<d></d> YYYY</div>
 *   - city                         ← <div class='location'>City, CCC<img …flags/cc.svg…>
 *   - country                      ← cc.svg → ISO-2 → display name
 *   - distance options             ← every <div class='count'>NN.N k</div>
 *
 * Per matched event we upsert:
 *   marathons         (race_kind='trail', country=mapped from ISO-2,
 *                      canonical_name='itra-{id}')
 *   marathon_editions (race_date, distance_options, status='upcoming'/'ended')
 *   marathon_sources  (link to https://itra.run/Races/RaceDetails/{slug}/{year}/{id})
 *
 * Run:
 *   npx tsx script/import-itra-trail.ts [--dry] [--limit=N] [--skip-existing]
 *                                       [--countries=FR,IT,ES,...] [--window=5]
 *   DATABASE_URL=$PROD_DATABASE_URL npx tsx script/import-itra-trail.ts --skip-existing
 */
import "dotenv/config";
import { Pool } from "pg";

const DRY = process.argv.includes("--dry");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const WINDOW = (() => {
  const m = process.argv.find((a) => a.startsWith("--window="));
  return m ? m.split("=")[1] : "5"; // 5 = next 12 months
})();

// Default = "Europe" (broad: EU + EEA + UK + Balkans + Caucasus + Turkey).
// Override with --countries=FR,IT,…
const DEFAULT_COUNTRIES = [
  "FR", "IT", "ES", "DE", "CH", "AT", "GB", "IE", "BE", "NL", "LU",
  "PT", "CZ", "PL", "HU", "RO", "BG", "GR", "HR", "SI", "SK",
  "NO", "SE", "FI", "DK", "IS", "EE", "LV", "LT",
  "RS", "ME", "MK", "BA", "AL", "MT", "CY", "AD", "MC", "SM", "LI",
  "FO", "GI", "GE", "AM", "AZ", "MD", "UA", "TR",
];
const COUNTRIES = (() => {
  const m = process.argv.find((a) => a.startsWith("--countries="));
  return m ? m.split("=")[1].split(",").map((s) => s.trim().toUpperCase()) : DEFAULT_COUNTRIES;
})();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

const UA = "Mozilla/5.0 (compatible; MarathonCalendarTrailBot/1.0)";
const SOURCE_NAME = "ITRA (international trail)";
const BASE = "https://itra.run";

// ISO-2 → display name. ITRA covers Europe-heavy + global.
const COUNTRY_MAP: Record<string, string> = {
  FR: "France", IT: "Italy", ES: "Spain", DE: "Germany", CH: "Switzerland",
  AT: "Austria", GB: "UK", IE: "Ireland", BE: "Belgium", NL: "Netherlands",
  LU: "Luxembourg", PT: "Portugal", CZ: "Czech Republic", PL: "Poland",
  HU: "Hungary", RO: "Romania", BG: "Bulgaria", GR: "Greece", HR: "Croatia",
  SI: "Slovenia", SK: "Slovakia", NO: "Norway", SE: "Sweden", FI: "Finland",
  DK: "Denmark", IS: "Iceland", EE: "Estonia", LV: "Latvia", LT: "Lithuania",
  RS: "Serbia", ME: "Montenegro", MK: "North Macedonia", BA: "Bosnia and Herzegovina",
  AL: "Albania", MT: "Malta", CY: "Cyprus", AD: "Andorra", MC: "Monaco",
  SM: "San Marino", LI: "Liechtenstein", FO: "Faroe Islands", GI: "Gibraltar",
  GE: "Georgia", AM: "Armenia", AZ: "Azerbaijan", MD: "Moldova",
  UA: "Ukraine", BY: "Belarus", TR: "Turkey",
  // Non-EU but possible:
  US: "USA", CA: "Canada", AU: "Australia", NZ: "New Zealand",
  JP: "Japan", KR: "South Korea", CN: "China", HK: "Hong Kong", TW: "Taiwan",
  ZA: "South Africa", MA: "Morocco", BR: "Brazil", AR: "Argentina", MX: "Mexico",
  TH: "Thailand", MY: "Malaysia", SG: "Singapore", PH: "Philippines",
  IN: "India", ID: "Indonesia", VN: "Vietnam",
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  january: "01", february: "02", march: "03", april: "04", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

interface Card {
  itraId: string;
  slug: string;
  year: number;
  url: string;
  name: string;
  raceDate: string | null;
  city: string | null;
  countryIso: string | null;
  country: string;
  distanceOptions: Array<{ kind: string }>;
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

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

/** Fetch the calendar bootstrap page → return {token, cookieJar}. */
async function bootstrapSession(): Promise<{ token: string; cookies: string }> {
  const res = await fetch(`${BASE}/Races/RaceCalendar`, {
    headers: { "User-Agent": UA },
  });
  const html = await res.text();
  // Pull all Set-Cookie headers; node-fetch puts them comma-joined. We use the
  // raw header iterator if available.
  const setCookieHeaders: string[] = [];
  // @ts-ignore - getSetCookie exists on undici Headers in modern Node.
  if (typeof res.headers.getSetCookie === "function") {
    // @ts-ignore
    setCookieHeaders.push(...res.headers.getSetCookie());
  } else {
    const raw = res.headers.get("set-cookie");
    if (raw) setCookieHeaders.push(raw);
  }
  const cookies = setCookieHeaders
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  const tokenMatch = html.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
  );
  if (!tokenMatch) throw new Error("ITRA: failed to extract anti-forgery token");
  return { token: tokenMatch[1], cookies };
}

/** POST search form for one ISO-2 country. Returns the response HTML. */
async function searchCountry(
  iso: string,
  session: { token: string; cookies: string },
): Promise<string> {
  const body = new URLSearchParams();
  body.append("__RequestVerificationToken", session.token);
  body.append("Input.Country", iso);
  body.append("Input.DateValue", WINDOW);
  body.append("Input.isDateFilterApplied", "true");
  body.append("Input.NationalLeagues", "false");
  body.append("Input.NationalLeague", "false");
  const res = await fetch(`${BASE}/Races/RaceCalendar`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: session.cookies,
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`ITRA POST ${iso}: HTTP ${res.status}`);
  return await res.text();
}

/** Extract the inline `raceSearchJsonSidePopupNew = [ [...html...], ... ]`
 *  array. Each entry is a 1-elem array of HTML. */
function extractCardHtmls(html: string): string[] {
  const m = html.match(/var\s+raceSearchJsonSidePopupNew\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (!m) return [];
  const arrBody = m[1];
  // Each card is `[ "...html..." ]` on its own line. The HTML is single-quoted
  // *inside*, JS-doublequoted outside.  We split on the boundary.
  const out: string[] = [];
  const cardRe = /\[\s*"([\s\S]*?)"\s*\](?:,|\s*$)/g;
  for (const c of arrBody.matchAll(cardRe)) {
    // Unescape JS string: \" → "
    const raw = c[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    out.push(raw);
  }
  return out;
}

function parseDate(html: string): string | null {
  const m = html.match(
    /<div class=["']date["']><span>(\d{1,2})<\/span>\s*([A-Za-z]+)<d><\/d>\s*(\d{4})/,
  );
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${day}`;
}

function parseLocation(html: string): { city: string | null; iso: string | null } {
  const m = html.match(
    /<div class=["']location["']>([^<]+?)<img\s+src=["']\/images\/CountryFlags\/([a-z]{2})\.svg["']/,
  );
  if (!m) return { city: null, iso: null };
  const text = decodeEntities(m[1]).replace(/,\s*[A-Z]{2,3}\s*$/, "").trim();
  return { city: text || null, iso: m[2].toUpperCase() };
}

/** Find the *parent* event link — the first `<a>` that wraps an `<h4>`. */
function parseParentLink(html: string): {
  url: string;
  slug: string;
  year: number;
  id: string;
  name: string;
} | null {
  const m = html.match(
    /<a\s+href=["'](\/Races\/RaceDetails\/([^/]+)\/(\d{4})\/(\d+))["']\s+target=["']_blank["']>\s*<h4\s*>([\s\S]*?)<\/h4\s*>/,
  );
  if (!m) return null;
  return {
    url: BASE + m[1],
    slug: m[2],
    year: parseInt(m[3], 10),
    id: m[4],
    name: stripTags(m[5]),
  };
}

function parseDistances(html: string): Array<{ kind: string }> {
  const out: Array<{ kind: string }> = [];
  const seen = new Set<string>();
  // Each <div class='count'>NN[.N] k</div>. ITRA always uses kilometres.
  const re = /<div class=["']count["']>\s*(\d+(?:\.\d+)?)\s*k\s*<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const km = parseFloat(m[1]);
    if (!Number.isFinite(km)) continue;
    const s = km.toFixed(2).replace(/\.?0+$/, "");
    const kind = `${s}KM`;
    if (!seen.has(kind)) {
      seen.add(kind);
      out.push({ kind });
    }
  }
  return out;
}

function parseCard(cardHtml: string, queriedIso: string): Card | null {
  const link = parseParentLink(cardHtml);
  if (!link) return null;
  const date = parseDate(cardHtml);
  const loc = parseLocation(cardHtml);
  const distances = parseDistances(cardHtml);
  const iso = loc.iso ?? queriedIso;
  const country = COUNTRY_MAP[iso] ?? iso;
  return {
    itraId: link.id,
    slug: link.slug,
    year: link.year,
    url: link.url,
    name: link.name,
    raceDate: date,
    city: loc.city,
    countryIso: iso,
    country,
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
     VALUES($1, 'aggregator', 'HTML', 'https://itra.run', 7,
            'ITRA Race Calendar — anti-forgery POST search per ISO-2 country')
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

async function upsertEvent(
  ev: Card,
  sourceId: string,
): Promise<"inserted" | "updated" | "skipped"> {
  const canonical = `itra-${ev.itraId}`;
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM marathons WHERE canonical_name=$1 LIMIT 1",
    [canonical],
  );
  if (SKIP_EXISTING && existing.rows[0]) return "skipped";

  // Refuse to overwrite a row registered under another canonical name.
  const nameClash = await pool.query<{ canonical_name: string }>(
    "SELECT canonical_name FROM marathons WHERE name=$1 AND canonical_name<>$2 LIMIT 1",
    [ev.name, canonical],
  );
  if (nameClash.rows[0]) {
    console.warn(`  ! skip name-clash itra-${ev.itraId} → ${nameClash.rows[0].canonical_name}`);
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
            city = COALESCE(city, $1),
            country = COALESCE(country, $2),
            website_url = COALESCE(website_url, $3),
            race_kind = 'trail',
            updated_at = now()
         WHERE id = $4`,
        [ev.city, ev.country, ev.url, marathonId],
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
      [ev.name, canonical, ev.city, ev.country, ev.url],
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
  console.log(
    `ITRA trail crawler — DRY=${DRY} WINDOW=${WINDOW} COUNTRIES=${COUNTRIES.length} LIMIT=${LIMIT}`,
  );
  const sourceId = DRY ? "dry-source" : await ensureSourceId();

  // 1) Fetch every country's HTML, parse cards. ITRA returns the same race
  //    multiple times if the host country borders the queried country (rare).
  //    We deduplicate by itraId.
  const cards = new Map<string, Card>();
  for (const iso of COUNTRIES) {
    let html: string;
    let session: { token: string; cookies: string };
    try {
      session = await bootstrapSession();
      html = await searchCountry(iso, session);
    } catch (err) {
      console.warn(`! ${iso}: ${(err as Error).message}`);
      continue;
    }
    const cardHtmls = extractCardHtmls(html);
    let kept = 0;
    for (const ch of cardHtmls) {
      const card = parseCard(ch, iso);
      if (!card) continue;
      if (!cards.has(card.itraId)) {
        cards.set(card.itraId, card);
        kept++;
      }
    }
    const totalEv = html.match(/<strong>(\d+)<\/strong>\s+events/);
    console.log(
      `  ${iso}: cards=${cardHtmls.length} new=${kept} (server-reported ${totalEv?.[1] ?? "?"} events)`,
    );
    await sleep(400); // be polite
  }
  const all = [...cards.values()];
  console.log(`Total unique candidates: ${all.length}`);

  let already: Set<string> | null = null;
  if (SKIP_EXISTING && !DRY) {
    const r = await pool.query<{ canonical_name: string }>(
      `SELECT canonical_name FROM marathons WHERE canonical_name LIKE 'itra-%'`,
    );
    already = new Set(r.rows.map((x) => x.canonical_name.replace(/^itra-/, "")));
    console.log(`Skipping ${already.size} already-imported events`);
  }

  const targets = all.slice(0, LIMIT);
  const stats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  let i = 0;
  for (const ev of targets) {
    i++;
    if (already?.has(ev.itraId)) {
      stats.skipped++;
      continue;
    }
    try {
      const result = await upsertEvent(ev, sourceId);
      stats[result]++;
      if (i % 100 === 0 || result === "inserted") {
        console.log(
          `[${i}/${targets.length}] ${result.padEnd(8)} ${ev.name}  ${ev.raceDate ?? "?"}  ${ev.country}  ${ev.distanceOptions.length}×距离`,
        );
      }
    } catch (err) {
      stats.failed++;
      console.warn(`  ! ${ev.itraId} failed: ${(err as Error).message}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(stats);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
