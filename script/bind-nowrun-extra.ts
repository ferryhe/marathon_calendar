/**
 * PR-1.5: For marathons not yet bound to NowRun, fuzzy-match against NowRun's
 * homepage (492 race links) and create non-primary marathon_sources rows.
 *
 * Run:
 *   npx tsx script/bind-nowrun-extra.ts          # dry-run
 *   npx tsx script/bind-nowrun-extra.ts --apply  # actually insert
 *   TARGET_DB_URL=$PROD_DATABASE_URL npx tsx script/bind-nowrun-extra.ts --apply  # prod
 */
import { Pool } from "pg";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });
const NOWRUN_SOURCE_ID = "nowrun-001-cn-2026";

interface NowRunEntry {
  url: string;
  name: string;
}

interface Candidate {
  id: string;
  name: string;
  city: string | null;
  country: string;
}

function loadNowRunList(): NowRunEntry[] {
  const tsv = readFileSync("/tmp/nowrun-races-unique.tsv", "utf8");
  const out: NowRunEntry[] = [];
  for (const line of tsv.split("\n")) {
    if (!line.trim()) continue;
    const [path, name] = line.split("\t");
    if (!path || !name) continue;
    out.push({ url: `https://www.nowrun.cn${path}`, name: name.trim() });
  }
  return out;
}

/**
 * Classify the distance type of a race name.
 *  - "half": 半程/半马
 *  - "10k": 10公里/10km/10K
 *  - "full": default (全程/全马 or unspecified marathon)
 *  - "other": e.g. 越野/trail (we skip these)
 */
function classify(name: string): "full" | "half" | "10k" | "other" {
  if (/越野|trail|登山|山地|嘉年华|joy|fun/i.test(name)) return "other";
  if (/10\s*(公里|km|k)/i.test(name)) return "10k";
  if (/半程|半马/.test(name)) return "half";
  // Reject anything that doesn't actually claim to be a marathon
  if (!/马拉松|marathon/i.test(name)) return "other";
  return "full";
}

/**
 * Strip year prefix and extract the meaningful keyword fragment.
 *  "2026北京马拉松" → "北京马拉松"
 *  "2026 阳光海岸马拉松" → "阳光海岸马拉松"
 */
function stripYear(name: string): string {
  return name.replace(/^\s*20\d{2}\s*/, "").trim();
}

/**
 * Score how well a NowRun entry matches a candidate marathon.
 * Returns 0 if no match, higher = better.
 */
/**
 * Pull a "race stem" from a name: the discriminating chars after stripping the
 * year, common qualifiers ("第N届", quotes), and punctuation. We use this to
 * support cases where the candidate's stored city is a parent region (e.g. our
 * DB has city=杭州 but the race is named 临平半程马拉松), or where the NowRun
 * entry has additional prefix qualifiers (e.g. "多彩贵州半程马拉松超级联赛
 * （第一站）暨贵州·镇宁黄果树半程马拉松").
 */
function nameStem(name: string): string {
  return stripYear(name)
    .replace(/^第[一二三四五六七八九十百0-9]+届\s*/, "")
    .replace(/^首届\s*/, "")
    .replace(/[“”"·．.\-—\s（）()]/g, "")
    .replace(/(全程|半程|10\s*(公里|km|k))?马拉松.*$/i, "")
    .trim();
}

function score(candidate: Candidate, entry: NowRunEntry): number {
  const cName = stripYear(candidate.name);
  const eName = stripYear(entry.name);
  const cType = classify(cName);
  const eType = classify(eName);

  // Distance must match
  if (cType !== eType) return 0;
  if (cType === "other") return 0;

  // Year of NowRun entry must match candidate year (avoid 2026 vs 2027)
  const candYear = candidate.name.match(/20\d{2}/)?.[0];
  const entryYear = entry.name.match(/20\d{2}/)?.[0];
  if (candYear && entryYear && candYear !== entryYear) return 0;

  // Two ways the names can be considered "about the same race":
  //   1. NowRun's name contains our stored city, OR
  //   2. NowRun's name contains the candidate's name-stem (handles parent-city
  //      case like 临平/杭州, and quoted/punctuation variants like 临夏)
  const stem = nameStem(cName);
  const cityHit = candidate.city ? eName.includes(candidate.city) : false;
  const stemHit = stem.length >= 2 && eName.includes(stem);
  if (!cityHit && !stemHit) return 0;

  let s = 80;
  if (cName === eName) s += 100;
  if (stemHit) s += 20;
  if (cityHit) s += 20;

  // For full marathons named exactly "城市马拉松", prefer entries with the same
  // simple form over ones with extra district/sponsor qualifiers
  if (cType === "full" && candidate.city && cName === `${candidate.city}马拉松`) {
    const simple = `${candidate.city}马拉松`;
    if (eName === simple) s += 50;
    if (eName.startsWith(candidate.city) && eName !== simple && eName.length > simple.length + 2) {
      s -= 30;
    }
  }

  // Mild length similarity (capped to avoid killing long but valid matches)
  const lenPenalty = Math.min(Math.abs(eName.length - cName.length), 20);
  s -= lenPenalty;

  return Math.max(s, 1);
}

function findBestMatch(candidate: Candidate, entries: NowRunEntry[]): NowRunEntry | null {
  let best: NowRunEntry | null = null;
  let bestScore = 0;
  for (const e of entries) {
    const s = score(candidate, e);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return bestScore >= 80 ? best : null;
}

async function main() {
  const entries = loadNowRunList();
  console.log(`Loaded ${entries.length} NowRun entries`);

  const r = await pool.query(`
    SELECT m.id, m.name, m.city, m.country
    FROM marathons m
    WHERE m.country = 'China'
      AND NOT EXISTS (
        SELECT 1 FROM marathon_sources ms
        WHERE ms.marathon_id = m.id
          AND ms.source_url LIKE 'https://www.nowrun.cn/race/%'
      )
    ORDER BY m.name`);
  const candidates: Candidate[] = r.rows;
  console.log(`Found ${candidates.length} unbound China marathons`);

  let matched = 0;
  let skipped = 0;
  const proposed: Array<{ candidate: Candidate; match: NowRunEntry }> = [];

  for (const c of candidates) {
    const match = findBestMatch(c, entries);
    if (match) {
      proposed.push({ candidate: c, match });
      matched++;
      console.log(`✓ ${c.name}  ←  ${match.name}  (${match.url})`);
    } else {
      skipped++;
      console.log(`× ${c.name}  (city=${c.city})`);
    }
  }

  console.log(`\nSummary: matched=${matched}, skipped=${skipped}`);

  if (!APPLY) {
    console.log("\nDry-run. Re-run with --apply to insert marathon_sources rows.");
    await pool.end();
    return;
  }

  let inserted = 0;
  for (const { candidate, match } of proposed) {
    // Check if a NowRun source already exists for this marathon (defensive)
    const existing = await pool.query(
      `SELECT id FROM marathon_sources WHERE marathon_id = $1 AND source_url = $2`,
      [candidate.id, match.url],
    );
    if (existing.rows.length > 0) continue;

    // Need an edition_id for FK? Check schema
    await pool.query(
      `INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
       VALUES ($1, $2, $3, false)
       ON CONFLICT DO NOTHING`,
      [candidate.id, NOWRUN_SOURCE_ID, match.url],
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} marathon_sources rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
