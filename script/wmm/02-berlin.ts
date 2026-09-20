/**
 * WMM 站点读取器 · 02 柏林马拉松（bmw-berlin-marathon.com）
 *
 *   npx tsx script/wmm/02-berlin.ts [--json=/tmp/berlin.json] [--today=YYYY-MM-DD]
 *
 * 只读：抓页面 + 解析，**不写库**。
 *
 * 日期藏在哪（2026-09-20 实测，逐页试出来的）：
 *   - 首页 / 、/en/preparation/about-the-event 、/en/preparation/event-faq 、/en/registration/lottery
 *     → **没有任何比赛日期**（首页连 <time datetime> 都没有，只有页脚 `© 2026 SCC EVENTS GmbH`）
 *   - `/en/registration/registration-information` → **有**：`27 September 2026` + `27.09.2026`
 *   注意 `/en/registration/`、`/en/the-race/` 是 404（站点自己返回的 404 页有 134KB，别被字节数骗了）。
 *
 * 柏林通常在本届赛后公布下一届日期 → 若页面只写本届，则"下一届"读不到属正常（不是抓取失败），
 * 程序会在 notes 里说明；与库里的 `berlin-marathon` 两届（2026-09-27 / 2027-09-26）对照时需要人工判断。
 */
import { arg, fetchHtml, pickRaceDates } from "./lib.js";

const PAGES = [
  "https://www.bmw-berlin-marathon.com/en/registration/registration-information",
  "https://www.bmw-berlin-marathon.com/en/",
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
  // 柏林官网同时列配套赛（Berlin Road Race 等）→ 必须声明主赛事关键词
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /BERLIN[- ]?MARATHON/i });

  const info = {
    site: "bmw-berlin-marathon.com",
    dateSourcePage: PAGES[0],
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      "提示：柏林一般在本届赛后公布下一届日期；若官网只写本届，则 2027 届属“官网未公告”，别当成抓取失败",
    ],
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
  if (!picked.chosen) process.exitCode = 2;
}

const invoked = process.argv[1] ?? "";
if (invoked.endsWith("02-berlin.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
