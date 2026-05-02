import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const SOURCE_ID = "raceroster-001-international-2026";
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 12000;

const BLACKLIST = [
  "raceroster.com",
  "cdn.raceroster",
  "google.com/maps",
  "goo.gl/maps",
  "maps.app.goo.gl",
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com/intent",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "strava.com",
  "linkedin.com",
  "tiktok.com",
  "mailto:",
  "tel:",
  // Route/map platforms — not official race sites
  "gaiagps.com",
  "strava.app.link",
  "alltrails.com",
  "mapmyrun.com",
  "ridewithgps.com",
  // Generic registration aggregators (org pages already covered when no overlap)
  "runsignup.com/race/search",
  "active.com/search",
];

function isAcceptable(href: string): boolean {
  if (!href || href.length > 250) return false;
  const lower = href.toLowerCase();
  if (BLACKLIST.some((b) => lower.includes(b))) return false;
  try {
    new URL(href);
  } catch {
    return false;
  }
  return true;
}

// Extract official site from a Race Roster event HTML.
// Strategy (most reliable first):
//   1) Sidebar item with fa-globe + Visit Website anchor.
//   2) Contact list `<dt>Website</dt><dd><a href=...>` row.
// Note: we deliberately skip the contact-modal organizer row because that
// frequently points at a third-party reseller (e.g. dreamtravelcanada.com)
// rather than the actual race's official site.
function extractOfficialWebsite(html: string): string | null {
  const patterns: RegExp[] = [
    /sidebar__event-meta-item[^"]*"[^>]*>\s*<span[^>]*fa-globe[^>]*><\/span>\s*<a\s+href="(https?:\/\/[^"]+)"/i,
    /event-details__contact-list-term[^>]*>\s*Website\s*<\/dt>\s*<dd[^>]*>\s*<a\s+href="(https?:\/\/[^"]+)"/is,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && isAcceptable(m[1])) return m[1];
  }
  return null;
}

const NAME_STOPWORDS = new Set([
  "the", "race", "marathon", "weekend", "festival", "annual", "edition",
  "presented", "international", "city", "demi", "ultra", "half", "full",
  "run", "running", "runners", "event", "events", "series", "championship",
  "cup", "tour", "trail", "road", "open", "official", "charity", "world",
]);

function nameTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[\u00c0-\u024f]/g, (c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !NAME_STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

function registrableHost(href: string): string {
  try {
    const h = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    return h;
  } catch {
    return "";
  }
}

function urlSignificantText(href: string): string {
  // Combine host (sans TLD) + path into one bag-of-letters string. This way
  // organizer-portal URLs whose path encodes the race name (e.g.
  // coursesthematiques.com/marathon-sunlife-de-granby) still pass the overlap
  // check, while shared aggregator/reseller hosts with generic paths do not.
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase().replace(/^www\./, "").split(".").slice(0, -1).join("");
    const path = u.pathname.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return host + path;
  } catch {
    return "";
  }
}

function urlHasNameOverlap(href: string, tokens: Set<string>): boolean {
  const significant = urlSignificantText(href);
  if (!significant) return false;
  for (const t of tokens) {
    if (significant.includes(t)) return true;
    // Also accept abbreviations: a 4-char prefix of the token appearing in
    // the URL (e.g. "saskatchewan" → "sask" in "saskmarathon.ca").
    if (t.length >= 6 && significant.includes(t.slice(0, 4))) return true;
  }
  return false;
}

async function fetchWithTimeout(url: string, ms: number): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 marathoncalendar-bot" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL!.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

interface Target {
  marathonId: string;
  name: string;
  canonicalName: string | null;
  rrUrl: string;
  currentWebsite: string | null;
}

async function loadTargets(): Promise<Target[]> {
  const filter = OVERWRITE ? "" : "AND (m.website_url IS NULL OR m.website_url = '')";
  const r = await pool.query(
    `SELECT m.id, m.name, m.canonical_name, m.website_url, ms.source_url
       FROM marathons m
       JOIN marathon_sources ms ON ms.marathon_id = m.id
      WHERE ms.source_id = $1
        ${filter}
      ORDER BY m.name`,
    [SOURCE_ID],
  );
  return r.rows.map((row) => ({
    marathonId: row.id,
    name: row.name,
    canonicalName: row.canonical_name,
    rrUrl: row.source_url,
    currentWebsite: row.website_url,
  }));
}

async function main() {
  console.log(`Fix RR websites (${APPLY ? "APPLY" : "DRY-RUN"}${OVERWRITE ? ", overwrite" : ""})`);
  const targets = await loadTargets();
  console.log(`Targets: ${targets.length}`);

  const results: Array<{ t: Target; website: string | null }> = new Array(targets.length);
  let cursor = 0;
  let done = 0;
  let okCount = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      const html = await fetchWithTimeout(t.rrUrl, FETCH_TIMEOUT_MS);
      const website = html ? extractOfficialWebsite(html) : null;
      results[i] = { t, website };
      done++;
      if (website) okCount++;
      if (done % 20 === 0 || done === targets.length) {
        console.log(`  [${done}/${targets.length}] extracted=${okCount}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Detect shared hosts (e.g. travel-agency reseller pages). A legit official
  // race website is unique to one race, so any host appearing under multiple
  // marathons is suspicious and must pass a name-overlap check.
  const hostCounts = new Map<string, number>();
  for (const r of results) {
    if (!r.website) continue;
    const h = registrableHost(r.website);
    if (!h) continue;
    hostCounts.set(h, (hostCounts.get(h) ?? 0) + 1);
  }

  let updated = 0;
  let unchanged = 0;
  let noExtract = 0;
  let rejectedSharedHost = 0;
  for (const { t, website } of results) {
    if (!website) {
      noExtract++;
      continue;
    }
    const host = registrableHost(website);
    const shared = (hostCounts.get(host) ?? 0) >= 2;
    if (shared) {
      const tokens = nameTokens(`${t.name} ${t.canonicalName ?? ""} ${t.rrUrl}`);
      if (!urlHasNameOverlap(website, tokens)) {
        rejectedSharedHost++;
        console.log(`  reject-shared-host ${t.name}  ✗  ${website}`);
        continue;
      }
    }
    if (t.currentWebsite && t.currentWebsite === website) {
      unchanged++;
      continue;
    }
    if (APPLY) {
      await pool.query(
        `UPDATE marathons SET website_url = $1, updated_at = now() WHERE id = $2`,
        [website, t.marathonId],
      );
    }
    updated++;
    const arrow = t.currentWebsite ? `${t.currentWebsite} → ${website}` : `${website}`;
    console.log(`  ${APPLY ? "UPDATE" : "would"} ${t.name}  ${arrow}`);
  }

  console.log("\n=== Summary ===");
  console.log(`  Targets:      ${targets.length}`);
  console.log(`  Extracted:    ${okCount}`);
  console.log(`  ${APPLY ? "Updated" : "Would update"}: ${updated}`);
  console.log(`  Same as current (skipped): ${unchanged}`);
  console.log(`  Rejected shared host:      ${rejectedSharedHost}`);
  console.log(`  No extract (skipped):      ${noExtract}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
