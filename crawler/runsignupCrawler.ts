/**
 * runsignup.com 爬虫 - 美国马拉松/跑步赛事数据
 *
 * 从 runsignup.com 抓取未来赛事数据（仅限未来赛事，过往赛事自动跳过）
 * 支持全马（26.2mi）和半马（13.1mi）
 *
 * 用法（从项目根目录运行，路径自动用相对定位）：
 *   npx tsx crawler/runsignupCrawler.ts
 *   npx tsx crawler/runsignupCrawler.ts --distance=13.1  # 半马
 *   npx tsx crawler/runsignupCrawler.ts --dry-run        # 测试模式
 *
 * 防封策略：
 *   - 列表页：4 秒间隔
 *   - 详情页：1.5 秒间隔
 *   - 每 50 请求后冷却 30 秒
 *   - UA 轮换
 */

import { load } from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { dataDir as makeDataDir } from './_paths';

// ================== 配置 ==================

const CONFIG = {
  baseUrl: 'https://runsignup.com',
  // 慢速请求（防封）
  delayListPage: 4,      // 秒 - 列表页翻页间隔
  delayDetail: 1.5,      // 秒 - 详情页间隔
  coolDownAfter: 50,     // 次请求后冷却
  coolDownTime: 30,      // 秒 - 冷却时长
  // 调试模式
  dryRun: false,
  startPage: 1,
  maxPagesPerMonth: 50,
  // 距离筛选：26.2=全马，13.1=半马（支持所有 runsignup 支持的距离）
  distance: '26.2',
};

// UA 轮换池
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

let uaIndex = 0;
function nextUA(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

// ================== 类型 ==================

export interface RunsignupEvent {
  race_id: string;
  canonical_name: string;   // 导入数据库必需
  name: string;
  name_en?: string;        // 英文名（与国际数据库对齐）
  date: string;
  end_date?: string;
  city?: string;
  state?: string;
  country?: string;
  location_name?: string;
  street_address?: string;
  postal_code?: string;
  organizer?: string;
  description?: string;
  url: string;
  registration_url?: string;
  registration_status?: 'open' | 'sold-out' | 'closed' | 'unknown';
  image?: string;
  price_range?: string;
  website_url?: string;    // 赛事独立官网
  source: string;
  race_kind: 'marathon' | 'half-marathon' | 'ultra' | 'trail' | 'other';
  scraped_at: string;
}

// 噪音关键词：明确不是独立赛事的数据，过滤掉
const NOISE_PATTERNS: RegExp[] = [
  /\bkids\b/i, /\byouth\b/i, /\btraining\b/i, /\bprogram\b/i,
  /\bcamp\b/i, /\bvirtual\b/i, /\bduathlon\b/i, /\btriathlon\b/i,
  /\bswim\b/i, /\bpaddle\b/i, /\bruck march\b/i, /\bwalk\/run\b/i,
  /\bmile\b/i, /\b5k\b/i, /\b10k\b/i, /\b3k\b/i, /\b1\s*mile\b/i,
  /\b1k\b/i, /\bsprint\b/i, /\btrack meet\b/i, /\bboot camp\b/i,
  /\bexpo\b/i, /\bvolunteer\b/i, /\bdonation\b/i, /\bfun run\b/i,
  /^\d{1,2}$/, /\bfun run\b/i, /\bopen water\b/i,
  /\bwhole series\b/i, /\bweek\s*[0-9]+\b/i,
  /\bhiit back\b/i, /\bboogie nights\b/i, /\bdave.*brew\b/i,
  /\bhixon trail\b/i, /\bperspective pacing\b/i, /\brace the clock\b/i,
  /\bfrc\b/i, /\bcommunity trail runs\b/i, /\bteam heart & sole\b/i,
  /\bpeak when it counts\b/i, /\bprogression\b/i, /\barmy heritage\b/i,
  /\broad to\b/i,
];

// 组合噪音：多个关键词同时出现才认为是噪音
const COMPOUND_NOISE_RE = [
  { re: /\bpacer\b.*registration|registration.*pacer/i },
  { re: /\bdu\s+series\b/i },
  { re: /\btraining\s+program\b/i },
];

function isNoiseEvent(name: string): boolean {
  const lower = name.toLowerCase();
  if (NOISE_PATTERNS.some(re => re.test(lower))) return true;
  if (COMPOUND_NOISE_RE.some(({ re }) => re.test(lower))) return true;
  return false;
}

// ================== 工具函数 ==================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowISO(): string {
  return new Date().toISOString();
}

