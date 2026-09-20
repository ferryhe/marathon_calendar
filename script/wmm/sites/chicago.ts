/**
 * 站点描述符 · 04 Bank of America Chicago Marathon
 *
 * 日期源：**首页**（美国式 `Sunday, October 11, 2026`；页内另有 ISO `2026-10-11`）
 * 取页策略：curl　主赛事关键词：/Chicago Marathon/i
 */
import type { SiteDescriptor } from "./types.js";

export const chicago: SiteDescriptor = {
  slug: "chicago",
  index: "04",
  name: "Bank of America Chicago Marathon",
  canonicalName: "chicago-marathon",
  officialUrl: "https://www.chicagomarathon.com/",
  timezone: "America/Chicago",
  pages: [
    "https://www.chicagomarathon.com/",
  ],
  fetch: "curl",
  mainEventHint: /Chicago Marathon/i,
  dateSource:
    "**首页**（美国式 `Sunday, October 11, 2026`；页内另有 ISO `2026-10-11`）",
  notes: [
    "首页日期紧邻的是导航文字（`Participant Account October 11, 2026 Participant…`），靠宽窗口的赛事语义才认得出",
  ],
};
