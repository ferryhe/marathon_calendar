/**
 * 站点描述符 · 08 TCS Sydney Marathon
 *
 * 日期源：**首页 H1 数字式** `<h1 …>29.08.2027</h1>`（DD.MM.YYYY）
 * 取页策略：curl　主赛事关键词：/Sydney Marathon/i
 */
import type { SiteDescriptor } from "./types.js";

export const sydney: SiteDescriptor = {
  slug: "sydney",
  index: "08",
  name: "TCS Sydney Marathon",
  canonicalName: "sydney-marathon",
  officialUrl: "https://www.tcssydneymarathon.com/",
  timezone: "Australia/Sydney",
  pages: [
    "https://www.tcssydneymarathon.com/",
  ],
  fetch: "curl",
  mainEventHint: /Sydney Marathon/i,
  dateSource:
    "**首页 H1 数字式** `<h1 …>29.08.2027</h1>`（DD.MM.YYYY）",
  notes: [
    "Wix 站点：首页 3.7MB、静态文本 ~2.9MB 噪声，但日期确实在静态 HTML 里；数字式写法只按\"月份名\"找会漏",
    "库里已按此新增 2027 届（2027-08-29，周日，单日）",
  ],
};