async function fetchWithUA(url: string, timeout = 30000): Promise<string> {
  const ua = nextUA();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function stripHtml(html: string): string {
  if (!html) return '';
  const $ = load(`<div>${html}</div>`);
  return $.text().replace(/\s+/g, ' ').trim();
}

/**
 * 生成 canonical_name：{slug}-{year}-runsignup
 * 用于数据库去重合并（与其他数据源对齐）
 * slug 生成策略：去除年份/距离词/赛事类型词后 slugify
 */
function makeCanonicalName(name: string, date: string): string {
  const year = date.slice(0, 4);
  const slug = name
    .toLowerCase()
    // 去除 accents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // 去除年份（避免 marathon-name-2026-2026）
    .replace(/\b(19|20)\d{2}\b/g, '')
    // 去除常见赛事类型词，统一 stem
    .replace(/\b(marathon|half[\s-]?marathon|ultra|trail|5k|10k|half|kids|youth|open|classic|championship|annual|edition)\b/g, '')
    // 去除标点，只留字母数字空格
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return `${slug || 'race'}-${year}-runsignup`;
}

function extractRaceId(html: string): string | undefined {
  const m = html.match(/[?&]raceId=(\d+)/);
  if (m) return m[1];
  const m2 = html.match(/"race_id"\s*:\s*"?(\d+)/);
  if (m2) return m2[1];
  return undefined;
}

function extractRegistrationUrl(html: string): string | undefined {
  // 找注册按钮的 href（优先找 Sign Up 状态的）
  const re = new RegExp('href="(\\/Race\\/Register\\/\\?raceId=\\d+[^"]*)"');
  const m = html.match(re);
  if (m) {
    return 'https://runsignup.com' + m[1].replace(/&amp;/g, '&');
  }
  return undefined;
}

/**
 * 从注册按钮文字推断报名状态
 * - "Sign Up" / "Register" → open
 * - "Sold Out" → sold-out
 * - "Closed" → closed
 * - 无按钮或找不到 → unknown
 */
function extractRegistrationStatus(html: string): 'open' | 'sold-out' | 'closed' | 'unknown' {
  const $ = load(html);
  let status: 'open' | 'sold-out' | 'closed' | 'unknown' = 'unknown';

  // 优先找子赛事 tile 中的注册按钮（多个子赛事共用一个详情页）
  // 每个 rsuEventTile__actionBtn 里的按钮文字决定该子赛事状态
  $('.rsuEventTile__actionBtn a, .actionBtn a').each((_, el) => {
    if (status !== 'unknown') return false; // 已找到就停
    const text = $(el).text().trim().toLowerCase();
    if (text.includes('sold out')) {
      status = 'sold-out';
    } else if (text.includes('register') || text.includes('sign up')) {
      status = 'open';
    } else if (text.includes('closed')) {
      status = 'closed';
    }
    return true;
  });

  // 全局兜底：如果详情页里根本没有任何注册按钮，可能是已截止
  if (status === 'unknown') {
    const lower = html.toLowerCase();
    if (lower.includes('sold out') || lower.includes('sold-out')) {
      status = 'sold-out';
    } else if (lower.includes('registration closed') || lower.includes('registration is closed')) {
      status = 'closed';
    }
  }

  return status;
}

/**
 * 提取赛事独立官网
 * 位置：<h2>Race Website</h2> 区块下的 <a href="外部URL">
 */
function extractWebsiteUrl(html: string): string | undefined {
  // 找 <h2>Race Website</h2> 之后紧跟的 <a href="http...">（非 runsignup 域名）
  const idx = html.indexOf('<h2>Race Website</h2>');
  if (idx < 0) return undefined;

  const section = html.slice(idx, idx + 1000);
  const match = section.match(/href="(https?:\/\/(?!runsignup|cloudfront)[^"]+)"/);
  if (match) {
    return match[1];
  }
  return undefined;
}

function extractPriceRange(html: string): string | undefined {
  const $ = load(html);
  const prices: string[] = [];
  // 每个子赛事 tile 里的价格：<span class="sr-only">Price:</span>$30
  // 先找所有含 sr-only Price 的上下文，再提取数字
  $('.rsuEventTile__price').each((_, el) => {
    const text = $(el).text().trim();
    // 去掉 "Price:" 等屏幕阅读文字，只留价格
    const cleaned = text.replace(/[^$0-9,\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned) prices.push(cleaned);
  });
  if (prices.length > 0) {
    const unique = Array.from(new Set(prices));
    return unique.join(' / ');
  }
  return undefined;
}

function isFutureDate(isoDate: string | undefined): boolean {
  if (!isoDate) return false;
  try {
    const eventMs = new Date(isoDate).getTime();
    return eventMs > Date.now();
  } catch {
    return false;
  }
}

/**
 * 根据赛事名判断类型（全马/半马/超马/越野/其他）
 * 精确匹配，避免误判
 */
function inferRaceKind(name: string): 'marathon' | 'half-marathon' | 'ultra' | 'trail' | 'other' {
  const lower = name.toLowerCase();
  // 全马：必须有 marathon，且不含 half
  if (/\bmarathon\b/.test(lower) && !/\bhalf\b/.test(lower)) {
    return 'marathon';
  }
  // 半马
  if (/\bhalf[\s-]?marathon\b/.test(lower)) {
    return 'half-marathon';
  }
  // 超马/长距离：ultra / 100mi / 100k / 50mi / 50k / 200k / 300k
  if (/\b(ultra|100\s*mile|100\s*km|50\s*mile|50\s*km|200\s*k|300\s*k)\b/.test(lower)) {
    return 'ultra';
  }
  // 越野/山地
  if (/\b(trail|trail\s*race|trail\s*running|mountain|summit|skyline|ultra-trail)\b/.test(lower)) {
    return 'trail';
  }
  return 'other';
}

// ================== 解析函数 ==================

function parseRaceListPage(html: string): string[] {
  const $ = load(html);
  const urls: string[] = [];
  const seen = new Set<string>();

  // 匹配 /Race/{STATE}/{CITY}/{SLUG} 格式的链接
  // 注意：HTML 中 href 值可能被 HTML 实体编码（&amp;）
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('/Race/Register') || href.includes('page=')) return;
    // 允许 href 包含 HTML 实体编码，先 decode
    const decoded = href.replace(/&amp;/g, '&');
    const match = decoded.match(/^\/Race\/[A-Z]{2}\/[^/]+\/[^/]+/);
    if (match) {
      const full = 'https://runsignup.com' + match[0];
      if (!seen.has(full)) {
        seen.add(full);
        urls.push(full);
      }
    }
  });

  return urls;
}

