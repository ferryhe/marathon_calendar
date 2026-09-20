/**
 * 06-tokyo 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-tokyo.ts
 *
 * 用例取自 2026-09-20 实测的 marathon.tokyo 英文首页文本：
 * 比赛日是美国式写法（`March 7, 2027`，实测出现 16 次），同页另有报名/活动类日期。
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
const HINT = { mainEventHint: /Tokyo Marathon/i };
const TODAY = "2026-09-20";

{
  // 真实首页形态：比赛日 + 赛事名（美国式「月在前」）
  const t = `JP EN March 7, 2027 days --> My Entry General Information Runners Charity Volunteers The Tokyo Marathon 2027 will be held on Sunday, March 7, 2027.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("挑中 2027-03-07（美国式写法）", r.chosen?.date === "2027-03-07", r.chosen);
}

{
  // 同页的报名/活动类日期不能顶掉比赛日
  const t = `The Tokyo Marathon 2027 will be held on Sunday, March 7, 2027. The entry period opens on Sunday, October 18, 2026 and closes on Thursday, November 5, 2026.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("报名期（2026-10-18 等）不抢戏 → 仍挑 2027-03-07", r.chosen?.date === "2027-03-07", r.chosen);
  check("报名日期进 dropped（全量可见）", r.droppedCandidates.some((c) => c.date === "2026-10-18"), r.droppedCandidates.map((c) => c.date));
}

{
  // 只有配套活动时不能静默当成比赛日
  const t = `The Friendship Run race will be held on Saturday, March 6, 2027 at 10:00.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("配套活动（Friendship Run）不静默当比赛日", r.chosen === null || r.notes.some((n) => n.includes("主赛事关键词")), { chosen: r.chosen?.date, notes: r.notes });
}

{
  // 东京首页实测的干扰句：维护通知的日期前面 110 字内有 "Tokyo Marathon"，不能被当成比赛日
  const t = `Event Carbon Footprint Assessment Conducted for the Tokyo Marathon 2026 Sustainability Other 2026.06.22 System Maintenance Notice: Sunday, May 17, 2026, 9:00 AM – Tuesday, May 19, 2026, 10:00 AM Other 2026.05.13`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("维护通知日期不算比赛日", !r.chosen || r.chosen.date !== "2026-05-17", r.chosen?.date);
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
