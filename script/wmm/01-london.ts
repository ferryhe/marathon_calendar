/**
 * WMM 站点读取器 · 01 伦敦马拉松（tcslondonmarathon.com）
 *
 *   npx tsx script/wmm/01-london.ts                # 打印结果
 *   npx tsx script/wmm/01-london.ts --json=/tmp/london.json
 *
 * 只读：抓页面 + 解析，**不写库**。
 *
 * 这一站的特殊情况（2026-09-20 实测）：**2027 届首次跨两天**
 *   官网原文："…for the first and only time, the TCS London Marathon will take place
 *   across two days, on Saturday 24 and Sunday 25 April 2027, welcoming 100,000 runners…"
 *   另有简写："24 & 25 April 2027"
 * → 所以本程序输出 `date`（首日）+ `dateEnd`（末日），并保留挑中它的原句作为证据。
 *
 * 该站**没有任何 JSON-LD 赛事结构化数据**（实测 ld+json 里只有网站/面包屑），
 * 只能从正文句子抽 → 因此本程序把"所有日期候选 + 所在句子"一并打印，便于人工复核。
 */
const URL_MAIN = "https://www.tcslondonmarathon.com/";
const URL_BALLOT = "https://www.tcslondonmarathon.com/enter/2027-ballot";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/** HTML → 纯文本（保留句子边界，去掉标签与多余空白）。 */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t\r\n\u00a0]+/g, " ")
    .trim();
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface Candidate {
  date: string;
  dateEnd?: string;
  year: number;
  evidence: string;
  kind: "two-day" | "single-day";
}

/** 从页面正文里抓所有"比赛日期"候选（含两天赛形态），带上挑中它的原句。 */
function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    const k = `${c.date}~${c.dateEnd ?? ""}`;
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  };

  // 形态 1：两天赛 —— "will take place across two days, on Saturday 24 and Sunday 25 April 2027"
  const twoDay = new RegExp(
    String.raw`(?:across\s+two\s+days[^.]{0,40}?|on\s+)?(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+(\d{1,2})\s+and\s+(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+(\d{1,2})\s+(${Object.keys(MONTHS).join("|")})\s+(\d{4})`,
    "gi",
  );
  for (const m of text.matchAll(twoDay)) {
    const [, d1, d2, mon, y] = m;
    const mo = MONTHS[mon.toLowerCase()];
    push({
      date: iso(+y, mo, +d1),
      dateEnd: iso(+y, mo, +d2),
      year: +y,
      evidence: sentenceAround(text, m.index ?? 0),
      kind: "two-day",
    });
  }

  // 形态 2：简写 —— "24 & 25 April 2027"
  const amp = new RegExp(String.raw`(\d{1,2})\s*(?:&|and)\s*(\d{1,2})\s+(${Object.keys(MONTHS).join("|")})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(amp)) {
    const [, d1, d2, mon, y] = m;
    const mo = MONTHS[mon.toLowerCase()];
    push({ date: iso(+y, mo, +d1), dateEnd: iso(+y, mo, +d2), year: +y, evidence: sentenceAround(text, m.index ?? 0), kind: "two-day" });
  }

  // 形态 3：单日 —— "Held on Sunday 26 April 2026" / "Sunday 25 April 2027"
  const single = new RegExp(String.raw`(?:on\s+)?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+)?(\d{1,2})\s+(${Object.keys(MONTHS).join("|")})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(single)) {
    const [, d, mon, y] = m;
    const mo = MONTHS[mon.toLowerCase()];
    const ev = sentenceAround(text, m.index ?? 0);
    // 只保留"像比赛日期"的句子（排除抽签窗口/报名期这类）
    if (!/take place|takes place|held on|race day|marathon day|will be held|staged on/i.test(ev)) continue;
    push({ date: iso(+y, mo, +d), year: +y, evidence: ev, kind: "single-day" });
  }
  return out;
}

function sentenceAround(text: string, idx: number): string {
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1);
  const end = text.indexOf(".", idx + 40);
  return text.slice(start, end === -1 ? idx + 200 : end + 1).trim().slice(0, 320);
}

async function fetchHtml(url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    return { status: res.status, ok: res.ok, html: await res.text() };
  } catch (e) {
    return { status: 0, ok: false, html: "", error: String(e) };
  }
}

async function main() {
  const pages = [];
  for (const url of [URL_MAIN, URL_BALLOT]) {
    const r = await fetchHtml(url);
    const text = toText(r.html);
    pages.push({ url, status: r.status, bytes: r.html.length, text });
  }

  const all: Candidate[] = [];
  for (const p of pages) for (const c of extractCandidates(p.text)) all.push(c);
  // 去重（同一句可能被多种形态命中）
  const uniq: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of all.sort((a, b) => b.year - a.year)) {
    const k = `${c.date}~${c.dateEnd ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k); uniq.push(c);
  }

  // 选取：只要有两天赛形态就优先（伦敦 2027 的情况），否则取最新一届的单日
  const two = uniq.filter((c) => c.kind === "two-day");
  const chosen = two[0] ?? uniq[0] ?? null;
  const nextYear = new Date().getFullYear() + 1;

  const info: Record<string, unknown> = {
    site: "tcslondonmarathon.com",
    fetchedAt: new Date().toISOString(),
    pages: pages.map((p) => ({ url: p.url, status: p.status, bytes: p.bytes })),
    chosen,
    chosenForYear: chosen?.year ?? null,
    allCandidates: uniq,
    notes: [] as string[],
  };
  if (chosen && chosen.year !== nextYear) {
    (info.notes as string[]).push(`挑中的是 ${chosen.year} 届（当前年份+1 = ${nextYear}），请人工确认是否要的是它`);
  }
  if (chosen?.kind === "two-day") {
    (info.notes as string[]).push(`两天赛：首日 ${chosen.date} / 末日 ${chosen.dateEnd} → race_date=首日, race_end_date=末日`);
  }

  console.log(JSON.stringify(info, null, 1));
  const out = arg("json");
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify(info, null, 1));
    console.error(`# 已写入 ${out}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
