/**
 * 03-boston 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-boston.ts
 *
 * 用例取自 2026-09-20 实测的 baa.org 页面文本：公告页一句
 * "The 131st Boston Marathon presented by Bank of America will be held on Monday, April 19, 2027"，
 * 同页还混着往届与其它赛事日期（April 15, 2019 / May 28, 2020 / April 8, 2022）。
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
const HINT = { mainEventHint: /Boston Marathon/i };
const TODAY = "2026-09-20";

{
  const t = `The 131st Boston Marathon presented by Bank of America will be held on Monday, April 19, 2027. Registration will open on September 15, 2026.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("挑中 2027-04-19", r.chosen?.date === "2027-04-19", r.chosen);
}

{
  // 同页混入往届与资格赛日期 → 不能挑到旧年份
  const t = `The 124th Boston Marathon was held on Monday, April 15, 2019. The 2020 race was cancelled on May 28, 2020. The 131st Boston Marathon presented by Bank of America will be held on Monday, April 19, 2027.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("往届日期不干扰 → 2027-04-19", r.chosen?.date === "2027-04-19", r.chosen);
  check("往届日期进 dropped（全量可见）", r.droppedCandidates.length >= 2, r.droppedCandidates.map((c) => c.date));
}

{
  // 只有配套赛（5K / Relay）日期、没有主赛事关键词时，不能静默当成马拉松日期 → 必须告警
  const t = `The B.A.A. 5K race will be held on Saturday, April 17, 2027. The B.A.A. relay race takes place on Monday, April 19, 2027.`;
  const r = pickRaceDates(t, TODAY, HINT);
  check("没命中主赛事关键词时会告警", r.notes.some((n) => n.includes("主赛事关键词")), r.notes);
  check("并且挑了其中一个候选（人工判断，不静默丢）", r.chosen !== null, r.chosen);
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) {
  console.log("# FAILED:", fails.join(" | "));
  process.exit(1);
}
