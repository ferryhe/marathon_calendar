/**
 * PR-1 (2026-05-02): backfill rich fields from NowRun for all bound editions.
 *
 * Fetches the markdown form of every NowRun race page already linked via
 * `marathon_sources.source_url LIKE 'https://www.nowrun.cn/race/%'`, parses
 * Tier-A fields (certification, organizer, wechat, distance options, highlights,
 * start/finish/pickup, medal images, registration channels, official documents)
 * and writes them to `marathons` + `marathon_editions`.
 *
 * Run:    pnpm tsx script/backfill-nowrun-rich.ts [--dry] [--limit=N] [--id=URL]
 */
import { Pool } from "pg";

const DRY = process.argv.includes("--dry");
const LIMIT = (() => {
  const m = process.argv.find((a) => a.startsWith("--limit="));
  return m ? parseInt(m.split("=")[1], 10) : Infinity;
})();
const ONLY_URL = (() => {
  const m = process.argv.find((a) => a.startsWith("--url="));
  return m ? m.split("=")[1] : null;
})();
const OFFSET = (() => {
  const m = process.argv.find((a) => a.startsWith("--offset="));
  return m ? parseInt(m.split("=")[1], 10) : 0;
})();
const ONLY_NEW = process.argv.includes("--only-new");

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
 * NowRun markdown structure (stable across hundreds of pages):
 *   # 2026XXX马拉松<status_word>
 *   <province>·<grade>类认证               <- certification line (optional)
 *   ...
 *   ### ℹ️ 关键信息速览                    <- key info section
 *   <label>\n<value>\n<label>\n<value>...
 *   ### 🌟 赛事亮点                         <- highlights section (optional)
 *   <pill1><pill2>...
 *   <paragraph>
 *   ![奖牌 1](URL)![奖牌 2](URL)...
 *   ### 🏙️ XXX · 城市攻略                  <- city guide (skipped in PR-1)
 *   ### 📋 官方信息                         <- official documents
 *   <doc_label>\n[查看详情](URL)\n...
 *   官方公众号<wechat_name>
 *
 * The parser uses three building blocks:
 *  1. matchSection(headerEmoji): returns the text between two ### headers
 *  2. extractKeyValue(section, label): NowRun renders each label on its own
 *     line followed by the value on the next non-empty line(s) until the next
 *     known label
 *  3. matchAllImages: ![alt](url)
 */
const KEY_INFO_LABELS = [
  "比赛日期",
  "比赛地点",
  "赛事设项",
  "起点",
  "终点",
  "领物地点",
  "主办单位",
  "报名渠道",
];

function parseNowRunMarkdown(md: string): ParsedRace {
  const out = emptyParsed();
  if (!md || md.length < 100) return out;

  // 1. Certification grade
  const certMatch = md.match(/[·\u00b7][·\u00b7]?\s*([ABC])类认证/);
  if (certMatch) out.certificationGrade = certMatch[1];

  // 2. Key info section
  const keyInfo = sliceSection(md, "ℹ️ 关键信息速览");
  if (keyInfo) {
    const kv = parseKeyValueBlock(keyInfo, KEY_INFO_LABELS);
    out.organizer = kv.get("主办单位") ?? null;
    out.startLocation = stripMapLink(kv.get("起点") ?? null);
    out.finishLocation = stripMapLink(kv.get("终点") ?? null);
    out.packetPickupLocation = stripMapLink(kv.get("领物地点") ?? null);

    // 赛事设项 → distance_options
    const distRaw = kv.get("赛事设项");
    if (distRaw) out.distanceOptions = parseDistanceOptions(distRaw);

    // 报名渠道 → array
    const channelsRaw = kv.get("报名渠道");
    if (channelsRaw) out.registrationChannels = splitChannels(channelsRaw);
  }

  // 3. Highlights section: keep first paragraph after the pills
  const highlightsSec = sliceSection(md, "🌟 赛事亮点");
  if (highlightsSec) {
    out.highlights = extractHighlights(highlightsSec);
    // Medal images live inside this section
    const medals = [...highlightsSec.matchAll(/!\[奖牌\s*\d*\]\(([^)]+)\)/g)].map(
      (m) => m[1],
    );
    if (medals.length > 0) out.medalImageUrls = medals;
  }

  // 4. Official documents section
  const officialSec = sliceSection(md, "📋 官方信息");
  if (officialSec) {
    out.officialDocuments = parseOfficialDocuments(officialSec);
    // 官方公众号XXX (no markdown link, just text right after the label)
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
  // Build a labelSet for quick lookup; preserve insertion order in `labels`
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
    if (labelSet.has(line)) {
      flush();
      currentKey = line;
    } else if (currentKey) {
      buf.push(line);
    }
  }
  flush();
  return map;
}