function getTotalPages(html: string): number {
  const matches = html.match(/page=(\d+)/g);
  if (!matches) return 1;
  const pages = matches.map((m: string) => parseInt(m.replace('page=', '')));
  return Math.max(...pages, 1);
}

function isEmptyResults(html: string): boolean {
  const indicators = [
    'no races found',
    'no upcoming races',
    'no-results',
    '0 results',
    'we couldn\'t find',
  ];
  const lower = html.toLowerCase();
  return indicators.some(ind => lower.includes(ind));
}

function normalizeUrl(url: string): string {
  return url.split('?')[0];
}

function buildEvent(
  item: any,
  html: string,
  baseUrl: string,
  raceId: string,
  distance: string,
): RunsignupEvent | null {
  const rawDate = item.startDate;
  if (!isFutureDate(rawDate)) return null; // 过往赛事跳过

  const loc = item.location || {};
  const addr = (typeof loc === 'object' && loc.address) ? loc.address : {};

  const url = normalizeUrl(item.url || baseUrl);
  const name = item.name || '';

  // 噪音过滤：训练营/儿童/虚拟赛等不是真实赛事
  if (isNoiseEvent(name)) return null;

  // race_kind：优先用配置的距离参数判断，其次从名称推断
  let raceKind: 'marathon' | 'half-marathon' | 'ultra' | 'trail' | 'other' = 'other';
  if (distance === '26.2') {
    raceKind = inferRaceKind(name);
  } else if (distance === '13.1') {
    raceKind = 'half-marathon';
  } else {
    raceKind = inferRaceKind(name);
  }

  // 子赛事区分 slug（用于生成唯一 race_id）
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const subRaceId = slug ? `${raceId}-${slug}` : raceId;

  return {
    race_id: subRaceId,
    canonical_name: makeCanonicalName(name, rawDate),
    name: name,
    name_en: name, // runsignup 全英文，name 即英文名
    date: rawDate || '',
    end_date: item.endDate || undefined,
    city: addr.addressLocality || undefined,
    state: addr.addressRegion || undefined,
    country: addr.addressCountry || undefined,
    location_name: (typeof loc === 'object') ? (loc.name || undefined) : undefined,
    street_address: addr.streetAddress || undefined,
    postal_code: addr.postalCode || undefined,
    organizer: (typeof item.organizer === 'object')
      ? (item.organizer.name || undefined)
      : undefined,
    description: item.description ? stripHtml(item.description) : undefined,
    url: url,
    registration_url: extractRegistrationUrl(html),
    registration_status: extractRegistrationStatus(html),
    image: item.image || undefined,
    price_range: extractPriceRange(html),
    website_url: extractWebsiteUrl(html),
    source: 'runsignup',
    race_kind: raceKind,
    scraped_at: nowISO(),
  };
}

