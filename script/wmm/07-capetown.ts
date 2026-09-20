/**
 * WMM 站点读取器 · 07 开普敦马拉松（capetownmarathon.com）
 *
 *   npx tsx script/wmm/07-capetown.ts [--json=/tmp/capetown.json] [--today=YYYY-MM-DD]
 *   npx tsx script/wmm/07-capetown.ts --html=/tmp/cape.html
 *
 * 只读：抓页面 + 解析，**不写库**。共用逻辑在 `./lib.ts`。
 *
 * 日期藏在哪（2026-09-20 实测）：**首页**（curl 200 / 344266 bytes）
 *   `ENTRIES OPEN … BALLOT CLOSED 24 JUNE **22–23 May 2027** RUN FOR CHARITY …`
 *   注意原文是 HTML 实体区间 `22&ndash;23 May 2027` → **两天**（周六 22 / 周日 23）。
 *   库里 `capetown-marathon` 2027 届目前是 `2027-05-23`（单日）；按项目口径
 *   「多日赛 = race_date 首日 + race_end_date 末日」，这里会报 `2027-05-22 / 2027-05-23`，
 *   是否改库留人工确认（读取器只报，不写库）。
 *
 * 干扰项（实测）：首页混着**新闻稿日期** —— "Renata Bossi **May 26, 2026**"、
 *   "**June 10, 2026** Sanlam Cape Town Marathon Becomes Africa's First Abbott World Marathon Majors Race"。
 *   这类日期句子附近也有 race/marathon 字样，靠「届次基准 + 宣告句式层」排除（见 lib.ts 注释）。
 */
import { arg, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";

const PAGES = ["https://capetownmarathon.com/"];

async function main() {
  const pages = [];
  const texts: string[] = [];
  const htmlFile = arg("html");
  if (htmlFile) {
    const p = await pageFromFile(htmlFile);
    pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
    if (p.text) texts.push(p.text);
    console.error(`# 使用本地页面文件 ${htmlFile}（${p.bytes} bytes）`);
  } else {
    for (const url of PAGES) {
      const p = await fetchWithCurl(url);
      pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
      if (p.text) texts.push(p.text);
    }
  }

  const today = arg("today") ?? new Date().toISOString().slice(0, 10);
  // 官网写的是**赛事周末** `22–23 May 2027`，马拉松本赛只在 **23 May 2027**（SAST +02:00，已确认）
  // → 取区间末日作比赛日，且不设 race_end_date（库里 2027-05-23 正确，无需改库）
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /Cape Town Marathon/i, twoDayPick: "last" });
  const pageText = texts.join(" ");
  const hintMissed = picked.notes.some((n) => n.includes("主赛事关键词"));

  const info = {
    site: "capetownmarathon.com",
    dateSourcePages: PAGES,
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      ...(hintMissed && /Cape Town Marathon/i.test(pageText)
        ? ["说明：该日期附近未出现主赛事关键词，但整页提到过 Cape Town Marathon"]
        : []),
      "口径（已确认）：官网写的是**赛事周末** `22–23 May 2027`，马拉松本赛在 **23 May 2027（SAST +02:00）** → 本读取器取末日 2027-05-23 作 race_date，且不设 race_end_date；库里现值 2027-05-23 正确",
      "提示：首页新闻稿日期（如 `May 26, 2026` 署名日、`June 10, 2026` 发布日）也含 race/marathon 字样，靠届次与宣告句式层排除",
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
if (invoked.endsWith("07-capetown.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
