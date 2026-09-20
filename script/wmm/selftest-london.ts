/**
 * 01-london 解析器离线自测（无网络、无 DB）。
 *
 *   npx tsx script/wmm/selftest-london.ts
 *
 * 用例来自独立复核（2026-09-20）构造的场景：博览会两天日、措辞不在白名单、抽签窗口混入。
 */
import { pickRaceDates } from "./01-london.js";

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`); }
}
const TODAY = "2026-09-20";

console.log("\n## 01-london · 比赛日选择");

// A) 真·两天赛（伦敦 2027 官网原句）
{
  const t = `For the first and only time, the TCS London Marathon will take place across two days, on Saturday 24 and Sunday 25 April 2027, welcoming 100,000 runners to the streets of London.`;
  const r = pickRaceDates(t, TODAY);
  check("A 两天赛 → 首日 2027-04-24", r.chosen?.date === "2027-04-24", r.chosen);
  check("A 两天赛 → 末日 2027-04-25", r.chosen?.dateEnd === "2027-04-25", r.chosen);
  check("A twoDay=true", r.twoDay === true, r.twoDay);
}

// B) 博览会跨两天 + 真比赛单日 —— 不能选成博览会（复核 caseB）
{
  const t = `The TCS London Marathon Running Show Expo will take place across two days, on Thursday 22 and Friday 23 April 2027 at ExCeL. The marathon race will be held on Sunday 25 April 2027.`;
  const r = pickRaceDates(t, TODAY);
  check("B 不把博览会当比赛日 → 2027-04-25", r.chosen?.date === "2027-04-25", r.chosen);
  check("B 博览会被列为 dropped", r.droppedCandidates.some((c) => c.date === "2027-04-22"), r.droppedCandidates.map((c) => c.date));
}

// C) 措辞不含白名单词也认（复核 caseC：以前 chosen=null）
{
  const t = `The 2027 TCS London Marathon is on Sunday 25 April 2027.`;
  const r = pickRaceDates(t, TODAY);
  check("C 'is on …' 也认出来 → 2027-04-25", r.chosen?.date === "2027-04-25", r.chosen);
}

// D) 抽签窗口混入正文（带年份）—— 不能被选中，但要出现在候选/丢弃清单里（复核 caseF）
{
  const t = `The main ballot takes place between Friday 27 March 2026 and Friday 24 April 2026. The race will take place on Sunday 25 April 2027.`;
  const r = pickRaceDates(t, TODAY);
  check("D 抽签窗口不被选中 → 2027-04-25", r.chosen?.date === "2027-04-25", r.chosen);
  check("D 抽签日期出现在候选里（全量）", r.allCandidates.some((c) => c.date === "2026-04-24"), r.allCandidates.map((c) => c.date));
  check("D 抽签日期被标记 dropped", r.droppedCandidates.some((c) => c.date === "2026-04-24"), r.droppedCandidates.map((c) => c.date));
}

// E) 无年份写法（伦敦抽签页真实形态 "…by 16:00 BST on Friday 31 July"）→ 不产生候选
{
  const t = `If you were offered a ballot place, you needed to confirm your details by 16:00 BST on Friday 31 July.`;
  const r = pickRaceDates(t, TODAY);
  check("E 无年份日期不产生候选", r.allCandidates.length === 0, r.allCandidates);
  check("E 没解析到 → chosen=null", r.chosen === null, r.chosen);
  check("E 给出告警", r.notes.length > 0, r.notes);
}

// F) 真页面今天的样子：2026 届已过 + 2027 两天赛 → 取 2027
{
  const t = `Held on Sunday 26 April 2026. For the first and only time, the TCS London Marathon will take place across two days, on Saturday 24 and Sunday 25 April 2027.`;
  const r = pickRaceDates(t, TODAY);
  check("F 优先下一届（2027）两天赛", r.chosen?.date === "2027-04-24" && r.chosen?.dateEnd === "2027-04-25", r.chosen);
}

console.log(`\n# ${pass} assertion(s) passed, ${fails.length} failed`);
if (fails.length) { console.log("# FAILED:", fails.join(" | ")); process.exit(1); }
