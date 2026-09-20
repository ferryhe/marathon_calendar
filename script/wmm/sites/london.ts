/**
 * 站点描述符 · 01 TCS London Marathon
 *
 * 日期源：赛事公告句 `across two days, on Saturday 24 and Sunday 25 April 2027`（官网首页/公告页）
 * 取页策略：fetch　主赛事关键词：/TCS London Marathon|London Marathon/i
 */
import type { SiteDescriptor } from "./types.js";

export const london: SiteDescriptor = {
  slug: "london",
  index: "01",
  name: "TCS London Marathon",
  canonicalName: "london-marathon",
  officialUrl: "https://www.tcslondonmarathon.com/",
  timezone: "Europe/London",
  pages: [
    "https://www.tcslondonmarathon.com/",
    "https://www.tcslondonmarathon.com/enter/2027-ballot",
  ],
  fetch: "fetch",
  mainEventHint: /TCS London Marathon|London Marathon/i,
  dateSource:
    "赛事公告句 `across two days, on Saturday 24 and Sunday 25 April 2027`（官网首页/公告页）",
  notes: [
    "本站 2027 是**两天赛**（周六 24 + 周日 25）→ race_date=首日、race_end_date=末日",
    "抽签页不写年份（原文 `by 16:00 BST on Friday 31 July`），故抽签窗口不会误当比赛日",
  ],
};
