/**
 * WMM 站点读取器 · 03 波士顿马拉松（baa.org）
 *
 *   npx tsx script/wmm/03-boston.ts [--json=/tmp/boston.json] [--today=YYYY-MM-DD]
 *
 * 只读：抓页面 + 解析，**不写库**。共用逻辑在 `./lib.ts`。
 *
 * 日期藏在哪（2026-09-20 实测）：
 *   - `/races/boston-marathon/`、`/races/boston-marathon/info-for-athletes/`
 *     → **都没有比赛日期**（只有报名/资格赛等其它日期）
 *   - **新闻公告页**（2027 届）→ 有：
 *     "The 131st Boston Marathon presented by Bank of America will be held on Monday, April 19, 2027"
 *   - 站点是 WordPress（post-sitemap.xml / page-sitemap.xml）→ 新一届以新闻形式公告，
 *     所以本程序**顺带扫新闻列表页**，公告页没读到日期时还有第二次机会。
 */
import { arg, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";

const ANNOUNCEMENT_2027 =
  "https://www.baa.org/news/registration-updates-and-information-announced-for-2027-boston-marathon-presented-by-bank-of-america/";
const NEWS_INDEX = "https://www.baa.org/races/boston-marathon/news/";

const PAGES = [ANNOUNCEMENT_2027, NEWS_INDEX];

async function main() {
  // 三种取页方式，按可用性退让：喂入已存页面 → curl → （curl 被挡时用浏览器人工存页）
  const htmlFile = arg("html");
  const pages = [];
  const texts: string[] = [];
  if (htmlFile) {
    const p = await pageFromFile(htmlFile);
    pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
    if (p.text) texts.push(p.text);
    console.error(`# 使用本地页面文件 ${htmlFile}（${p.bytes} bytes）`);
  } else {
    for (const url of PAGES) {
      // baa.org 会返回反爬挑战页（Node fetch 与 curl 都只拿到 ~3KB）
      const p = await fetchWithCurl(url);
      pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
      if (p.text) texts.push(p.text);
    }
  }
  const today = arg("today") ?? new Date().toISOString().slice(0, 10);
  // 同页会出现 5K / Qualifier / 往届日期 → 必须按主赛事关键词挑
  const picked = pickRaceDates(texts.join(" "), today, { mainEventHint: /Boston Marathon/i });

  const info = {
    site: "baa.org",
    dateSourcePages: PAGES,
    fetchedAt: new Date().toISOString(),
    today,
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      "提示：赛事页/选手页不写比赛日期，日期在本站**新闻公告页**；新一届公告发布前读不到属正常",
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
if (invoked.endsWith("03-boston.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
