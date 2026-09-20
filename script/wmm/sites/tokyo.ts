/**
 * 站点描述符 · 06 Tokyo Marathon
 *
 * 日期源：**赛事概要页** `Date | Sunday, March 7, 2027`（首页只作补充）
 * 取页策略：curl　主赛事关键词：/Tokyo Marathon|Marathon \\(Marathon, Wheelchair Marathon\\)/i
 */
import type { SiteDescriptor } from "./types.js";

export const tokyo: SiteDescriptor = {
  slug: "tokyo",
  index: "06",
  name: "Tokyo Marathon",
  canonicalName: "tokyo-marathon",
  officialUrl: "https://www.marathon.tokyo/en/",
  timezone: "Asia/Tokyo",
  pages: [
    "https://www.marathon.tokyo/en/about/outline/",
    "https://www.marathon.tokyo/en/",
  ],
  fetch: "curl",
  mainEventHint: /Tokyo Marathon|Marathon \\(Marathon, Wheelchair Marathon\\)/i,
  dateSource:
    "**赛事概要页** `Date | Sunday, March 7, 2027`（首页只作补充）",
  notes: [
    "首页混着 `System Maintenance Notice: Sunday, May 17, 2026` 与报名期日期 —— 只读首页会挑错（实测挑成维护通知日）",
    "概要页把赛事名写成 `Events Marathon (Marathon, Wheelchair Marathon)`，关键词要照顾这种写法",
  ],
};
