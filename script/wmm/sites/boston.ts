/**
 * 站点描述符 · 03 Boston Marathon
 *
 * 日期源：**新闻公告页** `…to be run on April 19, 2027…`（赛事页/选手页都不写日期）
 * 取页策略：browser　主赛事关键词：/Boston Marathon/i
 */
import type { SiteDescriptor } from "./types.js";

export const boston: SiteDescriptor = {
  slug: "boston",
  index: "03",
  name: "Boston Marathon",
  canonicalName: "boston-marathon",
  officialUrl: "https://www.baa.org/races/boston-marathon",
  timezone: "America/New_York",
  pages: [
    "https://www.baa.org/news/registration-updates-and-information-announced-for-2027-boston-marathon-presented-by-bank-of-america/",
    "https://www.baa.org/races/boston-marathon/news/",
  ],
  fetch: "browser",
  mainEventHint: /Boston Marathon/i,
  dateSource:
    "**新闻公告页** `…to be run on April 19, 2027…`（赛事页/选手页都不写日期）",
  notes: [
    "本站对命令行抓取返回 ~3KB 反爬挑战页（Node fetch 与 curl 都一样）→ 用真实浏览器存页面后 `--html=` 喂入",
    "美国式「月在前」日期（`April 19, 2027`）",
  ],
};
