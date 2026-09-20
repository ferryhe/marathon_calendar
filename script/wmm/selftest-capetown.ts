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
  // 真实首页形态：实体区间（赛事周末 22–23 May）+ 报名/抽签状态词
  // 口径（已确认）：马拉松本赛在 **23 May 2027**（SAST +02:00）→ 取末日、不设 race_end_date
  const t = `RUN FOR CHARITY MARATHON ITO TRAVEL PROGRAM PORTAL ENTER Run for Charity ENTRIES OPEN Travel Program OFFICIAL ITO'S BALLOT CLOSED 24 JUNE 22–23 May 2027 RUN FOR CHARITY TRAVEL PROGRAM 2027 BALLOT CLOSED Africa's first Abbott World Marathon Major`;
  const r = pickRaceDates(t, TODAY, { ...HINT, twoDayPick: "last" });
  check("赛事周末区间 → 取末日 2027-05-23 作比赛日", r.chosen?.date === "2027-05-23", r.chosen);
  check("不设 race_end_date（kind = single-day）", r.chosen?.dateEnd === undefined && r.chosen?.kind === "single-day", r.chosen);
  check("notes 说明取末日口径", r.notes.some((n) => n.includes("末日")), r.notes);
}

{
  // 对照：伦敦那种"马拉松确实跨两天"的站点仍应取首日 + 设末日
  const t = `For the first and only time, the TCS London Marathon will take place across two days, on Saturday 24 and Sunday 25 April 2027, welcoming 100,000 runners.`;
  const r = pickRaceDates(t, TODAY, { mainEventHint: /London Marathon/i });
  check("伦敦（真跨两天，默认 first）仍取首日 2027-04-24 + 末日 2027-04-25", r.chosen?.date === "2027-04-24" && r.chosen?.dateEnd === "2027-04-25", r.chosen);
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