function stripMapLink(value: string | null): string | null {
  if (!value) return null;
  // Examples seen:
  //   "天安门广场\n\\[地图\\]"
  //   "全程 - 全民健身中心[地图]\n半程 - 全民健身中心[地图]"
  // Preserve multi-line distance prefixes, just drop the [地图] markers.
  return value
    .replace(/\\\[地图\\\]/g, "")
    .replace(/\[地图\]/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

/**
 * Parse a 赛事设项 block like:
 *   全程8000人180元报名9,556人中签率83.7%
 *   半程17000人150元报名4.1万人中签率41.5%
 * or simply:
 *   全程
 *   半程
 *   半程22000人120元
 */
function parseDistanceOptions(
  raw: string,
): Array<{ kind: string; capacity?: number; price?: number }> {
  const KINDS = ["全程", "半程", "迷你", "迷你跑", "欢乐跑", "家庭跑", "10公里", "5公里"];
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const results: Array<{ kind: string; capacity?: number; price?: number }> = [];
  for (const line of lines) {
    const kind = KINDS.find((k) => line.startsWith(k));
    if (!kind) continue;
    const item: { kind: string; capacity?: number; price?: number } = { kind };
    const capMatch = line.match(/(\d{1,3}(?:,\d{3})*|\d+)人/);
    if (capMatch) {
      const n = parseInt(capMatch[1].replace(/,/g, ""), 10);
      if (!Number.isNaN(n)) item.capacity = n;
    }
    const priceMatch = line.match(/(\d+)元/);
    if (priceMatch) item.price = parseInt(priceMatch[1], 10);
    results.push(item);
  }
  return results;
}

/**
 * 报名渠道 examples:
 *   "京视赛事小程序官网中国银行APP马拉马拉APP"
 *   "官方公众号"
 *   "官网数字心动APP"
 * NowRun concatenates channel names with no delimiter; split by suffix tokens.
 */
function splitChannels(raw: string): string[] {
  const tokens = raw
    .replace(/\s+/g, "")
    .split(/(?<=APP|小程序|官网|官方公众号|公众号|网站|官方网站)/g)
    .map((t) => t.trim())
    .filter(Boolean);
  // Dedupe while preserving order
  return [...new Set(tokens)];
}

function extractHighlights(section: string): string | null {
  // Strip image markdown (both bare ![](url) and link-wrapped [![](url)](url))
  // including multi-line URL splits, then keep paragraphs >= 15 chars.
  const cleaned = section
    // Link-wrapped image, possibly broken across lines
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/gs, "")
    // Bare image
    .replace(/!\[[^\]]*\]\([^)]*\)/gs, "")
    // Stray empty parens or stray markdown link fragments left behind
    .replace(/\([^()\n]{0,200}\)/g, (m) => (m.includes("http") ? "" : m));
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("!["));
  const paragraphs = lines.filter((l) => l.length >= 15);
  if (paragraphs.length === 0) return null;
  const joined = paragraphs.slice(0, 4).join("\n\n").trim();
  return joined.length > 0 ? joined : null;
}

