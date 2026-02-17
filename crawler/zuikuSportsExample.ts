/**
 * 最酷体育爬虫示例
 * 
 * 本文件展示了一个完整的爬虫实现示例，包括：
 * 1. 使用 Cheerio 解析 HTML
 * 2. 实现增量更新逻辑（基于 content hash）
 * 3. 添加错误重试机制（带指数退避）
 * 
 * 注意：实际的爬虫逻辑已集成在 server/syncScheduler.ts 中，本文件作为：
 * - 技术参考文档
 * - 测试和验证示例
 * - 新数据源开发模板
 * 
 * 参考文档：
 * - docs/审查报告/测试文档-最酷体育爬虫实现-2026-02-17.md
 * - docs/项目计划/项目计划-阶段一-1.3-数据采集与调度-详细计划.md
 */

import crypto from "crypto";
import { load, type CheerioAPI } from "cheerio";
import type { RawEvent, ParsedEvent, ChangeDetection } from "./types";

// ============================================================================
// 1. Cheerio HTML 解析示例
// ============================================================================

/**
 * 从 HTML 中提取赛事列表链接
 * 演示 Cheerio 的基础使用：选择器、属性获取、遍历
 */
export function extractEventLinksFromList(html: string, baseUrl: string): Array<{ url: string; title: string }> {
  const $ = load(html);
  const links: Array<{ url: string; title: string }> = [];

  // 使用 CSS 选择器查找所有赛事链接
  // 最酷体育的典型结构：<a class="event-a" href="/event/12345">赛事名称</a>
  $('a.event-a[href*="/event/"]').each((index, element) => {
    const $el = $(element);
    const href = $el.attr("href");
    const title = $el.text().trim();

    if (href) {
      // 处理相对路径 -> 绝对路径
      const absoluteUrl = new URL(href, baseUrl).toString();
      links.push({ url: absoluteUrl, title });
    }
  });

  return links;
}

/**
 * 从详情页提取赛事信息
 * 演示多种提取策略的组合使用
 */
export function extractEventDetails(html: string, pageUrl: string): Partial<RawEvent> | null {
  const $ = load(html);

  // 策略 1: 优先尝试 JSON-LD Event schema（最准确）
  const jsonLdData = extractJsonLdEvent($);
  if (jsonLdData) {
    return jsonLdData;
  }

  // 策略 2: 使用配置的 CSS 选择器规则
  const cssData = extractWithSelectors($, pageUrl);
  if (cssData) {
    return cssData;
  }

  // 策略 3: 正则表达式兜底（最不准确，仅作后备）
  const regexData = extractWithRegex(html);
  return regexData;
}

/**
 * 提取 JSON-LD Event schema（结构化数据）
 * 这是最可靠的提取方式，遵循 schema.org 标准
 */
function extractJsonLdEvent($: CheerioAPI): Partial<RawEvent> | null {
  const events: Array<Record<string, unknown>> = [];

  // 查找所有 JSON-LD script 标签
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const jsonText = $(element).html();
      if (!jsonText) return;

      const parsed = JSON.parse(jsonText);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (item?.["@type"] === "Event" || item?.["@type"]?.includes("Event")) {
          events.push(item as Record<string, unknown>);
        }
      }
    } catch (error) {
      // 忽略无效的 JSON
      console.warn("Failed to parse JSON-LD:", error);
    }
  });

  if (events.length === 0) return null;

  const event = events[0];
  return {
    name: typeof event.name === "string" ? event.name : undefined,
    date: typeof event.startDate === "string" ? event.startDate : undefined,
    city: typeof event.location === "object" && event.location !== null
      ? (event.location as Record<string, unknown>).addressLocality as string
      : undefined,
    registrationUrl: typeof event.url === "string" ? event.url : undefined,
  };
}

/**
 * 使用 CSS 选择器提取（基于配置规则）
 * 模拟 syncScheduler.ts 中的 extractEditionFromHtmlWithConfig 逻辑
 */
