/**
 * repair-backfill-via-merge.ts
 *
 * Re-runs the NowRun backfill using upsertEditionWithMerge so that:
 * 1. Rich fields (highlights, startLocation, distanceOptions, etc.) are protected
 *    from being overwritten by lower-priority sources with null values.
 * 2. field_sources provenance is correctly written for every merged field.
 *
 * Strategy:
 * - Fetch all NowRun source bindings (editionId, marathonId, year, sourceUrl)
 * - For each: fetch markdown → parse → upsertEditionWithMerge
 * - DRY mode to preview without writing
 *
 * Run: pnpm tsx script/repair-backfill-via-merge.ts [--dry] [--limit=50]
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { upsertEditionWithMerge } from "../server/editionMerge";

const DRY = process.argv.includes("--dry");
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const ONLY_URL = (() => {
  const m = process.argv.find((a) => a.startsWith("--url="));
  return m ? m.split("=")[1] : null;
})();

const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });
const db = drizzle(pool);

// ── NowRun source config ──────────────────────────────────────────────────────
const NOWRUN_SOURCE = {
  sourceId: "nowrun-001-cn-2026",
  sourceType: "platform",
  priority: 87,
};

// ── Minimal markdown parser (same as backfill-nowrun-rich.ts) ─────────────────
interface ParsedRace {
  certificationGrade: string | null;
  organizer: string | null;
  officialWechatAccount: string | null;
  distanceOptions: Array<{ kind: string; capacity?: number; price?: number }> | null;
  highlights: string | null;
  startLocation: string | null;
  finishLocation: string | null;
  packetPickupLocation: string | null;
  medalImageUrls: string[] | null;
  registrationChannels: string[] | null;
  officialDocuments: Record<string, string> | null;
}

function emptyParsed(): ParsedRace {
  return {
    certificationGrade: null, organizer: null, officialWechatAccount: null,
    distanceOptions: null, highlights: null, startLocation: null,
    finishLocation: null, packetPickupLocation: null, medalImageUrls: null,
    registrationChannels: null, officialDocuments: null,
  };
}

const KEY_INFO_LABELS = ["比赛日期","比赛地点","赛事设项","起点","终点","领物地点","主办单位","报名渠道"];

function parseNowRunMarkdown(md: string): ParsedRace {
  const out = emptyParsed();
  if (!md || md.length < 100) return out;
  const certMatch = md.match(/[·\u00b7][·\u00b7]?\s*([ABC])类认证/);
  if (certMatch) out.certificationGrade = certMatch[1];
  const keyInfo = sliceSection(md, "ℹ️ 关键信息速览");
  if (keyInfo) {
    const kv = parseKeyValueBlock(keyInfo, KEY_INFO_LABELS);
    out.organizer = kv.get("主办单位") ?? null;
    out.startLocation = stripMapLink(kv.get("起点") ?? null);
    out.finishLocation = stripMapLink(kv.get("终点") ?? null);
    out.packetPickupLocation = stripMapLink(kv.get("领物地点") ?? null);
    const distRaw = kv.get("赛事设项");
    if (distRaw) out.distanceOptions = parseDistanceOptions(distRaw);
    const channelsRaw = kv.get("报名渠道");
    if (channelsRaw) out.registrationChannels = splitChannels(channelsRaw);
  }
  const highlightsSec = sliceSection(md, "🌟 赛事亮点");
  if (highlightsSec) {
    out.highlights = extractHighlights(highlightsSec);
    const medals = Array.from(highlightsSec.matchAll(/!\[奖牌\s*\d*\]\(([^)]+)\)/g)).map((m) => m[1]);
    if (medals.length > 0) out.medalImageUrls = medals;
  }
  const officialSec = sliceSection(md, "📋 官方信息");
  if (officialSec) {
    out.officialDocuments = parseOfficialDocuments(officialSec);
    const wechatMatch = officialSec.match(/官方公众号\s*([^\n\r]+?)(?:\s*显示二维码|\s*复制名称|\s*$)/);
    if (wechatMatch) out.officialWechatAccount = wechatMatch[1].trim() || null;
  }
  return out;
}

function sliceSection(md: string, headerSubstr: string): string | null {
  const escaped = headerSubstr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`###\\s*${escaped}`);
  const m = headerRe.exec(md);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const next = rest.search(/\n###\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

function parseKeyValueBlock(text: string, labels: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const labelSet = new Set(labels);
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let currentKey: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentKey) {
      const value = buf.filter(Boolean).join("\n").trim();
      if (value) map.set(currentKey, value);
    }
    currentKey = null;
    buf = [];
  };
  for (const line of lines) {
    if (!line) continue;
    if (labelSet.has(line)) { flush(); currentKey = line; }
    else if (currentKey) buf.push(line);
  }
  flush();
  return map;
}

function stripMapLink(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\\\[地图\\\]/g, "").replace(/\[地图\]/g, "").replace(/\s+/g, " ").trim() || null;
}

function parseDistanceOptions(raw: string): Array<{ kind: string; capacity?: number; price?: number }> {
  const results: Array<{ kind: string; capacity?: number; price?: number }> = [];
  // e.g. "全程马拉松  5000人  ¥380\n半程马拉松  3000人  ¥280\n..."
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines) {
    const nameMatch = line.match(/^(【[^】]+】|[^¥\n\r]+?)(?:\s+\d+[人位]|\s+¥|$)/);
    if (nameMatch) {
      const kind = nameMatch[1].replace(/^【/, "").replace(/】$/, "").trim();
      if (kind) results.push({ kind });
    }
  }
  if (results.length === 0 && raw.trim()) results.push({ kind: raw.trim() });
  return results;
}

function splitChannels(raw: string): string[] {
  return raw.split(/[,，;；\n\r]+/).map((s) => s.trim()).filter(Boolean);
}

function extractHighlights(section: string): string {
  // Skip pill badges, collect paragraph text
  const lines = section.split(/\r?\n/);
  const paraLines: string[] = [];
  for (const line of lines) {
    // Skip only image/marker lines, NOT bold-formatted content
    if (line.startsWith("![")) continue;
    const stripped = line.replace(/^\*\*[^*]+\*\*\s*/, "").trim();
    if (stripped) paraLines.push(stripped);
  }
  const text = paraLines.join(" ").replace(/\s+/g, " ").trim();
  // Truncate to a reasonable length for DB
  return text.length > 2000 ? text.slice(0, 2000) : text;
}

