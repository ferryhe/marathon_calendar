import * as fs from "fs";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const SOURCE_ID = "raceroster-001-international-2026";
const TSV = "/tmp/rr-events.tsv";

interface Row {
  rrUrl: string;
  externalWebsite: string;
}

function loadTsv(): Row[] {
  const lines = fs.readFileSync(TSV, "utf8").split("\n").filter(Boolean);
  const header = lines[0].split("\t");
  const idxRrUrl = header.indexOf("rrUrl");
  const idxExt = header.indexOf("externalWebsite");
  if (idxRrUrl < 0 || idxExt < 0) throw new Error("TSV missing required columns");
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    rows.push({ rrUrl: cells[idxRrUrl], externalWebsite: cells[idxExt] });
  }
  return rows;
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL!.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  console.log(`Update RR websites (${APPLY ? "APPLY" : "DRY-RUN"})`);
  const rows = loadTsv().filter((r) => r.externalWebsite);
  console.log(`TSV rows with externalWebsite: ${rows.length}`);

  // 噪音过滤：要求 host 与赛事 slug/name 有 ≥4 字符 token 重合，
  // 否则视为赞助商/酒店/PDF/慈善等无关链接，跳过。
  const STOPWORDS = new Set([
    "the", "race", "marathon", "weekend", "festival", "annual", "edition",
    "presented", "international", "city", "demi", "ultra", "half", "full",
    "run", "running", "runners", "event", "events", "series", "championship",
    "cup", "tour", "trail", "road", "open", "presented", "official", "charity",
    "portal", "program", "weekend", "world", "national",
  ]);
  function slugTokens(slugOrName: string): Set<string> {
    return new Set(
      slugOrName
        .toLowerCase()
        .replace(/&#0?39;|'|&amp;|&|®|™/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
    );
  }
  function hostTokens(href: string): Set<string> {
    try {
      let h = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
      // Drop common TLDs by splitting on '.' and taking labels of length >= 4
      // that aren't pure TLDs.
      return new Set(h.split(".").filter((t) => t.length >= 4));
    } catch {
      return new Set();
    }
  }
  function hasOverlap(a: Set<string>, b: Set<string>): boolean {
    for (const x of a) {
      for (const y of b) {
        if (x === y || x.includes(y) || y.includes(x)) return true;
      }
    }
    return false;
  }

  let matched = 0;
  let updated = 0;
  let skippedHasWebsite = 0;
  let skippedNoBinding = 0;
  let skippedNoMatch = 0;

  for (const r of rows) {
    const q = await pool.query(
      `SELECT m.id, m.name, m.canonical_name, m.website_url
         FROM marathons m
         JOIN marathon_sources ms ON ms.marathon_id = m.id
        WHERE ms.source_id = $1 AND ms.source_url = $2`,
      [SOURCE_ID, r.rrUrl],
    );
    if (q.rowCount === 0) {
      skippedNoBinding++;
      continue;
    }
    matched++;
    const m = q.rows[0];
    if (m.website_url && m.website_url.trim() !== "") {
      skippedHasWebsite++;
      continue;
    }
    const rrSlug = r.rrUrl.split("/").pop() ?? "";
    const tokens = new Set([
      ...slugTokens(rrSlug),
      ...slugTokens(m.canonical_name ?? ""),
    ]);
    const hosts = hostTokens(r.externalWebsite);
    if (!hasOverlap(tokens, hosts)) {
      skippedNoMatch++;
      console.log(`  skip-noise ${m.name}  ✗  ${r.externalWebsite}`);
      continue;
    }
    if (APPLY) {
      await pool.query(
        `UPDATE marathons SET website_url = $1, updated_at = now() WHERE id = $2`,
        [r.externalWebsite, m.id],
      );
    }
    updated++;
    console.log(`  ${APPLY ? "UPDATE" : "would"} ${m.name}  →  ${r.externalWebsite}`);
  }

  console.log(`\nDone.`);
  console.log(`  RR-bound marathons matched: ${matched}`);
  console.log(`  ${APPLY ? "Updated" : "Would update"}: ${updated}`);
  console.log(`  Skipped (already has website): ${skippedHasWebsite}`);
  console.log(`  Skipped (no token overlap, likely noise): ${skippedNoMatch}`);
  console.log(`  Skipped (no RR binding for rrUrl): ${skippedNoBinding}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
