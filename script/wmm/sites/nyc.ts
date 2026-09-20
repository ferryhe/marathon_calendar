/**
 * 站点描述符 · 05 TCS New York City Marathon
 *
 * 日期源：**首页倒计时模块** `TCS New York City Marathon Countdown Clock … November 1, 2026`
 * 取页策略：browser　主赛事关键词：/New York City Marathon|NYC Marathon/i
 */
import type { SiteDescriptor } from "./types.js";

export const nyc: SiteDescriptor = {
  slug: "nyc",
  index: "05",
  name: "TCS New York City Marathon",
  canonicalName: "new-york-city-marathon",
  officialUrl: "https://www.nycmarathon.org/",
  timezone: "America/New_York",
  pages: [
    "https://www.nycmarathon.org/",
  ],
  fetch: "browser",
  mainEventHint: /New York City Marathon|NYC Marathon/i,
  dateSource:
    "**首页倒计时模块** `TCS New York City Marathon Countdown Clock … November 1, 2026`",
  notes: [
    "JS 渲染 + 对命令行抓取 302 循环（`Maximum (50) redirects followed`）→ 用真实浏览器存页面后 `--html=`",
    "同页有往届回顾句（`On Sunday, November 2, 2025, … 59,226 finishers`）靠届次正确丢弃",
  ],
};