function parseOfficialDocuments(section: string): Record<string, string> {
  const docs: Record<string, string> = {};
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(section)) !== null) {
    docs[m[1]] = m[2];
  }
  return docs;
}

// ── HTTP fetcher with retry ────────────────────────────────────────────────────
async function fetchMarkdown(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Accept": "text/markdown,text/plain,*/*",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`  HTTP ${res.status} for ${url}`);
        return null;
      }
      return await res.text();
    } catch (err) {
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
      else {
        console.error(`  Fetch error: ${err}`);
        return null;
      }
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== repair-backfill-via-merge ===");
  console.log(`DRY=${DRY}, LIMIT=${LIMIT === Infinity ? "all" : LIMIT}`);

  // Load all NowRun bindings
  const bindingsQuery = await pool.query(`
    SELECT DISTINCT
      ms.marathon_id  AS marathon_id,
      e.id            AS edition_id,
      e.year,
      ms.source_url   AS source_url,
      m.name          AS marathon_name
    FROM marathon_sources ms
    JOIN marathons m ON m.id = ms.marathon_id
    JOIN marathon_editions e ON e.marathon_id = ms.marathon_id
    WHERE ms.source_url ILIKE '%nowrun.cn%'
    ORDER BY m.name, e.year
  `);
  const bindings = bindingsQuery.rows;
  console.log(`Found ${bindings.length} NowRun bindings`);

  const targets = bindings.slice(0, LIMIT === Infinity ? bindings.length : LIMIT);
  let processed = 0;
  let skipped = 0;
  let merged = 0;
  let failed = 0;
  let protectedCount = 0; // fields skipped because existing value should be preserved

  for (const t of targets) {
    processed++;
    process.stdout.write(`[${processed}/${targets.length}] ${t.marathon_name.slice(0, 30)} (${t.year})... `);

    const md = await fetchMarkdown(t.source_url);
    if (!md) {
      failed++;
      console.log("FETCH FAIL");
      continue;
    }

    const parsed = parseNowRunMarkdown(md);

    // Skip if nothing meaningful to contribute
    const hasRichData =
      parsed.highlights || parsed.startLocation || parsed.distanceOptions?.length ||
      parsed.finishLocation || parsed.packetPickupLocation || parsed.medalImageUrls?.length;
    if (!hasRichData) {
      skipped++;
      console.log("NO RICH DATA");
      continue;
    }

    if (DRY) {
      console.log(`DRY: would upsert highlights=${!!parsed.highlights} startLocation=${!!parsed.startLocation} distanceOptions=${parsed.distanceOptions?.length ?? 0}`);
      merged++;
      continue;
    }

    try {
      const result = await upsertEditionWithMerge({
        database: db,
        marathonId: t.marathon_id,
        year: t.year,
        incoming: {
          highlights: parsed.highlights,
          startLocation: parsed.startLocation,
          finishLocation: parsed.finishLocation,
          distanceOptions: parsed.distanceOptions,
          registrationOpenDate: null,
          registrationCloseDate: null,
        },
        source: NOWRUN_SOURCE,
      });
      console.log(`${result.action} (conflicts:${result.conflicts.length})`);
      merged++;
    } catch (err) {
      console.error(`UPSERT ERROR: ${err}`);
      failed++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Processed : ${processed}`);
  console.log(`Merged    : ${merged}`);
  console.log(`Skipped   : ${skipped}`);
  console.log(`Failed    : ${failed}`);
  console.log(`DRY=${DRY ? " (no actual writes)" : ""}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
