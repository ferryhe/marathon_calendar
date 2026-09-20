/**
 * WMM 站点读取器 · 08 悉尼马拉松（tcssydneymarathon.com）
 *
 *   npx tsx script/wmm/08-sydney.ts [--json=/tmp/sydney.json] [--today=YYYY-MM-DD]
 *   npx tsx script/wmm/08-sydney.ts --html=/tmp/sydney.html
 *
 * 只读：抓页面 + 解析，**不写库**。共用逻辑在 `./lib.ts`。
 *
 * 日期藏在哪（2026-09-20 实测）：
 *   首页 https://www.tcssydneymarathon.com/（curl 200 / 3743696 bytes）静态 HTML 里就有
 *   `<h1 …>29.08.2027</h1>` —— **数字式 DD.MM.YYYY**，即 **2027-08-29（星期日）**。
 *   库里 `sydney-marathon` 目前只有 2025（08-31）/ 2026（08-30）两届，**尚无 2027 届**
 *   → 读取器只报事实（2027-08-29），是否入库留人工/后续流程。
 *   注意：本站是 Wix 构建，静态文本 ~2.9MB（大量 JS/CSS 噪声），日期用数字式写成 H1，
 *   早先只按"月份名"找会看不到（我实测漏过一次）。
 */
import { arg, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";

const PAGES = ["https://www.tcssydneymarathon.com/"];

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
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /Sydney Marathon/i });
  const pageText = texts.join(" ");
  const hintMissed = picked.notes.some((n) => n.includes("主赛事关键词"));

  const info = {
    site: "tcssydneymarathon.com",
    dateSourcePages: PAGES,
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      ...(hintMissed && /Sydney Marathon/i.test(pageText)
        ? ["说明：该日期是首页 H1 的独立数字日期，附近未见主赛事关键词，但整页提到过 Sydney Marathon"]
        : []),
      "提示：悉尼官网把下一届日期写成首页 H1 的**数字式** `29.08.2027`（DD.MM.YYYY）；Wix 站点静态文本很大，但日期确实在静态 HTML 里",
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
if (invoked.endsWith("08-sydney.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
