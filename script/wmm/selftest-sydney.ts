/**
 * 08-sydney 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-sydney.ts
 *
 * 用例取自 2026-09-20 实测的 tcssydneymarathon.com 首页静态 HTML：
 * 下一届日期写成首页 H1 的**数字式** `29.08.2027`（DD.MM.YYYY）。
 */
import { pickRaceDates } from "./lib.js";

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
const HINT = { mainEventHint: /Sydney Marathon/i };
const TODAY = "2026-09-20";

{
  // 真实首页形态：H1 数字式日期 + 导航里有 RACE WEEK / RACES（提供赛事语义）
  const t = `2026 RESULTS | 2027 BALLOT | VOLUNTEER | RACES | TRAINING | RACE WEEK | CHARITY | ABOUT | 29.08.2027 | SIGN UP FOR 2027 BALLOT UPDATES`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("挑中 2027-08-29（数字式 DD.MM.YYYY）", r.chosen?.date === "2027-08-29", r.chosen);
  check("kind = single-day", r.chosen?.kind === "single-day", r.chosen);
}

{
  // 往届结果/报名日期不能顶掉下一届比赛日
  const t = `The TCS Sydney Marathon will take place on Sunday 29.08.2027. 2026 RESULTS: the race was held on 30.08.2026. 2027 Ballot entry opens on 01.10.2026.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("往届 2026 与报名日期不抢戏 → 仍挑 2027-08-29", r.chosen?.date === "2027-08-29", r.chosen?.date);
  check("往届日期进 dropped（全量可见）", r.droppedCandidates.some((c) => c.date === "2026-08-30"), r.droppedCandidates.map((c) => c.date));
}

{
  // 配套赛（Mini Marathon / 5km）日期不能冒充主赛事日
  const t = `The Mini Marathon race will be held on Saturday 28.08.2027 at 7am.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("配套赛日期不静默冒充主赛事日", r.chosen === null || r.notes.some((n) => n.includes("主赛事关键词")), { chosen: r.chosen?.date, notes: r.notes });
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
