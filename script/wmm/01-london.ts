/**
 * WMM 站点读取器 · 01 伦敦马拉松（tcslondonmarathon.com）
 *
 *   npx tsx script/wmm/01-london.ts [--json=/tmp/london.json] [--today=YYYY-MM-DD]
 *
 * 只读：抓页面 + 解析，**不写库**。抓取/解析/选择逻辑在 `./lib.ts`（八站共用），本文件只放站点差异。
 *
 * 站点特点：
 *   - **2027 届首次跨两天**（官网原句 "…will take place across two days, on Saturday 24 and
 *     Sunday 25 April 2027…"）→ 输出 date(首日) + dateEnd(末日)。
 *   - **没有任何 JSON-LD 赛事结构化数据** → 只能从正文抽。
 *   - 抽签页的日期是**无年份**写法（"…by 16:00 BST on Friday 31 July"）→ 不产生候选（正确行为）。
 */
import { arg, fetchHtml, pickRaceDates } from "./lib.js";

const PAGES = [
  "https://www.tcslondonmarathon.com/",
  "https://www.tcslondonmarathon.com/enter/2027-ballot",
];

async function main() {
  const pages = [];
  const texts: string[] = [];
  for (const url of PAGES) {
    const p = await fetchHtml(url);
    pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
    if (p.text) texts.push(p.text);
  }
  const today = arg("today") ?? new Date().toISOString().slice(0, 10);
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /TCS London Marathon|London Marathon/i });

  const info = {
    site: "tcslondonmarathon.com",
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: picked.notes,
    allCandidates: picked.allCandidates,
    droppedCandidates: picked.droppedCandidates,
    counts: { all: picked.allCandidates.length, dropped: picked.droppedCandidates.length },
  };
  console.log(JSON.stringify(info, null, 1));
  const out = arg("json");
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify(info, null, 1));
    console.error(`# 已写入 ${out}`);
  }
  if (!picked.chosen) process.exitCode = 2; // 没解析到 → 批量跑不会静默"成功"
}

const invoked = process.argv[1] ?? "";
if (invoked.endsWith("01-london.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
