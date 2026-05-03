/**
 * Trail-run crawler for zuicool.com (最酷).
 *
 * Source map:
 *   Listing:  https://zuicool.com/events?type=trail-run&page={N}&per-page=100   (N = 1..10)
 *             → yields up to 1000 trail-run events. Each link `/event/{id}`.
 *   Detail:   https://zuicool.com/event/{id}
 *             → og:title = race name (carries year prefix, e.g. "2026...")
 *               og:description = lead paragraph (date, start time, address, scale, distances)
 *               og:keywords = comma list ending with province / city[+ district] / landmark
 *
 * For each detected event we upsert:
 *   marathons         (race_kind='trail', country='China', canonical_name='zuicool-{id}')
 *   marathon_editions (race_date, distance_options, status='upcoming' / 'ended')
 *   marathon_sources  (links the canonical row to https://zuicool.com/event/{id})
 *
 * Run:
 *   npx tsx script/import-zuicool-trail.ts [--dry] [--limit=N] [--pages=10] [--id=12345] [--skip-existing]
 *
 * Env:
 *   DATABASE_URL       — defaults; pass PROD_DATABASE_URL to backfill prod.
 */
import "dotenv/config";
import { Pool } from "pg";

const DRY = process.argv.includes("--dry");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const PAGES = (() => {
  const m = process.argv.find((a) => a.startsWith("--pages="));
  return m ? parseInt(m.split("=")[1], 10) : 10;
})();
const ONLY_ID = (() => {
  const m = process.argv.find((a) => a.startsWith("--id="));
  return m ? m.split("=")[1] : null;
})();

const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

const UA = "Mozilla/5.0 (compatible; MarathonCalendarTrailBot/1.0)";
const SOURCE_NAME = "最酷越野（zuicool trail）";

interface ParsedEvent {
  zuicoolId: string;
  url: string;
  name: string;
  raceDate: string | null;          // YYYY-MM-DD
  year: number;
  province: string | null;
  city: string | null;
  district: string | null;
  landmark: string | null;
  websiteUrl: string;
  distanceOptions: Array<{ kind: string; capacity?: number }>;
  highlights: string | null;
  startLocation: string | null;
  description: string | null;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function metaContent(html: string, name: string): string | null {
  // Match `<meta name="X" content="...">` OR `<meta property="X" ...>`. Content
  // can be on either side of the attribute order; capture everything until the
  // closing quote — descriptions span many lines (DOTALL via [\s\S]).
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\\]/g, "\\$&")}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*/?>`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  // Try reverse order: content first.
  const re2 = new RegExp(
    `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]*(?:name|property)=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Best-effort date parse from og:description.
 *  Patterns observed:
 *    "...定于2026年9月26日上午6:00..."
 *    "...定于9月26日上午6:00..."  (year missing — fall back to title or 当前/次年)
 *    "...将于12月6日..."           (verb variant)
 */
function parseRaceDate(desc: string, title: string): { date: string | null; year: number } {
  const fullYear = desc.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (fullYear) {
    const [, y, m, d] = fullYear;
    return { date: iso(+y, +m, +d), year: +y };
  }
  const monthDay = desc.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  // Year heuristic: leading 4-digit in title (e.g. "2026..."), otherwise use
  // current calendar year and bump to next year if the parsed date is already
  // > 60 days in the past.
  const titleYear = title.match(/^\s*(20\d\d)/)?.[1];
  let year = titleYear ? +titleYear : new Date().getFullYear();
  if (!monthDay) return { date: null, year };
  const month = +monthDay[1];
  const day = +monthDay[2];
  if (!titleYear) {
    const candidate = new Date(year, month - 1, day);
    const now = new Date();
    if (candidate.getTime() < now.getTime() - 60 * 86400000) year += 1;
  }
  return { date: iso(year, month, day), year };
}

