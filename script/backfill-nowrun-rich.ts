/**
 * PR-1 (2026-05-02): backfill rich fields from NowRun for all bound editions.
 * Revised 2026-05-11: NowRun uses plain HTML/Tailwind CSS (NOT markdown).
 *   - Key info uses label-value div pairs: <p class="text-xs text-gray-500">LABEL</p><p class="text-sm text-gray-900">VALUE</p>
 *   - Highlights come from 城市攻略 section (必吃/必逛/交通)
 *   - Distance options use grid layout: font-medium text-gray-900 for items
 *
 * Run:    pnpm tsx script/backfill-nowrun-rich.ts [--dry] [--limit=N] [--offset=N]
 */
import { Pool } from "pg";

const DRY = process.argv.includes("--dry");
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const OFFSET = (() => {
  const m = process.argv.find((a) => a.startsWith("--offset="));
  return m ? parseInt(m.split("=")[1], 10) : 0;
})();

const DB_URL = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL });

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
    certificationGrade: null,
    organizer: null,
    officialWechatAccount: null,
    distanceOptions: null,
    highlights: null,
    startLocation: null,
    finishLocation: null,
    packetPickupLocation: null,
    medalImageUrls: null,
    registrationChannels: null,
    officialDocuments: null,
  };
}

/**
 * NowRun HTML structure (plain HTML with Tailwind CSS classes):
 *
 * Key info block — label-value div pairs:
 *   <p class="text-xs text-gray-500">比赛日期</p><p class="text-sm text-gray-900">2026-11-30</p>
 *   <p class="text-xs text-gray-500">比赛地点</p><p class="text-sm text-gray-900">南京市</p>
 *   <p class="text-xs text-gray-500">主办单位</p><p class="text-sm text-gray-900">南京市人民政府</p>
 *
 * Distance options — grid layout:
 *   <span class="text-sm font-medium text-gray-900">全程</span>
 *   <span class="text-sm font-medium text-gray-900">半程</span>
 *
 * Highlights — from 城市攻略 section (城市攻略 replaces 赛事亮点):
 *   <h3>🏙️ {城市名} · 城市攻略</h3>
 *   必吃: {food1} {food2} ...
 *   必逛: {attraction1} {attraction2} ...
 *   交通: {transport}
 *
 * Official info section:
 *   <h3>📋 官方信息</h3>
 *   官方网站 <a href="...">...</a>
 *   官方公众号{name}
 *
 * Fetch method: curl (plain HTML, SSR — no JavaScript dependency)
 */