const DOC_LABELS: Array<[string, string]> = [
  ["报名须知", "registrationNotice"],
  ["竞赛规程", "raceRules"],
  ["赛道信息", "courseInfo"],
  ["领物指南", "packetPickup"],
  ["官方网站", "officialWebsite"],
];

function parseOfficialDocuments(section: string): Record<string, string> | null {
  const docs: Record<string, string> = {};
  // The lite HTML→md leaves links like:  [查看详情\n\n](https://...)
  // So we cannot rely on per-line matches; scan the whole section after
  // each label and grab the first link URL.
  for (const [labelCn, key] of DOC_LABELS) {
    const labelIdx = section.indexOf(labelCn);
    if (labelIdx === -1) continue;
    const after = section.slice(labelIdx, labelIdx + 600);
    // Match next markdown link URL (handles multiline link text)
    const linkMatch = after.match(/\]\((https?:\/\/[^)\s]+)\)/);
    if (linkMatch) docs[key] = linkMatch[1];
  }
  return Object.keys(docs).length > 0 ? docs : null;
}

async function fetchRaceMarkdown(url: string): Promise<string | null> {
  // Native fetch with explicit AbortController timeout (default 8s).
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarathonBot/1.0)" },
      signal: controller.signal,
    });
    if (!r.ok) {
      console.warn(`  HTTP ${r.status} for ${url}`);
      return null;
    }
    const html = await r.text();
    return htmlToMarkdownLite(html);
  } catch (err) {
    console.warn(`  fetch failed for ${url}: ${err}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Lightweight HTML→markdown converter focused on the markers our parser needs:
 * - <h1> → "# "
 * - <h3> → "### "
 * - <img> → "![alt](src)"
 * - <a href> → "[text](href)"
 * - block tags → newline boundaries
 * Tags/attrs other than these are stripped.
 */
function htmlToMarkdownLite(html: string): string {
  let s = html
    // Strip script/style
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
    // Images: capture alt + src in any attribute order
    .replace(/<img\s+([^>]*?)\/?>/gi, (_m, attrs) => {
      const alt = /alt=(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const src = /src=(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const a = alt ? alt[1] || alt[2] : "";
      const u = src ? src[1] || src[2] : "";
      return `![${a}](${u})`;
    })
    // Anchors
    .replace(/<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi, (_m, attrs, text) => {
      const href = /href=(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const u = href ? href[1] || href[2] : "";
      return u ? `[${text}](${u})` : text;
    })
    // Block boundaries
    .replace(/<\/?(?:div|p|li|br|tr|section|article)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"');
  // Collapse whitespace runs but preserve newlines
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

interface RowToBackfill {
  marathonId: string;
  editionId: string;
  year: number;
  sourceUrl: string;
  marathonName: string;
}

async function loadTargets(): Promise<RowToBackfill[]> {
  const where = ONLY_URL ? `AND ms.source_url = $1` : ``;
  // --only-new: skip editions that already have rich data (certification_grade
  // is the most reliable "was this run before?" sentinel since every parse
  // populates it for any A/B/C race; unmatched races stay null but we'd
  // re-process them which is fine — they're rare).
  const onlyNewClause = ONLY_NEW
    ? `AND m.certification_grade IS NULL AND e.distance_options IS NULL`
    : ``;
  const params = ONLY_URL ? [ONLY_URL] : [];
  const r = await pool.query(
    `SELECT m.id AS marathon_id, e.id AS edition_id, e.year, ms.source_url, m.name
     FROM marathon_sources ms
     JOIN marathons m ON m.id = ms.marathon_id
     JOIN marathon_editions e ON e.marathon_id = m.id
     WHERE ms.source_url LIKE 'https://www.nowrun.cn/race/%'
       AND e.year = 2026
       ${where}
       ${onlyNewClause}
     ORDER BY ms.source_url`,
    params,
  );
  return r.rows.map((row) => ({
    marathonId: row.marathon_id,
    editionId: row.edition_id,
    year: row.year,
    sourceUrl: row.source_url,
    marathonName: row.name,
  }));
}

async function applyParsed(
  target: RowToBackfill,
  parsed: ParsedRace,
): Promise<void> {
  if (DRY) return;
  // Update marathons (only fields that were extracted, leave others alone)
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

  // Update marathon_editions
  const eUpdates: string[] = [];
  const eValues: any[] = [];
  let eIdx = 1;
  if (parsed.distanceOptions !== null) {
    eUpdates.push(`distance_options = $${eIdx++}::jsonb`);
    eValues.push(JSON.stringify(parsed.distanceOptions));
  }
  if (parsed.highlights !== null) {
    eUpdates.push(`highlights = $${eIdx++}`);
    eValues.push(parsed.highlights);
  }
  if (parsed.startLocation !== null) {
    eUpdates.push(`start_location = $${eIdx++}`);
    eValues.push(parsed.startLocation);
  }
  if (parsed.finishLocation !== null) {
    eUpdates.push(`finish_location = $${eIdx++}`);
    eValues.push(parsed.finishLocation);
  }
  if (parsed.packetPickupLocation !== null) {
    eUpdates.push(`packet_pickup_location = $${eIdx++}`);
    eValues.push(parsed.packetPickupLocation);
  }
  if (parsed.medalImageUrls !== null) {
    eUpdates.push(`medal_image_urls = $${eIdx++}::text[]`);
    eValues.push(parsed.medalImageUrls);
  }
  if (parsed.registrationChannels !== null) {
    eUpdates.push(`registration_channels = $${eIdx++}::text[]`);
    eValues.push(parsed.registrationChannels);
  }
  if (parsed.officialDocuments !== null) {
    eUpdates.push(`official_documents = $${eIdx++}::jsonb`);
    eValues.push(JSON.stringify(parsed.officialDocuments));
  }
  if (eUpdates.length > 0) {
    eUpdates.push(`updated_at = NOW()`);
    eValues.push(target.editionId);
    await pool.query(
      `UPDATE marathon_editions SET ${eUpdates.join(", ")} WHERE id = $${eIdx}`,
      eValues,
    );
  }
}

function summarize(p: ParsedRace): string {
  const parts: string[] = [];
  if (p.certificationGrade) parts.push(`${p.certificationGrade}类`);
  if (p.organizer) parts.push("主办");
  if (p.distanceOptions?.length) parts.push(`${p.distanceOptions.length}项`);
  if (p.highlights) parts.push("亮点");
  if (p.startLocation) parts.push("起");
  if (p.finishLocation) parts.push("终");
  if (p.packetPickupLocation) parts.push("领物");
  if (p.medalImageUrls?.length) parts.push(`奖牌×${p.medalImageUrls.length}`);
  if (p.officialDocuments) parts.push(`文档×${Object.keys(p.officialDocuments).length}`);
  if (p.officialWechatAccount) parts.push("公众号");
  if (p.registrationChannels?.length) parts.push(`渠道×${p.registrationChannels.length}`);
  return parts.length > 0 ? parts.join(" ") : "(无字段)";
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
    const md = await fetchRaceMarkdown(t.sourceUrl);
    if (!md) {
      failed++;
      console.log("FETCH FAIL");
      continue;
    }
    const parsed = parseNowRunMarkdown(md);
    const summary = summarize(parsed);
    if (summary === "(无字段)") zero++;
    else parsedFields++;
    console.log(summary);
    try {
      await applyParsed(t, parsed);
    } catch (err) {
      failed++;
      console.warn(`  apply failed: ${err}`);
    }
    // polite delay
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(
    `\nDone. processed=${processed} extracted=${parsedFields} empty=${zero} failed=${failed}`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
