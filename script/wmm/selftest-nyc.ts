/**
 * 05-nyc 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-nyc.ts
 *
 * 用例取自 2026-09-20 实测的 nycmarathon.org 首页文本：
 * 下一届比赛日写在**倒计时模块**里（"…Countdown Clock Sponsored by TAG Heuer November 1, 2026"），
 * 同页还有**过往届回顾**句（"On Sunday, November 2, 2025, the 5-Borough race had … finishers"）。
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
const HINT = { mainEventHint: /New York City Marathon|NYC Marathon/i };
const TODAY = "2026-09-20";

{
  // 真实首页形态：倒计时模块的日期 + 过往届回顾句
  const t = `Scroll carousel forward Scroll to explore TCS New York City Marathon Countdown Clock Sponsored by TAG Heuer November 1, 2026 42 days 02 hours 08 minutes 55 seconds 59,226 FINISHERS IN 2025 The TCS New York City Marathon is the best day in New York City! On Sunday, November 2, 2025, the 5-Borough race had a total of 59,226 total finishers.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("挑中 2026-11-01（倒计时模块）", r.chosen?.date === "2026-11-01", r.chosen);
  check("过往届 2025-11-02 不冒充下一届", r.chosen?.date !== "2025-11-02", r.chosen);
  check("命中主赛事关键词（无告警）", !r.notes.some((n) => n.includes("主赛事关键词")), r.notes);
}

{
  // 报名/抽签窗口与"finishers"这类数字句不能抢戏
  const t = `The 2026 TCS New York City Marathon will be held on Sunday, November 1, 2026. The drawing for the 2027 race opens on Tuesday, January 5, 2027. On Sunday, November 2, 2025 the race had 59,226 finishers.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("抽签/往届句不抢戏 → 仍挑 2026-11-01", r.chosen?.date === "2026-11-01", r.chosen);
}

{
  // 只有配套活动时不能静默当成比赛日
  const t = `The TCS New York City Marathon Pavilion race number pickup will take place on Thursday, November 3, 2033.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("配套活动日期不静默当比赛日", r.chosen === null || r.notes.length > 0, { chosen: r.chosen, notes: r.notes });
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
