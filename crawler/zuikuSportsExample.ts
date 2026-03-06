/**
 * 最酷体育（Zuicool）爬虫示例
 * 
 * 本文件展示了一个完整的爬虫实现示例，包括：
 * 1. 使用 Cheerio 解析 HTML
 * 2. 实现增量更新逻辑（基于 content hash）
 * 3. 添加错误重试机制（带线性退避）
 * 
 * 用法：
 * - 作为参考模板来添加新的数据源
 * - 可直接运行进行测试: npx tsx crawler/zuikuSportsExample.ts
 */

import crypto from "crypto";
import { load, type CheerioAPI } from "cheerio";
import { type RawEvent, type ParsedEvent, type ChangeDetection } from "./types";

// ================== 配置 ==================

interface ZuikuSportsConfig {
  baseUrl: string;
  timeout: number;
  retryMax: number;
  retryBackoffMs: number;
  selectors: {
    eventList: string;
    eventLink: string;
    eventTitle: string;
    eventDate: string;
    eventCity: string;
    registrationStatus: string;
    registrationUrl: string;
  };
}

const ZUIKU_SPORTS_CONFIG: ZuikuSportsConfig = {
  baseUrl: "https://www.zuicool.com",
  timeout: 15000,
  retryMax: 3,
  retryBackoffMs: 1000,
  selectors: {
    eventList: ".event-list .event-item, .race-event-item, article.event",
    eventLink: "a[href*='/event/']",
    eventTitle: "h3.title, .event-title, h2",
    eventDate: ".date, .time, [class*='date']",
    eventCity: ".city, .location, [class*='city']",
    registrationStatus: ".status, .registration-status, [class*='status']",
    registrationUrl: "a[href*='register'], a[href*='baoming'], .register-btn",
  },
};

// ================== 类型 ==================

interface ZuikuRawEvent extends RawEvent {
  sourceUrl: string;
  contentHash: string;
}

// ================== 工具函数 ==================

/**
 * 带重试的 HTTP 请求
 * 实现线性退避策略和超时控制
 */
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
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...fetchOptions.headers,
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      if (attempt === retryMax) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed, retrying in ${retryBackoffMs * attempt}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryBackoffMs * attempt));
    }
  }
  
  throw new Error("All retry attempts failed");
}

/**
 * 计算内容哈希
 * 用于增量更新检测
 */
function computeContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * 解析日期字符串
 * 支持多种日期格式
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // 尝试多种日期格式
  const patterns = [
    // 2026年3月15日
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    // 2026-03-15
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // 2026/03/15
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
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
 * 解析报名状态
 */
function parseRegistrationStatus(statusStr: string): "open" | "closed" | "sold-out" | "unknown" {
  if (!statusStr) return "unknown";
  
  const status = statusStr.toLowerCase();
  
  if (status.includes("报名中") || status.includes("开放") || status.includes("open")) {
    return "open";
  }
  if (status.includes("已截止") || status.includes("结束") || status.includes("closed")) {
    return "closed";
  }
  if (status.includes("名额") || status.includes("售罄") || status.includes("sold")) {
    return "sold-out";
  }
  
  return "unknown";
}

/**
 * 检测内容变化
 * 基于 SHA-256 哈希进行增量更新
 */
function detectChanges(oldHash: string | undefined, newContent: string): ChangeDetection {
  const newHash = computeContentHash(newContent);
  const hasChanges = oldHash !== newHash;
  
  return {
    hasChanges,
    changes: hasChanges ? { contentHash: { old: oldHash, new: newHash } } : {},
    requiresUpdate: hasChanges,
    changesSummary: hasChanges ? `Content changed: ${oldHash?.slice(0, 8)} -> ${newHash.slice(0, 8)}` : undefined,
  };
}

// ================== 爬虫核心 ==================

/**
 * 解析赛事列表页面
 * 使用多层选择器回退策略
 */
function parseEventList($: CheerioAPI, config: ZuikuSportsConfig): ZuikuRawEvent[] {
  const events: ZuikuRawEvent[] = [];
  
  $(config.selectors.eventList).each((_, element) => {
    try {
      const $el = $(element);
      
      // 提取赛事名称
      const title = $el.find(config.selectors.eventTitle).first().text().trim();
      if (!title) return;
      
      // 提取赛事链接
      const link = $el.find(config.selectors.eventLink).first();
      const eventUrl = link.attr("href") || "";
      const fullEventUrl = eventUrl.startsWith("http") 
        ? eventUrl 
        : `${config.baseUrl}${eventUrl}`;
      
      // 提取日期
      const dateStr = $el.find(config.selectors.eventDate).first().text().trim();
      const date = parseDate(dateStr);
      
      // 提取城市
      const city = $el.find(config.selectors.eventCity).first().text().trim();
      
      // 提取报名状态
      const statusStr = $el.find(config.selectors.registrationStatus).first().text().trim();
      const status = parseRegistrationStatus(statusStr);
      
      // 提取报名链接
      const registerLink = $el.find(config.selectors.registrationUrl).first();
      const registerUrl = registerLink.attr("href") || "";
      
      // 计算内容哈希（用于变化检测）
      const contentHash = computeContentHash(
        `${title}|${date}|${city}|${status}|${eventUrl}`
      );
      
      events.push({
        name: title,
        city: city || "未知",
        date: date || "",
        registrationUrl: registerUrl.startsWith("http") ? registerUrl : `${config.baseUrl}${registerUrl}`,
        status,
        sourceUrl: fullEventUrl,
        contentHash,
      });
    } catch (error) {
      console.error("Error parsing event element:", error);
    }
  });
  
  return events;
}

/**
 * 解析单个赛事详情页面
 */
async function parseEventDetail(
  eventUrl: string,
  config: ZuikuSportsConfig
): Promise<ParsedEvent | null> {
  try {
    const html = await fetchWithRetry(eventUrl, {
      timeout: config.timeout,
      retryMax: config.retryMax,
      retryBackoffMs: config.retryBackoffMs,
    });
    
    const $ = load(html);
    
    // 这里可以添加更详细的解析逻辑
    // 例如从 JSON-LD 中提取数据
    
    return null; // 返回 null 表示使用列表页的简化数据
  } catch (error) {
    console.error(`Error fetching event detail from ${eventUrl}:`, error);
    return null;
  }
}

/**
 * 抓取所有赛事数据
 */
async function crawlZuikuSports(): Promise<ZuikuRawEvent[]> {
  const config = ZUIKU_SPORTS_CONFIG;
  const events: ZuikuRawEvent[] = [];
  
  // 需要抓取的列表页
  const listPages = [
    "/events/marathon",
    "/events/half-marathon", 
    "/events/10k",
  ];
  
  for (const page of listPages) {
    const url = `${config.baseUrl}${page}`;
    console.log(`Crawling: ${url}`);
    
    try {
      const html = await fetchWithRetry(url, {
        timeout: config.timeout,
        retryMax: config.retryMax,
        retryBackoffMs: config.retryBackoffMs,
      });
      
      const $ = load(html);
      const pageEvents = parseEventList($, config);
      events.push(...pageEvents);
      
      console.log(`Found ${pageEvents.length} events on ${page}`);
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
    }
  }
  
  return events;
}

// ================== 主函数 ==================

async function main() {
  console.log("Starting Zuiku Sports crawler...");
  console.log("Configuration:", JSON.stringify(ZUIKU_SPORTS_CONFIG, null, 2));
  console.log("---");
  
  try {
    const events = await crawlZuikuSports();
    
    console.log("---");
    console.log(`Total events found: ${events.length}`);
    
    // 打印前 5 个赛事作为示例
    console.log("\nSample events:");
    events.slice(0, 5).forEach((event, index) => {
      console.log(`${index + 1}. ${event.name}`);
      console.log(`   City: ${event.city}`);
      console.log(`   Date: ${event.date}`);
      console.log(`   Status: ${event.status}`);
      console.log(`   URL: ${event.sourceUrl}`);
      console.log(`   Hash: ${event.contentHash.slice(0, 16)}...`);
      console.log("");
    });
    
    // 示例：变化检测
    console.log("\n--- Change Detection Example ---");
    const oldHash = events[0]?.contentHash;
    const newContent = `${events[0]?.name}|${events[0]?.date}|${events[0]?.city}|${events[0]?.status}`;
    const changeResult = detectChanges(oldHash, newContent);
    console.log("Change detection result:", changeResult);
    
  } catch (error) {
    console.error("Crawler failed:", error);
    process.exit(1);
  }
}

// 导出供其他模块使用
export {
  crawlZuikuSports,
  parseEventList,
  parseEventDetail,
  ZUIKU_SPORTS_CONFIG,
  type ZuikuSportsConfig,
  type ZuikuRawEvent,
};

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
