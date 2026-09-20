/**
 * 站点描述符 · 07 Sanlam Cape Town Marathon
 *
 * 日期源：**首页** HTML 实体区间 `22&ndash;23 May 2027`
 * 取页策略：curl　主赛事关键词：/Cape Town Marathon/i
 */
import type { SiteDescriptor } from "./types.js";

export const capetown: SiteDescriptor = {
  slug: "capetown",
  index: "07",
  name: "Sanlam Cape Town Marathon",
  canonicalName: "capetown-marathon",
  officialUrl: "https://capetownmarathon.com/",
  timezone: "Africa/Johannesburg",
  pages: [
    "https://capetownmarathon.com/",
  ],
  fetch: "curl",
  mainEventHint: /Cape Town Marathon/i,
  twoDayPick: "last",
  dateSource:
    "**首页** HTML 实体区间 `22&ndash;23 May 2027`",
  notes: [
    "口径（已确认）：区间是**赛事周末**，马拉松本赛在 **23 May 2027**（SAST +02:00）→ 取末日、不设 race_end_date",
    "首页混着新闻稿署名/发布日（`May 26, 2026`、`June 10, 2026`）→ 靠届次与宣告句式层排除",
  ],
};