function extractWithSelectors($: CheerioAPI, pageUrl: string): Partial<RawEvent> | null {
  const result: Partial<RawEvent> = {};

  // 提取赛事日期
  // 尝试多个可能的选择器
  const dateSelectors = [
    ".event-date",
    ".race-date",
    "[class*='date']",
    "meta[property='event:start_time']",
  ];

  for (const selector of dateSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      const dateText = selector.startsWith("meta")
        ? element.attr("content")
        : element.text();

      if (dateText) {
        const normalized = normalizeDateString(dateText.trim());
        if (normalized) {
          result.date = normalized;
          break;
        }
      }
    }
  }

  // 提取报名状态
  const statusElement = $(".registration-status, .event-status, [class*='status']").first();
  if (statusElement.length > 0) {
    result.status = statusElement.text().trim();
  }

  // 提取报名链接
  const regLinkElement = $("a[href*='register'], a[href*='signup'], a[href*='baoming']").first();
  if (regLinkElement.length > 0) {
    const href = regLinkElement.attr("href");
    if (href) {
      result.registrationUrl = new URL(href, pageUrl).toString();
    }
  }

  // 提取赛事名称
  const nameElement = $("h1, .event-title, .race-title").first();
  if (nameElement.length > 0) {
    result.name = nameElement.text().trim();
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * 正则表达式提取（最后的兜底方案）
 * 仅用于结构化数据和选择器都失败的情况
 */
function extractWithRegex(html: string): Partial<RawEvent> | null {
  const result: Partial<RawEvent> = {};

  // 匹配日期格式：YYYY-MM-DD 或 YYYY年MM月DD日
  const dateMatch1 = html.match(/\b(20\d{2})-(0?\d|1[0-2])-(0?\d|[12]\d|3[01])\b/);
  const dateMatch2 = html.match(/(20\d{2})\s*年\s*(0?\d|1[0-2])\s*月\s*(0?\d|[12]\d|3[01])\s*日/);

  if (dateMatch1) {
    result.date = normalizeDateString(dateMatch1[0]);
  } else if (dateMatch2) {
    const [, year, month, day] = dateMatch2;
    result.date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return result.date ? result : null;
}

/**
 * 日期字符串标准化
 * 将各种格式的日期转换为 YYYY-MM-DD 格式
 */
function normalizeDateString(dateStr: string): string | null {
  // 尝试直接解析 ISO 格式
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    const year = isoDate.getUTCFullYear();
    const month = String(isoDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(isoDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 匹配 YYYY-MM-DD 格式
  const match1 = dateStr.match(/\b(20\d{2})-(0?\d|1[0-2])-(0?\d|[12]\d|3[01])\b/);
  if (match1) {
    const [, year, month, day] = match1;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // 匹配中文格式：2026年3月15日
  const match2 = dateStr.match(/(20\d{2})\s*年\s*(0?\d|1[0-2])\s*月\s*(0?\d|[12]\d|3[01])\s*日/);
  if (match2) {
    const [, year, month, day] = match2;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

// ============================================================================
// 2. 增量更新逻辑示例
// ============================================================================

/**
 * 计算内容 hash（用于变更检测）
 * 使用 SHA-256 算法，确保相同内容产生相同 hash
 */
export function calculateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * 检测内容是否发生变化
 * 返回变更详情和是否需要更新
 */
export function detectChanges(
  oldContent: string | null,
  newContent: string,
  oldData: Partial<RawEvent> | null,
  newData: Partial<RawEvent>,
): ChangeDetection {
  // 情况 1: 首次抓取，肯定有变化
  if (!oldContent || !oldData) {
    return {
      hasChanges: true,
      changes: { _reason: { old: null, new: "initial fetch" } },
      requiresUpdate: true,
      changesSummary: "首次抓取",
    };
  }

  // 情况 2: 内容 hash 未变化，跳过
  const oldHash = calculateContentHash(oldContent);
  const newHash = calculateContentHash(newContent);
  if (oldHash === newHash) {
    return {
      hasChanges: false,
      changes: {},
      requiresUpdate: false,
      changesSummary: "内容未变化",
    };
  }

  // 情况 3: hash 变化，但需要确定哪些字段发生了变化
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  const fields: Array<keyof RawEvent> = ["name", "date", "city", "registrationUrl", "status"];

  for (const field of fields) {
    const oldValue = oldData[field];
    const newValue = newData[field];
    if (oldValue !== newValue) {
      changes[field] = { old: oldValue, new: newValue };
    }
  }

  const hasSignificantChanges = Object.keys(changes).length > 0;
  const changesSummary = Object.keys(changes).join(", ");

  return {
    hasChanges: true,
    changes,
    requiresUpdate: hasSignificantChanges,
    changesSummary: changesSummary || "仅 HTML 内容变化",
  };
}

// ============================================================================
// 3. 错误重试机制示例
// ============================================================================

export interface RetryConfig {
  maxRetries: number;        // 最大重试次数
  backoffSeconds: number;    // 基础退避时间（秒）
  timeoutMs: number;         // 请求超时时间（毫秒）
}

export interface RetryState {
  attempt: number;           // 当前尝试次数
  lastError: Error | null;   // 最后一次错误
  nextRetryAt: Date | null;  // 下次重试时间
}

/**
 * 带重试的 HTTP 请求
 * 实现指数退避策略和超时控制
 */
export async function fetchWithRetry(
  url: string,
  config: RetryConfig,
  onRetry?: (state: RetryState) => void,
): Promise<{ content: string; status: number }> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < config.maxRetries) {
    attempt++;

    try {
      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "marathon-calendar/1.0 (+https://github.com/ferryhe/marathon_calendar)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();
        return { content, status: response.status };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果还有重试机会
      if (attempt < config.maxRetries) {
        // 计算退避时间（指数退避）
        const backoffMs = config.backoffSeconds * attempt * 1000;
        const nextRetryAt = new Date(Date.now() + backoffMs);

        // 通知回调
        if (onRetry) {
          onRetry({ attempt, lastError, nextRetryAt });
        }

        // 等待退避时间
        await sleep(backoffMs);
      }
    }
  }

  // 所有重试都失败
  throw new Error(
    `Failed after ${config.maxRetries} attempts. Last error: ${lastError?.message}`,
  );
}

/**
 * 辅助函数：延迟执行
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 计算下次检查时间
 * 根据成功或失败状态，以及配置的间隔时间
 */
export function calculateNextCheckTime(params: {
  success: boolean;
  attempt?: number;
  minIntervalSeconds: number;
  retryBackoffSeconds?: number;
}): Date {
  const now = Date.now();

  if (params.success) {
    // 成功：使用配置的最小间隔
    return new Date(now + params.minIntervalSeconds * 1000);
  } else {
    // 失败：使用退避策略
    const attempt = params.attempt ?? 1;
    const backoffSeconds = (params.retryBackoffSeconds ?? 30) * attempt;
    const delaySeconds = Math.max(backoffSeconds, params.minIntervalSeconds);
    return new Date(now + delaySeconds * 1000);
  }
}

// ============================================================================
// 4. 完整的爬虫执行示例
// ============================================================================

export interface CrawlerResult {
  success: boolean;
  data: Partial<RawEvent> | null;
  contentHash: string;
  httpStatus: number;
  attempt: number;
  error: string | null;
  changes: ChangeDetection | null;
}

/**
 * 执行完整的爬虫流程
 * 这个函数展示了如何组合上述所有功能
 */
export async function executeCrawler(params: {
  url: string;
  lastContent: string | null;
  lastData: Partial<RawEvent> | null;
  retryConfig: RetryConfig;
  onProgress?: (message: string) => void;
}): Promise<CrawlerResult> {
  const { url, lastContent, lastData, retryConfig, onProgress } = params;

  try {
    // 步骤 1: 获取 HTML（带重试）
    onProgress?.("开始抓取...");
    const { content, status } = await fetchWithRetry(url, retryConfig, (state) => {
      onProgress?.(
        `重试 ${state.attempt}/${retryConfig.maxRetries}: ${state.lastError?.message}`,
      );
    });

    // 步骤 2: 计算 hash 并检测变化
    const contentHash = calculateContentHash(content);
    onProgress?.(`内容 hash: ${contentHash}`);

    // 步骤 3: 提取数据
    const extractedData = extractEventDetails(content, url);
    if (!extractedData) {
      onProgress?.("未能提取到有效数据");
      return {
        success: false,
        data: null,
        contentHash,
        httpStatus: status,
        attempt: 1,
        error: "No data extracted",
        changes: null,
      };
    }

    // 步骤 4: 检测变化
    const changes = detectChanges(lastContent, content, lastData, extractedData);
    onProgress?.(
      `变化检测: ${changes.hasChanges ? changes.changesSummary : "无变化"}`,
    );

    return {
      success: true,
      data: extractedData,
      contentHash,
      httpStatus: status,
      attempt: 1,
      error: null,
      changes,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    onProgress?.(`错误: ${errorMessage}`);

    return {
      success: false,
      data: null,
      contentHash: "",
      httpStatus: 0,
      attempt: retryConfig.maxRetries,
      error: errorMessage,
      changes: null,
    };
  }
}

// ============================================================================
// 5. 使用示例
// ============================================================================

/**
 * 示例：抓取单个赛事页面
 */
export async function exampleUsage() {
  const result = await executeCrawler({
    url: "https://www.zuicool.com/event/12345", // 示例 URL
    lastContent: null, // 首次抓取
    lastData: null,
    retryConfig: {
      maxRetries: 3,
      backoffSeconds: 30,
      timeoutMs: 15000,
    },
    onProgress: (message) => {
      console.log(`[进度] ${message}`);
    },
  });

  if (result.success && result.data) {
    console.log("抓取成功！");
    console.log("提取的数据:", result.data);
    console.log("内容 hash:", result.contentHash);
    console.log("变化情况:", result.changes?.changesSummary);
  } else {
    console.error("抓取失败:", result.error);
  }

  // 计算下次检查时间
  const nextCheck = calculateNextCheckTime({
    success: result.success,
    attempt: result.attempt,
    minIntervalSeconds: 21600, // 6 小时
    retryBackoffSeconds: 30,
  });
  console.log("下次检查时间:", nextCheck);
}

// ============================================================================
// 6. 导出类型和常量
// ============================================================================

export const ZUIKU_SPORTS_CONFIG = {
  name: "最酷体育（Zuicool）",
  baseUrl: "https://www.zuicool.com",
  listUrl: "https://www.zuicool.com/events",
  retryMax: 3,
  retryBackoffSeconds: 30,
  requestTimeoutMs: 15000,
  minIntervalSeconds: 21600, // 6 hours
  selectors: {
    listItemLink: 'a.event-a[href*="/event/"]',
    eventDate: ".event-date, .race-date, [class*='date']",
    registrationStatus: ".registration-status, .event-status",
    registrationUrl: "a[href*='register'], a[href*='signup']",
  },
} as const;

/**
 * 说明：
 * 
 * 本文件展示的是爬虫的完整实现模式，但实际运行时，系统使用的是
 * server/syncScheduler.ts 中的统一爬虫逻辑。
 * 
 * 要启用最酷体育爬虫，请：
 * 1. 运行 `npm run config:import` 导入 config/sources.yaml
 * 2. 在管理后台启用该数据源（设置 isActive=true）
 * 3. 绑定具体赛事到该数据源（marathon_sources）
 * 4. 触发同步或等待调度器自动运行
 * 
 * 测试指南：
 * - 参考 docs/审查报告/测试文档-最酷体育爬虫实现-2026-02-17.md
 * - 使用管理后台 /admin/data 查看运行状态
 * - 检查 marathon_sync_runs 表查看执行历史
 * - 查看 raw_crawl_data 表确认数据已保存
 */
