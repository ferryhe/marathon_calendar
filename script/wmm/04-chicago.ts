/**
 * WMM 站点读取器 · 04 芝加哥马拉松（chicagomarathon.com）
 *
 *   npx tsx script/wmm/04-chicago.ts [--json=/tmp/chicago.json] [--today=YYYY-MM-DD]
 *   npx tsx script/wmm/04-chicago.ts --html=/tmp/chicago.html   # 喂入已存页面（被反爬挡时用）
 *
 * 只读：抓页面 + 解析，**不写库**。共用逻辑在 `./lib.ts`。
 *
 * 日期藏在哪（2026-09-20 实测）：**首页就有**，而且出现 4 次：
 *   "Sunday, October 11, 2026" ×3、 "October 11, 2026" ×1，页内还有 ISO 形态 `2026-10-11`。
 *   （注意这是**美国式**「月在前」写法；早先的抓取脚本只找"日在前"，所以误判成"首页没有日期"。）
 *   与库里 `chicago-marathon` 2026 届 `2026-10-11` 一致；2027 届官网尚未公布。
 */
import { arg, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";

const PAGES = ["https://www.chicagomarathon.com/"];

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
  // 首页混着报名/志愿者/博览会等日期 → 按主赛事关键词挑
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /Chicago Marathon/i });

  const pageText = texts.join(" ");
  const hintMissed = picked.notes.some((n) => n.includes("主赛事关键词"));
  const pageMentionsMainEvent = /Chicago Marathon/i.test(pageText);
  const info = {
    site: "chicagomarathon.com",
    dateSourcePages: PAGES,
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      // 首页日期紧邻的是导航文字（"…Participant Account October 11, 2026 Participant…"），
      // 所以"日期附近"确实看不到赛事名 —— 说清楚，别让运维以为选错了
      ...(hintMissed && pageMentionsMainEvent
        ? ["说明：该日期「附近」是导航文字所以没出现主赛事关键词，但整页提到过 Chicago Marathon；本届页面只有这 1 个候选"]
        : []),
      "提示：芝加哥首页即写有比赛日期（美国式「月在前」，如 October 11, 2026）；下一届通常在本届赛前后公布",
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
if (invoked.endsWith("04-chicago.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
