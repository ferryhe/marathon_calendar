/**
 * WMM 站点读取器 · 05 纽约马拉松（nycmarathon.org / nyrr.org）
 *
 *   npx tsx script/wmm/05-nyc.ts [--json=/tmp/nyc.json] [--today=YYYY-MM-DD]
 *   npx tsx script/wmm/05-nyc.ts --html=/tmp/nyc.html   # 喂入已存页面（本站必须，见下）
 *
 * 只读：抓页面 + 解析，**不写库**。共用逻辑在 `./lib.ts`。
 *
 * 日期藏在哪（2026-09-20 实测）：
 *   官网首页有**倒计时**模块： "TCS New York City Marathon Countdown Clock Sponsored by TAG Heuer
 *   November 1, 2026  42 days 02 hours …"（从 2026-09-20 数 42 天正好是 11-01，双重印证）
 *   同页另有过往届回顾句： "On Sunday, November 2, 2025, the 5-Borough race had a total of 59,226 total finishers…"
 *   与库里 `new-york-city-marathon` 2026 届 `2026-11-01` 一致；2027 届首页尚未出现。
 *
 * 取页方式：本站是 **JS 渲染 + 对命令行抓取返回拦截**（curl 曾 302 失败），
 * 所以**用真实浏览器打开页面、存成 HTML 再喂给本读取器**（`--html=`）。
 * 这也是 baa.org（波士顿）用过的同一套路。
 */
import { arg, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";

const PAGES = ["https://www.nycmarathon.org/"];

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
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /New York City Marathon|NYC Marathon/i });
  const pageText = texts.join(" ");
  const hintMissed = picked.notes.some((n) => n.includes("主赛事关键词"));

  const info = {
    site: "nycmarathon.org",
    dateSourcePages: PAGES,
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      ...(hintMissed && /New York City Marathon/i.test(pageText)
        ? ["说明：该日期附近是倒计时模块文案所以未出现主赛事关键词，但整页提到过 New York City Marathon"]
        : []),
      "提示：本站首页用**倒计时模块**写下一届比赛日（JS 渲染）；命令行抓取会被拦，用真实浏览器存页面后 `--html=` 解析",
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
if (invoked.endsWith("05-nyc.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