function parseNowRunHTML(html: string): ParsedRace {
  const out = emptyParsed();
  if (!html || html.length < 100) return out;

  // 1. Key info label-value pairs
  // Pattern: <p class="text-xs text-gray-500">LABEL</p>...<p class="text-sm text-gray-900">VALUE</p>
  // Some pages may use slightly different class names (e.g., text-gray-400 vs text-gray-500)
  const labelValueRe = /<p class="text-xs text-gray-(?:500|400)[^"]*"[^>]*>([^<]+)<\/p>\s*<p class="text-sm text-gray-(?:900|700)[^"]*"[^>]*>([^<]+)<\/p>/g;
  const kv: Map<string, string> = new Map();
  let m;
  while ((m = labelValueRe.exec(html)) !== null) {
    kv.set(m[1].trim(), m[2].trim());
  }

  out.startLocation = kv.get("比赛地点") ?? null;
  out.organizer = kv.get("主办单位") ?? null;

  // raceDate from 比赛日期 — NOTE: some pages show date as text, some embed in SVG (calendar icon + text)
  const raceDateMatch = html.match(/比赛日期[\s\S]{0,200}?class="text-sm text-gray-900[^"]*"[^>]*>(\d{4}-\d{2}-\d{2})/);
  if (raceDateMatch) {
    // extracted separately as ParsedRace doesn't have raceDate field; handled in main loop
  }

  // 2. Distance options — grid layout
  // Pattern: <span class="text-sm font-medium text-gray-900">全程</span>
const distItems = Array.from(html.matchAll(/<span class="text-sm font-medium text-gray-900">([^<]+)<\/span>/g))
    .map((m) => m[1].trim())
    .filter((t) => t.length > 0 && t.length < 20);
  if (distItems.length > 0) {
    out.distanceOptions = distItems.map((kind) => ({ kind }));
  }

  // 3. Highlights — from 城市攻略 section (replaces 赛事亮点)
  // Structure: <h3>🏙️ {city} · 城市攻略</h3>
  //   必吃: {items}
  //   必逛: {items}
  //   交通: {text}
  // The block ends before the next sibling section (<div class="flex items-center gap">)
  const cityGuideIdx = html.indexOf("城市攻略");
  if (cityGuideIdx >= 0) {
    // Find block boundary: from 城市攻略 to next sibling section (flex items-center gap)
    const blockEndMatch = html.slice(cityGuideIdx).search(/<div class="flex items-center gap"/);
    const cityBlock = html.slice(
      cityGuideIdx,
      blockEndMatch >= 0 ? cityGuideIdx + blockEndMatch : cityGuideIdx + 6000,
    );

    const sections: string[] = [];

    // 必吃: extract all text nodes between "必吃" and "必逛" (or next section)
    const bieatIdx = cityBlock.indexOf("必吃");
    if (bieatIdx >= 0) {
      const rest = cityBlock.slice(bieatIdx + 3);
      const nextSection = Math.min(
        rest.indexOf("必逛") >= 0 ? rest.indexOf("必逛") : 99999,
        rest.indexOf("必玩") >= 0 ? rest.indexOf("必玩") : 99999,
        rest.indexOf("必买") >= 0 ? rest.indexOf("必买") : 99999,
        rest.indexOf("交通") >= 0 ? rest.indexOf("交通") : 99999,
      );
      const content = nextSection < 9999 ? rest.slice(0, nextSection) : rest.slice(0, 300);
      const texts = Array.from(content.matchAll(/>([^<]{2,80})</g))
        .map((m) => m[1].trim())
        .filter((t) => !t.startsWith("http") && t.length > 2 && t.length < 60);
      if (texts.length > 0) sections.push("必吃: " + texts.join(" · "));
    }

    // 必逛
    const bivisitIdx = cityBlock.indexOf("必逛");
    if (bivisitIdx >= 0) {
      const rest = cityBlock.slice(bivisitIdx + 3);
      const nextSection = Math.min(
        rest.indexOf("必吃") >= 0 ? rest.indexOf("必吃") : 99999,
        rest.indexOf("必玩") >= 0 ? rest.indexOf("必玩") : 99999,
        rest.indexOf("必买") >= 0 ? rest.indexOf("必买") : 99999,
        rest.indexOf("交通") >= 0 ? rest.indexOf("交通") : 99999,
      );
      const content = nextSection < 9999 ? rest.slice(0, nextSection) : rest.slice(0, 400);
      const texts = Array.from(content.matchAll(/>([^<]{2,80})</g))
        .map((m) => m[1].trim())
        .filter((t) => !t.startsWith("http") && t.length > 2 && t.length < 60);
      if (texts.length > 0) sections.push("必逛: " + texts.join(" · "));
    }

    // 交通
    const trafficIdx = cityBlock.indexOf("交通");
    if (trafficIdx >= 0) {
      const rest = cityBlock.slice(trafficIdx + 2);
      const nextSection = Math.min(
        rest.indexOf("必吃") >= 0 ? rest.indexOf("必吃") : 99999,
        rest.indexOf("必逛") >= 0 ? rest.indexOf("必逛") : 99999,
        rest.indexOf("必玩") >= 0 ? rest.indexOf("必玩") : 99999,
        rest.indexOf("必买") >= 0 ? rest.indexOf("必买") : 99999,
      );
      const content = nextSection < 9999 ? rest.slice(0, nextSection) : rest.slice(0, 200);
      // Strip all tags to get plain text
      const textContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (textContent.length > 5) sections.push("交通: " + textContent.slice(0, 120));
    }

    if (sections.length > 0) {
      out.highlights = sections.join("\n");
    }
  }

  // 4. Official info section — wechat account, official docs
  const officialIdx = html.indexOf("官方信息");
  if (officialIdx >= 0) {
    const officialBlock = html.slice(officialIdx, officialIdx + 1500);

    // 官方公众号
    const wechatMatch = officialBlock.match(/官方公众号([^<\n]{2,20})/);
    if (wechatMatch) out.officialWechatAccount = wechatMatch[1].trim();

    // 官方网站 link
    const websiteMatch = officialBlock.match(/href="(https?:\/\/[^"]+)"/);
    if (websiteMatch) {
      out.officialDocuments = { officialWebsite: websiteMatch[1] };
    }
  }

  // 5. Registration channels — from 报名渠道 in key info
  const channelsRaw = kv.get("报名渠道");
  if (channelsRaw) {
    const links = Array.from(channelsRaw.matchAll(/https?:\/\/[^\s，,，]+/g)).map((m) => m[0]);
    if (links.length > 0) out.registrationChannels = links;
  }

  return out;
}

