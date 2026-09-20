/**
 * WMM 站点读取器 · 01 伦敦马拉松（tcslondonmarathon.com）
 *
 *   npx tsx script/wmm/01-london.ts                     # 抓官网 + 打印结果
 *   npx tsx script/wmm/01-london.ts --json=/tmp/l.json  # 结果落盘
 *   npx tsx script/wmm/01-london.ts --today=2026-09-20  # 固定"今天"（自测/可复现）
 *
 * 只读：抓页面 + 解析，**不写库**。
 *
 * 这一站的特殊情况：**2027 届首次跨两天**（官网原文 "…will take place across two days,
 * on Saturday 24 and Sunday 25 April 2027…"）→ 输出 `date`（首日）+ `dateEnd`（末日）。
 * 该站**没有任何 JSON-LD 赛事结构化数据**，只能从正文句子抽。
 *
 * 选择逻辑（2026-09-20 按独立复核意见修）：
 *   1. 页面正文里**所有**日期都进候选（`allCandidates`），不适用的进 `droppedCandidates`
 *      —— README 承诺的"全量"与实现一致，人工复核不会以为"页面就这些日期"。
 *   2. 只有**带赛事语义**的句子（含 marathon/race/run，且不含 expo/ballot/registration/
 *      running show/mini/charity 等）才算比赛日 —— 修掉"博览会跨两天被当成比赛日"。
 *   3. 取"下一届"（默认 当前年+1；没有则取最大年份），并在其中取**最近的未来日期**
 *      —— 修掉"同年多条时取正文最先出现的"。
 *   4. 抓取失败/解析不到 → 退出码 2（批量/定时跑不会静默"成功"），且 `pages[].error` 带出原因。
 */
const URL_MAIN = "https://www.tcslondonmarathon.com/";
const URL_BALLOT = "https://www.tcslondonmarathon.com/enter/2027-ballot";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_ALT = Object.keys(MONTHS).join("|");
const DAYNAME = "(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day";

/** 句子必须带赛事语义才算比赛日。 */
const RACE_SEM = /\b(marathon|race|run)\b/i;
/** 这些词说明该日期不是比赛日（博览会/抽签/报名/领物…）。 */
const NON_RACE =
  /\b(expo|exhibition|running show|registration|ballot|draw|lottery|mini|kids|charity|conference|packet|pickup|collection|press)\b/i;

export interface Candidate {
  date: string;
  dateEnd?: string;
  year: number;
  kind: "two-day" | "single-day";
  /** 句子是否带赛事语义（决定它能不能被选为比赛日） */
  raceLike: boolean;
  evidence: string;
}

export interface PickResult {
  chosen: Candidate | null;
  targetYear: number;
  twoDay: boolean;
  notes: string[];
  allCandidates: Candidate[];
  droppedCandidates: Array<Candidate & { dropReason: string }>;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

export function toText(html: string): string {
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

function sentenceAround(text: string, idx: number): string {
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1);
  const end = text.indexOf(".", idx + 40);
  return text.slice(start, end === -1 ? idx + 240 : end + 1).trim().slice(0, 320);
}

/** 抓出页面正文里的**全部**日期候选（含事件性日期），不做丢弃。 */
export function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (c: Candidate) => {
    const hit = out.find((x) => x.date === c.date && (x.dateEnd ?? "") === (c.dateEnd ?? ""));
    if (!hit) out.push(c);
    else if (!hit.raceLike && c.raceLike) {
      // 同一组日期若有一句带赛事语义，取那句
      hit.raceLike = true;
      hit.evidence = c.evidence;
    }
  };
  const mk = (d1: number, d2: number | null, mon: string, y: number, idx: number) => {
    const mo = MONTHS[mon.toLowerCase()];
    const ev = sentenceAround(text, idx);
    return {
      date: iso(y, mo, d1),
      dateEnd: d2 === null ? undefined : iso(y, mo, d2),
      year: y,
      kind: (d2 === null ? "single-day" : "two-day") as Candidate["kind"],
      raceLike: RACE_SEM.test(ev) && !NON_RACE.test(ev),
      evidence: ev,
    };
  };

  // 形态 1：两天 —— "…across two days, on Saturday 24 and Sunday 25 April 2027"
  const two = new RegExp(
    String.raw`${DAYNAME}\s+(\d{1,2})\s*(?:,)?\s+and\s+${DAYNAME}\s+(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`,
    "gi",
  );
  for (const m of text.matchAll(two)) push(mk(+m[1], +m[2], m[3], +m[4], m.index ?? 0));

