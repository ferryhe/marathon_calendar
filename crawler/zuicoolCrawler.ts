/**
 * 最酷体育（Zuicool）爬虫 - 真实数据抓取
 * 
 * 从最酷体育网站抓取马拉松赛事数据
 * 用法：cd /opt/marathon_calendar && npx tsx crawler/zuicoolCrawler.ts
 */

import { load } from "cheerio";

// ================== 配置 ==================

const ZUICOOL_CONFIG = {
  baseUrl: "https://zuicool.com",
  timeout: 15000,
  retryMax: 3,
  retryBackoffMs: 1000,
};

// ================== 类型 ==================

interface RawMarathonEvent {
  name: string;
  city: string;
  province: string;
  country: string;
  date: string;
  url: string;
  description?: string;
  registrationStatus?: string;
}

// ================== 工具函数 ==================

async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout: number; retryMax: number; retryBackoffMs: number }
): Promise<string> {
  const { timeout, retryMax, retryBackoffMs, ...fetchOptions } = options;
  
  for (let attempt = 1; attempt <= retryMax; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      if (attempt === retryMax) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryBackoffMs * attempt));
    }
  }
  
  throw new Error("All retries failed");
}

/**
 * 解析日期字符串
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const patterns = [
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
  ];
  
  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  
  return null;
}

/**
 * 清理城市名称
 */
function cleanCityName(city: string): string {
  if (!city) return '未知';
  // 去除多余空白和特殊字符
  return city.replace(/\s+/g, ' ').trim() || '未知';
}

/**
 * 提取省份和城市
 */
function extractProvinceCity(locationText: string): { province: string; city: string } {
  let province = '';
  let city = '';
  
  if (!locationText) return { province: '', city: '未知' };
  
  // 匹配省份
  const provinceMatch = locationText.match(/([\u4e00-\u9fa5]+省|[\u4e00-\u9fa5]+自治区|[\u4e00-\u9fa5]+特别行政区)/);
  if (provinceMatch) {
    province = provinceMatch[1];
  }
  
  // 匹配城市
  const cityMatch = locationText.match(/([\u4e00-\u9fa5]+市|[\u4e00-\u9fa5]+州|[\u4e00-\u9fa5]+县|[\u4e00-\u9fa5]+区)/);
  if (cityMatch) {
    city = cityMatch[1];
  }
  
  return { province, city: city || '未知' };
}

/**
 * 解析赛事列表页面
 */
function parseEventList(html: string): RawMarathonEvent[] {
  const $ = load(html);
  const events: RawMarathonEvent[] = [];
  const seen = new Set<string>();
  
  // 基于实际页面结构的选择器
  $('h3 a[href*="/event/"], h4 a[href*="/event/"]').each((_, el) => {
    try {
      const $el = $(el);
      const name = $el.text().trim();
      
      if (!name || name.length < 3 || name.length > 80) return;
      if (name.includes('登录') || name.includes('注册')) return;
      
      const url = $el.attr('href') || '';
      const fullUrl = url.startsWith('http') ? url : `${ZUICOOL_CONFIG.baseUrl}${url}`;
      const key = `${name}-${fullUrl}`;
      if (seen.has(key)) return;
      seen.add(key);
      
      // 找到父容器获取更多信息
      const $container = $el.closest('div, section, article');
      const containerText = $container?.text() || '';
      
      // 提取日期
      let date = '';
      const dateMatch = containerText.match(/(\d{4})\.?(\d{1,2})\.?(\d{1,2})/);
      if (dateMatch) {
        date = parseDate(dateMatch[0]) || '';
      }
      
      // 提取地点 - 使用清理后的城市
      const { province, city } = extractProvinceCity(containerText);
      
      // 解析报名状态
      let registrationStatus = 'unknown';
      if (containerText.includes('报名中') || containerText.includes('立即报名')) {
        registrationStatus = '报名中';
      } else if (containerText.includes('已截止')) {
        registrationStatus = '已截止';
      } else if (containerText.includes('即将开始')) {
        registrationStatus = '即将开始';
      } else if (containerText.includes('报满') || containerText.includes('售罄')) {
        registrationStatus = '已报满';
      }
      
      // 获取描述
      const description = $container?.find('p').first().text().trim() || '';
      
      events.push({
        name,
        city: cleanCityName(city),
        province,
        country: 'China',
        date,
        url: fullUrl,
        description: description.substring(0, 200),
        registrationStatus,
      });
    } catch (e) {
      // 跳过解析错误的元素
    }
  });
  
  return events;
}

/**
 * 抓取赛事列表
 */
async function crawlZuicool(): Promise<RawMarathonEvent[]> {
  console.log(`Crawling: ${ZUICOOL_CONFIG.baseUrl}/events`);
  
  try {
    const html = await fetchWithRetry(`${ZUICOOL_CONFIG.baseUrl}/events`, {
      timeout: ZUICOOL_CONFIG.timeout,
      retryMax: ZUICOOL_CONFIG.retryMax,
      retryBackoffMs: ZUICOOL_CONFIG.retryBackoffMs,
    });
    
    const events = parseEventList(html);
    console.log(`Found ${events.length} events`);
    
    return events;
  } catch (error) {
    console.error('Crawl error:', error);
    return [];
  }
}

// ================== 主函数 ==================

async function main() {
  console.log("Starting Zuicool crawler...");
  console.log("---");
  
  try {
    const events = await crawlZuicool();
    
    console.log("\n--- Results ---");
    console.log(`Total: ${events.length} events\n`);
    
    // 打印前10个赛事
    events.slice(0, 10).forEach((e, i) => {
      console.log(`${i+1}. ${e.name}`);
      console.log(`   Date: ${e.date}, City: ${e.city}, Province: ${e.province}`);
      console.log(`   Status: ${e.registrationStatus}`);
      console.log(`   URL: ${e.url}\n`);
    });
    
    // 导出JSON
    console.log("\n--- JSON Output ---");
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zuicool",
      total: events.length,
      events: events,
    }, null, 2));
    
  } catch (error) {
    console.error("Failed:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { crawlZuicool, type RawMarathonEvent };