interface RowToBackfill {
  marathonId: string;
  editionId: string;
  year: number;
  sourceUrl: string;
  marathonName: string;
}

async function loadTargets(): Promise<RowToBackfill[]> {
  const r = await pool.query(
    `SELECT m.id AS marathon_id, e.id AS edition_id, e.year, ms.source_url, m.name
     FROM marathon_sources ms
     JOIN marathons m ON m.id = ms.marathon_id
     JOIN marathon_editions e ON e.marathon_id = m.id
     WHERE ms.source_url LIKE 'https://www.nowrun.cn/race/%'
       AND e.year = 2026
     ORDER BY ms.source_url`,
  );
  return r.rows.map((row) => ({
    marathonId: row.marathon_id,
    editionId: row.edition_id,
    year: row.year,
    sourceUrl: row.source_url,
    marathonName: row.name,
  }));
}

async function applyParsed(target: RowToBackfill, parsed: ParsedRace): Promise<void> {
  if (DRY) return;

  // Update marathons (certification/organizer/wechat)
  const mUpdates: string[] = [];
  const mValues: any[] = [];
  let mIdx = 1;
  if (parsed.certificationGrade !== null) {
    mUpdates.push(`certification_grade = $${mIdx++}`);
    mValues.push(parsed.certificationGrade);
  }
  if (parsed.organizer !== null) {
    mUpdates.push(`organizer = $${mIdx++}`);
    mValues.push(parsed.organizer);
  }
  if (parsed.officialWechatAccount !== null) {
    mUpdates.push(`official_wechat_account = $${mIdx++}`);
    mValues.push(parsed.officialWechatAccount);
  }
  if (mUpdates.length > 0) {
    mUpdates.push(`updated_at = NOW()`);
    mValues.push(target.marathonId);
    await pool.query(
      `UPDATE marathons SET ${mUpdates.join(", ")} WHERE id = $${mIdx}`,
      mValues,
    );
  }

  // Map field name → db column name
  const editionFieldMap: Array<{ key: keyof ParsedRace; col: string }> = [
    { key: "distanceOptions", col: "distance_options" },
    { key: "highlights", col: "highlights" },
    { key: "startLocation", col: "start_location" },
    { key: "finishLocation", col: "finish_location" },
    { key: "packetPickupLocation", col: "packet_pickup_location" },
    { key: "medalImageUrls", col: "medal_image_urls" },
    { key: "registrationChannels", col: "registration_channels" },
    { key: "officialDocuments", col: "official_documents" },
  ];

  // Fetch existing field_sources for incremental logic
  const fsResult = await pool.query(
    `SELECT field_sources FROM marathon_editions WHERE id = $1`,
    [target.editionId],
  );
  const existingFs: Record<string, unknown> = fsResult.rows[0]?.field_sources ?? {};

  // Step 1: data UPDATE (no field_sources)
  const dataUpdates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const { key, col } of editionFieldMap) {
    const val = parsed[key];
    if (val === null) continue;
    if (existingFs[key]) continue; // incremental skip (field already has provenance)
    const isArray = Array.isArray(val);
    const isObj = typeof val === "object";
    if (col === "distance_options") {
      dataUpdates.push(`${col} = $${idx++}::jsonb`);
      values.push(JSON.stringify(val));
    } else if (isArray) {
      dataUpdates.push(`${col} = $${idx++}::text[]`);
      values.push(val as any[]);
    } else if (isObj) {
      dataUpdates.push(`${col} = $${idx++}::jsonb`);
      values.push(JSON.stringify(val));
    } else {
      dataUpdates.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }

  if (dataUpdates.length > 0) {
    dataUpdates.push(`updated_at = NOW()`);
    values.push(target.editionId);
    await pool.query(
      `UPDATE marathon_editions SET ${dataUpdates.join(", ")} WHERE id = $${idx}`,
      values,
    );
  }

  // Step 2: provenance UPDATE — ONE jsonb_set call per field
  for (const { key } of editionFieldMap) {
    if (parsed[key] === null) continue;
    if (existingFs[key]) continue;
    const provenance = JSON.stringify({
      sourceId: "nowrun-001-cn-2026",
      sourceKey: "NowRun",
      updatedAt: new Date().toISOString(),
    });
    await pool.query(
      `UPDATE marathon_editions SET field_sources = jsonb_set(COALESCE(field_sources,'{}'), '{${key}}', $1::jsonb) WHERE id = $2`,
      [provenance, target.editionId],
    );
  }
}

