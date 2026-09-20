/**
 * WMM 站点读取器 · 06 东京马拉松（marathon.tokyo）
 *
 *   npx tsx script/wmm/06-tokyo.ts [--json=/tmp/tokyo.json] [--today=YYYY-MM-DD]
 *   npx tsx script/wmm/06-tokyo.ts --html=/tmp/tokyo.html
 *
 * 只读：抓页面 + 解析，**不写库**。共用逻辑在 `./lib.ts`。
 *
 * 日期藏在哪（2026-09-20 实测）：
 *   英文首页 https://www.marathon.tokyo/en/（curl 200 / 377097 bytes）里
 *   `March 7, 2027` 出现 16 次 —— **美国式「月在前」**，与库里 `tokyo-marathon` 2027 届
 *   `2027-03-07` 一致。（同页另有 `October 18, 2026` ×11 等日期，属报名/活动类，
 *   靠「宣告句式」层 + 主赛事关键词 + 届次基准排除，见 lib.ts 注释。）
 *   注：页面里有 "Tokyo Marathon 2027 uses JavaScript…" 的提示，但日期在静态 HTML 里就有。
 */
import { arg, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";

// 首页的 "March 7, 2027" 只出现在导航/JS 片段里（且首页有"System Maintenance Notice"这类日期干扰），
// 真正权威的是**赛事概要页**：`Date | Sunday, March 7, 2027`（Events 字段写着 Marathon / Wheelchair Marathon）
const PAGES = ["https://www.marathon.tokyo/en/about/outline/", "https://www.marathon.tokyo/en/"];

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
    // 概要页把赛事名写成 "Events Marathon (Marathon, Wheelchair Marathon)"，所以关键词要照顾到这种写法
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /Tokyo Marathon|Marathon \(Marathon, Wheelchair Marathon\)/i });
  const pageText = texts.join(" ");
  const hintMissed = picked.notes.some((n) => n.includes("主赛事关键词"));

  const info = {
    site: "marathon.tokyo",
    dateSourcePages: PAGES,
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      ...(hintMissed && /Tokyo Marathon/i.test(pageText)
        ? ["说明：该日期附近未出现主赛事关键词，但整页提到过 Tokyo Marathon"]
        : []),
      "提示：东京的权威日期源是**赛事概要页** `/en/about/outline/`（`Date | Sunday, March 7, 2027`）；首页仅作补充",
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
if (invoked.endsWith("06-tokyo.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
