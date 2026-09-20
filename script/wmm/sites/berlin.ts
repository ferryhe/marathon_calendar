/**
 * 站点描述符 · 02 BMW BERLIN-MARATHON
 *
 * 日期源：**报名信息页** `will take place on 27 September 2026`（首页/关于页都不写日期）
 * 取页策略：fetch　主赛事关键词：/BERLIN[- ]?MARATHON/i
 */
import type { SiteDescriptor } from "./types.js";

export const berlin: SiteDescriptor = {
  slug: "berlin",
  index: "02",
  name: "BMW BERLIN-MARATHON",
  canonicalName: "berlin-marathon",
  officialUrl: "https://www.bmw-berlin-marathon.com/en/",
  timezone: "Europe/Berlin",
  pages: [
    "https://www.bmw-berlin-marathon.com/en/registration/registration-information",
    "https://www.bmw-berlin-marathon.com/en/",
  ],
  fetch: "fetch",
  mainEventHint: /BERLIN[- ]?MARATHON/i,
  dateSource:
    "**报名信息页** `will take place on 27 September 2026`（首页/关于页都不写日期）",
  notes: [
    "`/en/registration/`、`/en/the-race/` 是 404，但 404 页面有 ~134KB —— 光看字节数会被骗",
    "首页正文前有一大段**没有句号**的导航串（含 Registration/Lottery/Charity），判定窗口必须避开它",
  ],
};
