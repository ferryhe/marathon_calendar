/**
 * 02-berlin 解析器离线自测（无网络、无 DB）
 *
 *   npx tsx script/wmm/selftest-berlin.ts
 *
 * 用例取自 2026-09-20 在 bmw-berlin-marathon.com 上**实测踩到的坑**：
 *   - 正文前有一大段没有句号的导航菜单（含 Registration / Lottery / Charity 等词）
 *   - 同一个日期在页面里出现多次（导航块 / 交通票券说明 / 正文 <p>）
 *   - 页面上还有配套赛（Berlin Road Race - Die Generalprobe, 23.08.2026）不是本马拉松
 */
import { pickRaceDates } from "./lib.js";

/** 与 02-berlin.ts 一致：柏林官网同页有配套赛，必须按主赛事关键词挑选 */
const HINT = { mainEventHint: /BERLIN[- ]?MARATHON/i };

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`); }
}
const TODAY = "2026-06-01"; // 柏林 2026 赛前

// 真实页面形态（导航块没有句号 → 曾把比赛日句污染成"非赛事日期"）
const NAV = `More Events Registration Registration information Lottery Inlineskating Wheelchair competitors and handbiker Jubilee Kids & Youth GENERALI 5K Charity Tour operators Extras Preparation About the event ROAD TO BERLIN Race Briefing`;
const PAGE = `${NAV} Registration for the BMW BERLIN-MARATHON The BMW BERLIN-MARATHON 2026 will take place on 27 September 2026. As with all events in the Abbott World Marathon Majors Series, entries are allocated by lottery. Berlin Road Race - Die Generalprobe Take the opportunity to start your personal countdown with a race on a flat course at the Berlin Road Race on 23.08.2026.`;

{
  const r = pickRaceDates(PAGE, TODAY, HINT);
  check("挑中马拉松正赛 2026-09-27（不是 8 月的配套赛）", r.chosen?.date === "2026-09-27", r.chosen);
  check("配套赛仍在候选里（全量，不丢）", r.allCandidates.some((c) => c.date === "2026-08-23"), r.allCandidates.map((c) => c.date));
}

// 交通票券那种"24.09. - 27.09.2026"的干扰日期，不应把正赛顶掉
{
  const withTicket = `${PAGE} your 4-day public transport ticket is valid from 24.09. - 27.09.2026 (fare zone ABC).`;
  const r = pickRaceDates(withTicket, TODAY, HINT);
  check("干扰日期存在时仍挑中 2026-09-27", r.chosen?.date === "2026-09-27", r.chosen);
}

// 只有配套赛、没有正赛 → 别硬挑配套赛当正赛（应给出告警而不是静默）
{
  const onlyRoadRace = `Berlin Road Race - Die Generalprobe. Take part in a race on a flat course on 23.08.2026.`;
  const r = pickRaceDates(onlyRoadRace, TODAY, HINT);
  check("只剩配套赛时仍解析出日期（人工判断）", r.chosen !== null, r.chosen);
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) { console.log("# FAILED:", fails.join(" | ")); process.exit(1); }