function iso(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Parse distance categories from the structured paragraphs in og:description.
 *  zuicool's organizer-authored lead paragraph follows the convention:
 *    设<组别名1><距离>KM（<人数>人）、<组别名2><距离>KM（<人数>人）...
 *  And per-category detail blocks: "<组别名><距离>KM：<人数>人，出发时间..."
 *  We extract every "<float>KM" occurrence, dedupe, and surface the matching
 *  organizer-given group label ("kind") so the UI shows e.g. 13.14KM, 21KM.
 */
function parseDistances(desc: string): Array<{ kind: string; capacity?: number }> {
  const out: Array<{ kind: string; capacity?: number }> = [];
  const seen = new Set<string>();
  // First pass: detail blocks "...XX KM(or K)：YY人" give us name + capacity.
  // Distance units observed: KM, K, km, 公里 — all stripped to canonical "KM".
  const detail = desc.matchAll(/(\d+(?:\.\d+)?)\s*(?:KM|km|K|公里)\s*[：:]\s*(\d+)\s*人/g);
  for (const m of detail) {
    const kind = `${m[1]}KM`;
    if (seen.has(kind)) continue;
    seen.add(kind);
    const cap = parseInt(m[2], 10);
    out.push({ kind, capacity: Number.isFinite(cap) ? cap : undefined });
  }
  // Second pass: lead summary "设...100K（1000人）、65K(1500人）..." mixed full/half
  // width brackets. Capture distance + optional capacity. Require unit suffix
  // so we don't pick up "2026年" or scale numbers.
  const summary = desc.matchAll(
    /(\d+(?:\.\d+)?)\s*(?:KM|km|K|公里)(?!\w)\s*[（(]?\s*(\d+)?\s*人?\s*[）)]?/g,
  );
  for (const m of summary) {
    const kind = `${m[1]}KM`;
    if (seen.has(kind)) continue;
    seen.add(kind);
    const cap = m[2] ? parseInt(m[2], 10) : undefined;
    out.push({ kind, capacity: cap });
  }
  return out;
}

function parseStartLocation(desc: string): string | null {
  // "...在<address>开跑/起跑/鸣枪..."
  const m = desc.match(/在\s*([^，。\n]+?)\s*(?:开跑|起跑|鸣枪)/);
  return m ? m[1].trim() : null;
}

/** og:keywords format observed:
 *    "<赛名>,<赛名>点评,报名,成绩,马拉松,<省份>,<市[+区]>,<地标>"
 *  We split, drop boilerplate ("点评/报名/成绩/马拉松/越野"), and assume the
 *  remaining tail (last 1-3 tokens) is the location chain.
 */
function parseLocation(keywords: string | null): {
  province: string | null;
  city: string | null;
  district: string | null;
  landmark: string | null;
} {
  if (!keywords) return { province: null, city: null, district: null, landmark: null };
  const stop = new Set(["点评", "报名", "成绩", "马拉松", "越野", "越野跑", "跑步"]);
  const parts = keywords
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !stop.has(p));
  // Drop race-name tokens (anything containing the first token's first chars)
  // — heuristic: name + name+"点评" are at the start; location chain is the
  // tail. Take last 4 tokens max.
  const tail = parts.slice(Math.max(0, parts.length - 4));
  // tail: [province, city(+ district), district?, landmark?]
  const province = tail[0] ?? null;
  const cityRaw = tail[1] ?? null;
  let city: string | null = null;
  let district: string | null = null;
  if (cityRaw) {
    const split = cityRaw.split(/\s+/);
    city = split[0] ?? null;
    district = split[1] ?? null;
  }
  if (!district && tail[2]) district = tail[2];
  const landmark = tail[3] ?? tail[2] ?? null;
  return { province, city, district, landmark };
}

async function parseEvent(zuicoolId: string): Promise<ParsedEvent | null> {
  const url = `https://zuicool.com/event/${zuicoolId}`;
  let html: string;
  try {
    html = await fetchText(url);
  } catch (err) {
    console.warn(`  ! fetch failed ${zuicoolId}: ${(err as Error).message}`);
    return null;
  }
  const name = metaContent(html, "og:title");
  const description = metaContent(html, "og:description");
  const keywords = metaContent(html, "og:keywords") ?? metaContent(html, "keywords");
  if (!name || !description) {
    console.warn(`  ! missing meta for ${zuicoolId}`);
    return null;
  }
  const { date, year } = parseRaceDate(description, name);
  const loc = parseLocation(keywords);
  const distances = parseDistances(description);
  const start = parseStartLocation(description);
  const highlights = description.split(/[\n。]/).slice(0, 1).join("").trim() || null;
  return {
    zuicoolId,
    url,
    name: name.trim(),
    raceDate: date,
    year,
    province: loc.province,
    city: loc.city,
    district: loc.district,
    landmark: loc.landmark,
    websiteUrl: url,
    distanceOptions: distances,
    highlights,
    startLocation: start,
    description,
  };
}

