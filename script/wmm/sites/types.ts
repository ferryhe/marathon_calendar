/**
 * 官网数据线（official-sites）的**站点描述符**接口。
 *
 * 设计目标：**加一个站 = 加一个描述符文件 + 在 sites/index.ts 注册一行**，不改公用逻辑。
 * 每站需要声明的只有"这站的特殊之处"：去哪儿抓、按什么关键词认主赛事、区间怎么解、有什么坑。
 */
import type { FetchedPage } from "../lib.js";

export interface SiteDescriptor {
  /** 站点短名（CLI 用：--site=london） */
  slug: string;
  /** 序号（沿用 01..08 的文件命名惯例，便于排序与阅读） */
  index: string;
  /** 展示名 */
  name: string;
  /** 与库里 marathons.canonical_name 对齐（--check-db 靠它比对） */
  canonicalName: string;
  /** 官网入口 */
  officialUrl: string;
  /** 时区（有本地时间语义时用得上，如开普敦 SAST+02:00） */
  timezone?: string;
  /** 要抓的页面（顺序＝优先级，多页合并后统一解析） */
  pages: string[];
  /**
   * 取页策略：
   *  * `curl`（默认）—— 多数站够用
   *  * `fetch`        —— 用 Node 内置 fetch
   *  * `browser`      —— 站点对命令行抓取返回反爬挑战页/JS 渲染（如 baa.org、nycmarathon.org）
   *                      时，命令行拿不到，需用真实浏览器存页面后 `--html=<文件>` 喂入
   */
  fetch?: "curl" | "fetch" | "browser";
  /** 认主赛事的关键词（防配套赛/抽签句顶掉比赛日） */
  mainEventHint: RegExp;
  /** 官网把日期写成区间时取哪天作比赛日（默认 first；开普敦这种"区间是赛事周末"用 last） */
  twoDayPick?: "first" | "last";
  /** 日期藏在哪（文档/排查用） */
  dateSource: string;
  /** 站点特有提示（会进 JSON 输出，给运维看） */
  notes?: string[];
}

export interface SiteRunResult {
  site: string;
  canonicalName: string;
  officialUrl: string;
  dateSource: string;
  fetchStrategy: string;
  fetchedAt: string;
  today: string;
  pages: Array<Pick<FetchedPage, "url" | "status" | "bytes" | "textChars" | "error">>;
  chosen: { date: string; dateEnd?: string; kind: string; year: number; evidence: string } | null;
  twoDay: boolean;
  notes: string[];
  allCandidates: unknown[];
  droppedCandidates: unknown[];
  counts: { all: number; dropped: number };
}