function parseRaceDetail(html: string, url: string, distance: string): RunsignupEvent[] {
  const $ = load(html);

  // 1. 提取主 raceId
  const raceIdMatch = html.match(/"raceId":\s*(\d+)/);
  const raceId = raceIdMatch ? raceIdMatch[1] : '';

  // 2. 解析所有 JSON-LD SportsEvent
  const events: RunsignupEvent[] = [];
  const seenKeys = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() || '';
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        if (item && item['@type'] === 'SportsEvent') {
          const event = buildEvent(item, html, url, raceId, distance);
          if (event) {
            // 去重 key：name + date(到日) + city + state
            // 不同子赛事（主马/半马/10K）name 不同，按 name 去重即可
            const dateDay = event.date.slice(0, 10);
            const key = `${event.name}|${dateDay}|${event.city}|${event.state}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              events.push(event);
            }
          }
        }
      }
    } catch {}
  });

  return events;
}

// ================== 核心爬取逻辑 ==================

async function crawlMonth(
  year: number,
  month: number,
  outputFile: string,
  seenIds: Set<string>,
  requestCount: { n: number },
  dryRun = false,
): Promise<{ newRaces: number; pagesScanned: number }> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const startStr = monthStart.toISOString().split('T')[0];
  const endStr = monthEnd.toISOString().split('T')[0];

  console.log(`\n  [${year}-${String(month).padStart(2, '0')}] ${startStr} ~ ${endStr} (distance=${CONFIG.distance})`);

  let page = CONFIG.startPage;
  let consecutiveEmpty = 0;
  let newRaces = 0;
  let pagesScanned = 0;

  while (page <= CONFIG.maxPagesPerMonth) {
    // 冷却检查
    if (requestCount.n > 0 && requestCount.n % CONFIG.coolDownAfter === 0) {
      console.log(`  ⏸️  Request count ${requestCount.n} — cooling down ${CONFIG.coolDownTime}s...`);
      await sleep(CONFIG.coolDownTime * 1000);
    }

    const listUrl = `${CONFIG.baseUrl}/Races?start_date=${startStr}&end_date=${endStr}&distance=${CONFIG.distance}&page=${page}`;
    console.log(`  Page ${page}: ${listUrl}`);

    let html = '';
    try {
      html = await fetchWithUA(listUrl);
      requestCount.n++;
    } catch (err) {
      console.log(`  ❌ Fetch list failed: ${err}. Wait 60s...`);
      await sleep(60000);
      continue;
    }

    // 空结果检测
    if (isEmptyResults(html)) {
      consecutiveEmpty++;
      console.log(`  Empty page ${page} (${consecutiveEmpty}/3)`);
      if (consecutiveEmpty >= 3) {
        console.log(`  No more pages for this month.`);
        break;
      }
      page++;
      await sleep(CONFIG.delayListPage * 1000);
      continue;
    }
    consecutiveEmpty = 0;

    const raceUrls = parseRaceListPage(html);
    console.log(`  Found ${raceUrls.length} race URLs on page ${page}`);
    pagesScanned++;

    if (raceUrls.length === 0) {
      break;
    }

    for (const raceUrl of raceUrls) {
      let detailHtml = '';
      try {
        detailHtml = await fetchWithUA(raceUrl);
        requestCount.n++;
      } catch (err) {
        console.log(`  ❌ Fetch detail failed for ${raceUrl}: ${err}`);
        await sleep(60000);
        continue;
      }

      const races = parseRaceDetail(detailHtml, raceUrl, CONFIG.distance);

      if (races.length === 0) {
        await sleep(CONFIG.delayDetail * 1000);
        continue;
      }

      for (const race of races) {
        if (seenIds.has(race.race_id)) {
          console.log(`  ⏭  Duplicate: ${race.name} (id=${race.race_id})`);
          continue;
        }

        seenIds.add(race.race_id);
        newRaces++;

        const statusTag = race.registration_status ? ` [${race.registration_status}]` : '';
        console.log(`  ✅ ${race.name}${statusTag}`);
        console.log(`     ${race.date?.slice(0, 10)} | ${race.city}, ${race.state} | ${race.price_range || 'no price'}`);

        if (!dryRun) {
          const line = JSON.stringify(race, null, 0) + '\n';
          fs.appendFileSync(outputFile, line, 'utf-8');
        }
      }

      await sleep(CONFIG.delayDetail * 1000);
    }

    await sleep(CONFIG.delayListPage * 1000);
    page++;
  }

  return { newRaces, pagesScanned };
}

// ================== 主流程 ==================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startYear = parseInt(args.find(a => a.startsWith('--year='))?.split('=')[1] || String(new Date().getFullYear()));
  const startMonth = parseInt(args.find(a => a.startsWith('--month='))?.split('=')[1] || String(new Date().getMonth() + 1));
  const endYear = parseInt(args.find(a => a.startsWith('--end-year='))?.split('=')[1] || String(startYear));
  const endMonth = parseInt(args.find(a => a.startsWith('--end-month='))?.split('=')[1] || '12');
  const distArg = args.find(a => a.startsWith('--distance='))?.split('=')[1];
  if (distArg) CONFIG.distance = distArg;

  if (dryRun) {
    console.log('🔍 DRY RUN MODE — no data will be written\n');
    CONFIG.dryRun = true;
  }

  const dataDir = makeDataDir('runsignup');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const distSuffix = CONFIG.distance === '13.1' ? '-halfmarathon' : '';
  const outputFile = path.join(dataDir, `races_${nowISO().split('T')[0]}${distSuffix}.jsonl`);
  const seenIdsFile = path.join(dataDir, `seen_ids${distSuffix}.json`);

  // 加载已爬取的 race_id（断点续传）
  let seenIds = new Set<string>();
  if (fs.existsSync(seenIdsFile)) {
    try {
      seenIds = new Set(JSON.parse(fs.readFileSync(seenIdsFile, 'utf-8')));
      console.log(`📂 Loaded ${seenIds.size} seen race IDs\n`);
    } catch {}
  }

  const requestCount = { n: 0 };
  let totalNew = 0;
  let currentYear = startYear;
  let currentMonth = startMonth;

  console.log(`🚀 runsignup crawler (distance=${CONFIG.distance})`);
  console.log(`   Period: ${startYear}-${String(startMonth).padStart(2,'0')} ~ ${endYear}-${String(endMonth).padStart(2,'0')}`);
  console.log(`   Output: ${outputFile}`);
  console.log(`   Delay: list=${CONFIG.delayListPage}s, detail=${CONFIG.delayDetail}s`);
  console.log('');

  const endDate = new Date(endYear, endMonth - 1, 1);

  while (new Date(currentYear, currentMonth - 1, 1) <= endDate) {
    const result = await crawlMonth(
      currentYear,
      currentMonth,
      outputFile,
      seenIds,
      requestCount,
      dryRun,
    );
    totalNew += result.newRaces;

    console.log(`  Monthly summary: +${result.newRaces} new races, ${result.pagesScanned} pages scanned`);

    if (!dryRun) {
      fs.writeFileSync(seenIdsFile, JSON.stringify(Array.from(seenIds)), 'utf-8');
    }

    currentMonth++;
    if (currentMonth > 12) {
      currentYear++;
      currentMonth = 1;
    }
  }

  console.log(`\n✅ Done! Total: +${totalNew} new races, ${requestCount.n} HTTP requests`);
  console.log(`📄 Output: ${outputFile}`);

  if (fs.existsSync(outputFile)) {
    const lines = fs.readFileSync(outputFile, 'utf-8').split('\n').filter(Boolean);
    console.log(`📊 Total races in file: ${lines.length}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