  // 形态 2：简写 —— "24 & 25 April 2027"
  const amp = new RegExp(String.raw`(\d{1,2})\s*(?:&|and)\s*(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(amp)) push(mk(+m[1], +m[2], m[3], +m[4], m.index ?? 0));

  // 形态 3：单日 —— "on Sunday 25 April 2027" / "is on Sunday 25 April 2027"
  const one = new RegExp(String.raw`(?:${DAYNAME}\s+)?(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(one)) push(mk(+m[1], null, m[2], +m[3], m.index ?? 0));

  // 形态 1/2 已覆盖的日期，会被去重合并
  return out;
}

/** 从候选里选出"下一届比赛日"。todayIso 用于可复现（自测可固定）。 */
export function pickRaceDates(text: string, todayIso: string): PickResult {
  const candidates = extractCandidates(text);
  const thisYear = Number(todayIso.slice(0, 4));
  const nextYear = thisYear + 1;

  const years = [...new Set(candidates.map((c) => c.year))].sort((a, b) => b - a);
  const targetYear = years.includes(nextYear) ? nextYear : (years[0] ?? nextYear);

  const raceLike = candidates.filter((c) => c.raceLike);
  const pool = raceLike.filter((c) => c.year === targetYear);
  const droppedCandidates = candidates
    .filter((c) => !pool.includes(c))
    .map((c) => ({
      ...c,
      dropReason: !c.raceLike
        ? "句子不含赛事语义或含 expo/ballot/registration 等词"
        : `不是目标届（目标 ${targetYear}，它是 ${c.year}）`,
    }));

  // 目标届里：优先"真·两天赛"，再取最近的未来日期（没有未来日期则取最近的一个）
  const twoDayPool = pool.filter((c) => c.kind === "two-day");
  const prefer = twoDayPool.length > 0 ? twoDayPool : pool;
  const future = prefer.filter((c) => c.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date));
  const chosen = future[0] ?? prefer.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const notes: string[] = [];
  if (!chosen) {
    notes.push(
      candidates.length === 0
        ? "没解析到任何日期 —— 可能抓取失败或页面改版，请人工核对（退出码 2）"
        : `解析到 ${candidates.length} 个日期但都不像 ${targetYear} 届的比赛日，请人工核对（退出码 2）`,
    );
  } else {
    if (chosen.kind === "two-day") {
      notes.push(`两天赛：首日 ${chosen.date} / 末日 ${chosen.dateEnd} → race_date=首日, race_end_date=末日`);
    }
    if (chosen.year !== nextYear) {
      notes.push(`挑中的是 ${chosen.year} 届（当前年+1 = ${nextYear}），请人工确认是否要的是它`);
    }
    const sameYear = pool.filter((c) => c.year === chosen.year);
    if (sameYear.length > 1) {
      const dates = sameYear.map((c) => c.date).sort();
      notes.push(`目标届有 ${sameYear.length} 个候选（最早 ${dates[0]} / 最晚 ${dates[dates.length - 1]}），已取最接近的未来日期 ${chosen.date}，建议人工复核`);
    }
  }
  return {
    chosen,
    targetYear,
    twoDay: chosen?.kind === "two-day",
    notes,
    allCandidates: candidates,
    droppedCandidates,
  };
}

async function fetchHtml(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, ok: res.ok, html: await res.text(), error: undefined as string | undefined };
  } catch (e) {
    return { status: 0, ok: false, html: "", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

async function main() {
  // 只抓一次：pages 用于诊断，text 用于解析
  const pages = [];
  const texts: string[] = [];
  for (const url of [URL_MAIN, URL_BALLOT]) {
    const r = await fetchHtml(url);
    const text = toText(r.html);
    pages.push({
      url,
      status: r.status,
      bytes: r.html.length,
      textChars: text.length,
      error: r.error ?? null, // 抓取失败原因必须带出来（以前被吞 → 与"页面为空"无法区分）
    });
    if (text) texts.push(text);
  }
  const picked = pickRaceDates(texts.join(" "), arg("today") ?? new Date().toISOString().slice(0, 10));

  const info = {
    site: "tcslondonmarathon.com",
    fetchedAt: new Date().toISOString(),
    today: arg("today") ?? new Date().toISOString().slice(0, 10),
    pages,
    chosen: picked.chosen,
    chosenForYear: picked.chosen?.year ?? null,
    twoDay: picked.twoDay,
    notes: picked.notes,
    allCandidates: picked.allCandidates,
    droppedCandidates: picked.droppedCandidates,
    counts: {
      all: picked.allCandidates.length,
      dropped: picked.droppedCandidates.length,
    },
  };
  console.log(JSON.stringify(info, null, 1));

  const out = arg("json");
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify(info, null, 1));
    console.error(`# 已写入 ${out}`);
  }
  // 退出码：0 = 正常；2 = 没解析到比赛日（含抓取失败）——批量跑不会静默"成功"
  if (!picked.chosen) process.exitCode = 2;
}

const invoked = process.argv[1] ?? "";
if (invoked.endsWith("01-london.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
