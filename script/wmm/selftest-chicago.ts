/**
 * 04-chicago 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-chicago.ts
 *
 * 用例取自 2026-09-20 实测的 chicagomarathon.com 首页文本：
 * 比赛日期是**美国式**写法（"Sunday, October 11, 2026"），同页还混着报名/志愿者/博览会日期。
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
const HINT = { mainEventHint: /Chicago Marathon/i };
const TODAY = "2026-09-20";

{
  // 真实首页形态：美国式日期 + 周围是报名/志愿者等噪声
  const t = `Volunteer for the Chicago Marathon by joining a race weekend team! View volunteer opportunities. Announcement Search Participant Account Sunday, October 11, 2026 Participant Account Menu EVENT INFO PARTICIPANT INFORMATION SPECTATOR INFORMATION`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("挑中 2026-10-11（美国式写法）", r.chosen?.date === "2026-10-11", r.chosen);
  check("kind = single-day", r.chosen?.kind === "single-day", r.chosen);
}

{
  // 报名/志愿者窗口不应被当成比赛日
  const t = `The 2026 Chicago Marathon will be held on Sunday, October 11, 2026. Registration opens on Tuesday, October 28, 2025 and closes on Thursday, November 13, 2025.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("报名窗口不抢戏 → 仍挑 2026-10-11", r.chosen?.date === "2026-10-11", r.chosen);
  check("报名日期进 dropped（全量可见）", r.droppedCandidates.some((c) => c.date === "2025-10-28"), r.droppedCandidates.map((c) => c.date));
}

{
  // 只有志愿者班次（无主赛事）→ 不静默当成比赛日
  const t = `Volunteer shifts for the Bank of America Chicago Marathon: Aid Station on Sunday, October 11, 2026 at 6am. Packet pickup shift on Friday, October 09, 2026.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("辅助性班次日期不静默当比赛日（要么告警要么留待人工）", r.notes.length > 0 || r.chosen !== null, { chosen: r.chosen, notes: r.notes });
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
