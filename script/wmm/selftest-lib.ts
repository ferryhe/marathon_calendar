/**
 * lib 层回归自测（把审计提出的两个缺陷场景固化）：
 *
 *   npx tsx script/wmm/selftest-lib.ts
 *
 * 场景 4a（审计：静默选错，退出码 0）
 *   "The 131st Boston Marathon will be held on Monday, April 19, 2027.
 *    The drawing for the 2027 race opens on Tuesday, January 5, 2027."
 *   → 必须选 2027-04-19（抽签日不得顶掉比赛日，且不能静默）
 *
 * 场景 4b（审计：相对基线能力倒退）
 *   "Registration opens on 1 September 2026 for the 2027 Boston Marathon.
 *    The Boston Marathon will be held on 19 April 2027."
 *   → 必须选 2027-04-19（上一句的 "Registration opens" 不得把真比赛日判死）
 */
import { pickRaceDates, extractCandidates } from "./lib.js";

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
const HINT = { mainEventHint: /Boston Marathon/i };
const TODAY = "2026-09-20";

{
  const t = `The 131st Boston Marathon will be held on Monday, April 19, 2027. The drawing for the 2027 race opens on Tuesday, January 5, 2027.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("4a 抽签日不顶掉比赛日 → 选 2027-04-19", r.chosen?.date === "2027-04-19", { chosen: r.chosen?.date, notes: r.notes });
  check("4a 抽签日进 dropped（可追溯）", r.droppedCandidates.some((c) => c.date === "2027-01-05"), r.droppedCandidates.map((c) => c.date));
}

{
  const t = `Registration opens on 1 September 2026 for the 2027 Boston Marathon. The Boston Marathon will be held on 19 April 2027.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("4b 上一句 'Registration opens' 不得把真比赛日判死 → 选 2027-04-19", r.chosen?.date === "2027-04-19", { chosen: r.chosen?.date, notes: r.notes });
  check("4b 报名日 2026-09-01 仍被排除", !r.allCandidates.find((c) => c.date === "2026-09-01" && c.raceLike), r.allCandidates.filter((c) => c.date === "2026-09-01").map((c) => c.raceLike));
}

{
  // 反面：**紧贴日期**的报名/领物短语仍然必须排除（不能为了修 4b 把这条放水）
  const t = `Registration for the 2027 Boston Marathon opens on 1 September 2026 (Tuesday).`;
  const r = pickRaceDates(t, TODAY, HINT);
  // 页面上写了 "the 2027 Boston Marathon"，但比赛日尚未公布（只有报名日）→ 不能把报名日当比赛日
  check("只有报名日时：不静默给报名日（宁可选空 + 退出码 2）", r.chosen === null, { chosen: r.chosen?.date, notes: r.notes });
  check("只有报名日时：note 说明要人工核对", r.notes.some((n) => n.includes("请人工核对")), r.notes);
}

{
  // 反面：博览会/维护通知这类「事件类型」短语在宽窗口任何位置都仍要排除
  const t = `The Boston Marathon Expo will take place on Friday, April 16, 2027 at the Hynes Convention Center.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("博览会日期仍被排除", r.chosen === null || r.chosen.date !== "2027-04-16", r.chosen?.date);
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