function summarize(p: ParsedRace): string {
  const parts: string[] = [];
  if (p.certificationGrade) parts.push(`${p.certificationGrade}类`);
  if (p.organizer) parts.push("主办");
  if (p.distanceOptions?.length) parts.push(`${p.distanceOptions.length}项`);
  if (p.highlights) parts.push(`亮点(${p.highlights.split('\n').length}段)`);
  if (p.startLocation) parts.push("起");
  if (p.finishLocation) parts.push("终");
  if (p.packetPickupLocation) parts.push("领物");
  if (p.medalImageUrls?.length) parts.push(`奖牌×${p.medalImageUrls.length}`);
  if (p.officialDocuments) parts.push(`文档×${Object.keys(p.officialDocuments).length}`);
  if (p.officialWechatAccount) parts.push("公众号");
  if (p.registrationChannels?.length) parts.push(`渠道×${p.registrationChannels.length}`);
  return parts.length > 0 ? parts.join(" ") : "(无字段)";
}

async function fetchRaceHTML(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: controller.signal,
    });
    if (!r.ok) {
      console.warn(`  HTTP ${r.status} for ${url}`);
      return null;
    }
    return await r.text();
  } catch (err) {
    console.warn(`  fetch failed for ${url}: ${err}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const allTargets = await loadTargets();
  const targets = allTargets.slice(OFFSET, OFFSET + (LIMIT === Infinity ? allTargets.length : LIMIT));
  console.log(`Loaded ${targets.length} targets (offset=${OFFSET}, of ${allTargets.length} total, DRY=${DRY})`);

  let processed = 0;
  let parsedFields = 0;
  let zero = 0;
  let failed = 0;

  for (const t of targets) {
    processed++;
    process.stdout.write(`[${processed}/${targets.length}] ${t.sourceUrl} ${t.marathonName.slice(0, 30)}... `);

    const html = await fetchRaceHTML(t.sourceUrl);
    if (!html) {
      failed++;
      console.log("FETCH FAIL");
      continue;
    }

    const parsed = parseNowRunHTML(html);
    const summary = summarize(parsed);

    if (summary === "(无字段)") zero++;
    else parsedFields++;

    console.log(summary);

    try {
      await applyParsed(t, parsed);
    } catch (err) {
      console.warn(`  DB write error: ${err}`);
    }
  }

  console.log(`\nDone. processed=${processed} fields=${parsedFields} zero=${zero} failed=${failed}`);
}

main().catch(console.error);