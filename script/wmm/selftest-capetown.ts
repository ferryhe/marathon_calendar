/**
 * 07-capetown 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-capetown.ts
 *
 * 用例取自 2026-09-20 实测的 capetownmarathon.com 首页文本：
 * 日期是 HTML 实体区间（`22&ndash;23 May 2027` → "22–23 May 2027"），同页还有新闻稿署名日期。
 */
import { pickRaceDates, toText } from "./lib.js";

let pass = 0;
const fails: string[] = [];
function check(n: string, c: boolean, extra?: unknown) {
  if (c) {
    pass++;
    console.log(`  ok   ${n}`);
  } else {
    fails.push(n);
    console.log(`  FAIL ${n}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
  }
}
const HINT = { mainEventHint: /Cape Town Marathon/i };
const TODAY = "2026-09-20";

{
  // HTML 实体必须先解码，否则 "22&ndash;23" 里的数字被隔开、区间匹配不到
  const decoded = toText("22&ndash;23 May 2027");
  check("toText 解码 &ndash; → –", decoded.includes("22–23 May 2027"), decoded);
}

{
  // 真实首页形态：实体区间 + 报名/抽签状态词
  const t = `RUN FOR CHARITY MARATHON ITO TRAVEL PROGRAM PORTAL ENTER Run for Charity ENTRIES OPEN Travel Program OFFICIAL ITO'S BALLOT CLOSED 24 JUNE 22–23 May 2027 RUN FOR CHARITY TRAVEL PROGRAM 2027 BALLOT CLOSED Africa's first Abbott World Marathon Major`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("区间识别为两天：2027-05-22 → 2027-05-23", r.chosen?.date === "2027-05-22" && r.chosen?.dateEnd === "2027-05-23", r.chosen);
  check("twoDay = true", r.twoDay === true, r.twoDay);
  check("notes 里提示 race_date=首日 / race_end_date=末日", r.notes.some((n) => n.includes("两天赛")), r.notes);
}

{
  // 新闻稿署名/发布日不能顶掉比赛日
  const t = `The Sanlam Cape Town Marathon will be held on Sunday, 23 May 2027. Renata Bossi May 26, 2026 Age Group World Championship; June 10, 2026 Sanlam Cape Town Marathon Becomes Africa's First Abbott World Marathon Majors Race.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("新闻稿日期（2026-05-26 / 2026-06-10）不抢戏 → 仍挑 2027-05-23", r.chosen?.date === "2027-05-23", r.chosen?.date);
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