async function listTrailEventIds(): Promise<string[]> {
  if (ONLY_ID) return [ONLY_ID];
  const ids = new Set<string>();
  for (let page = 1; page <= PAGES; page++) {
    const url = `https://zuicool.com/events?type=trail-run&page=${page}&per-page=100`;
    let html: string;
    try {
      html = await fetchText(url);
    } catch (err) {
      console.warn(`! listing page ${page} failed: ${(err as Error).message}`);
      break;
    }
    const matches = [...html.matchAll(/href="(?:https?:\/\/zuicool\.com)?\/event\/(\d+)/g)];
    let added = 0;
    for (const m of matches) {
      if (!ids.has(m[1])) {
        ids.add(m[1]);
        added++;
      }
    }
    console.log(`page ${page}: ${matches.length} links, ${added} new (total ${ids.size})`);
    if (added === 0) break; // exhausted
    await sleep(400);
  }
  return [...ids];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureSourceId(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM sources WHERE name=$1 LIMIT 1",
    [SOURCE_NAME],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO sources(name, type, strategy, base_url, priority, notes)
     VALUES($1, 'aggregator', 'HTML', 'https://zuicool.com', 5,
            'zuicool 最酷越野赛事日历，按 type=trail-run 抓取')
     RETURNING id`,
    [SOURCE_NAME],
  );
  return inserted.rows[0].id;
}

async function upsertEvent(ev: ParsedEvent, sourceId: string): Promise<"inserted" | "updated" | "skipped"> {
  const canonical = `zuicool-${ev.zuicoolId}`;
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM marathons WHERE canonical_name=$1 OR name=$2 LIMIT 1",
    [canonical, ev.name],
  );

  if (SKIP_EXISTING && existing.rows[0]) return "skipped";

  // Compose city display: "Hangzhou (Lin'an)" style — keep Chinese for now.
  const cityDisplay = ev.district && ev.city
    ? `${ev.city}（${ev.district}）`
    : ev.city ?? ev.province ?? null;

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
            country = COALESCE(country, 'China'),
            description = COALESCE(description, $3),
            website_url = COALESCE(website_url, $4),
            race_kind = 'trail',
            updated_at = now()
         WHERE id = $5`,
        [ev.name, cityDisplay, ev.highlights, ev.websiteUrl, marathonId],
      );
    }
  } else {
    if (DRY) {
      console.log(`  [dry] insert marathon ${ev.name} (${canonical})`);
      marathonId = "dry-run";
      action = "inserted";
    } else {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO marathons
            (name, name_zh, canonical_name, city, city_zh, country,
             description, website_url, race_kind)
         VALUES($1,$1,$2,$3,$3,'China',$4,$5,'trail')
         RETURNING id`,
        [ev.name, canonical, cityDisplay, ev.highlights, ev.websiteUrl],
      );
      marathonId = ins.rows[0].id;
      action = "inserted";
    }
  }

  if (DRY || marathonId === "dry-run") return action;

  // Edition upsert (unique on marathon_id + year). Use parsed year (defaults to
  // current year when extraction failed) so we always produce a row the UI can
  // surface; race_date may legitimately be NULL.
  const status = computeStatus(ev.raceDate);
  await pool.query(
    `INSERT INTO marathon_editions
        (marathon_id, year, race_date, status, distance_options,
         start_location, highlights, publish_status, published_at, last_synced_at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'published', now(), now())
     ON CONFLICT (marathon_id, year) DO UPDATE SET
        race_date = COALESCE(EXCLUDED.race_date, marathon_editions.race_date),
        status = EXCLUDED.status,
        distance_options = EXCLUDED.distance_options,
        start_location = COALESCE(EXCLUDED.start_location, marathon_editions.start_location),
        highlights = COALESCE(EXCLUDED.highlights, marathon_editions.highlights),
        publish_status = 'published',
        last_synced_at = now(),
        updated_at = now()`,
    [
      marathonId,
      ev.year,
      ev.raceDate,
      status,
      JSON.stringify(ev.distanceOptions),
      ev.startLocation,
      ev.highlights,
    ],
  );

  // Source link (idempotent).
  await pool.query(
    `INSERT INTO marathon_sources(marathon_id, source_id, source_url)
     VALUES($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [marathonId, sourceId, ev.url],
  );

  return action;
}

function computeStatus(raceDate: string | null): string {
  if (!raceDate) return "upcoming";
  const today = new Date().toISOString().slice(0, 10);
  return raceDate >= today ? "upcoming" : "ended";
}

async function main() {
  console.log(`zuicool trail crawler — DRY=${DRY} LIMIT=${LIMIT} PAGES=${PAGES}`);
  const sourceId = DRY ? "dry-source" : await ensureSourceId();
  const ids = await listTrailEventIds();
  console.log(`Total trail events discovered: ${ids.length}`);
  const targets = ids.slice(0, LIMIT);

  const stats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  let i = 0;
  for (const id of targets) {
    i++;
    try {
      const ev = await parseEvent(id);
      if (!ev) {
        stats.failed++;
        continue;
      }
      const result = await upsertEvent(ev, sourceId);
      stats[result]++;
      if (i % 20 === 0 || result === "inserted") {
        console.log(
          `[${i}/${targets.length}] ${result.padEnd(8)} ${ev.name}  ${ev.raceDate ?? "?"}  ${ev.distanceOptions.length}×距离`,
        );
      }
    } catch (err) {
      stats.failed++;
      console.warn(`  ! ${id} failed: ${(err as Error).message}`);
    }
    await sleep(120);
  }

  console.log("\n=== Summary ===");
  console.log(stats);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
