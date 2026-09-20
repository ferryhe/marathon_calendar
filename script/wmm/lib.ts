/**
 * WMM 逐站读取器的共用底子（八个站共用；**站点差异留在各自的 XX-<site>.ts 里**）。
 *
 *   - toText / sentenceAround / iso        ：HTML → 纯文本、取所在句、拼 ISO 日期
 *   - extractCandidates                    ：正文里**所有**日期候选（英文两天赛/简写/单日 + 德式数字式）
 *   - pickRaceDates                        ：选出"下一届比赛日"（赛事语义过滤 + 最近未来日期 + 告警）
 *   - fetchHtml                            ：带 UA/超时/重定向；**失败原因不吞**
 *
 * 只读：本模块只做抓取与解析，不写任何库。
 */
export const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  januar: 1, februar: 2, märz: 3, maerz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
};
const MONTH_ALT = Object.keys(MONTHS).join("|");
// 注意：这里必须自带外层括号。否则 `(?:${DAYNAME},?\s+)?` 的 `,?\s+` 只会作用在最后一个分支上，
// 导致 "Monday, April 19, 2027" 这种美国式写法匹配不上（实测踩到）。
// 必须「非捕获」外层括号：捕获组会让 m[1]/m[2]/m[3] 下标整体错位（刚踩过）。
const DAYNAME = "(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|(?:Sonntag|Samstag|Freitag|Donnerstag|Mittwoch|Dienstag|Montag))";

/** 句子必须带赛事语义才算比赛日。 */
const RACE_SEM = /\b(marathon|race|run|lauf|marathonlauf)\b/i;

/**
 * 「宣告句式」：官网宣告下一届**比赛日**时的常用说法
 * （`will take place` / `will be held` / `to be run` / `is on` / `findet … statt`）。
 *
 * 为什么单独认这一层：同一页里还有**抽签/报名/领物**的日期，它们句子里也含 "race"，
 * 只按「赛事语义 + 最接近的未来日期」会挑到抽签日 —— 纽约实测：
 *   "The drawing for the 2027 race opens on Tuesday, January 5, 2027."（抽签）
 * 会顶掉真正的比赛日。所以**同届里优先取「宣告句式」的日期**，其余进 dropped（全量可见）。
 */
const ANNOUNCE =
  /\b(?:will (?:be (?:held|run|staged|hosted)|take place|return|kick off)|is (?:on|set for|scheduled)|takes place|to be (?:held|run|staged)|race day|will run|findet (?:am|statt))\b/i;
/**
 * 这些**短语**说明该日期不是比赛日（博览会/领物/报名窗口/抽签窗口…）。
 *
 * 注意：不能只看孤立词。实测踩到两次：
 *   - 波士顿 "…will be held on Monday, April 19, 2027. **Registration** will open on September 15, 2026."
 *     → 孤立的 registration 会把真正的比赛日判死；
 *   - 柏林正文前无句号的导航串里有 "Registration/Lottery/Charity" → 同理。
 * 所以这里只匹配"事件短语"（registration opens/window、packet pickup、expo…），
 * 并且判定窗口以日期**前面**为主（赛事名一般在日期之前）。
 */
const NON_RACE =
  /\b(expo|exhibition|running show|packet (?:pickup|collection)|number (?:pickup|collection)|registration (?:opens|closes|window|is open|will open|period)|ballot (?:window|opens|closes|results)|lottery (?:window|opens|closes|draw)|losverfahren|mini|kids|youth|charity (?:program|places|places? only)|press conference|conference|setup|teardown|after[- ]?party)\b/i;

export interface Candidate {
  date: string;
  dateEnd?: string;
  year: number;
  kind: "two-day" | "single-day";
  raceLike: boolean;
  /** 是否用了「宣告句式」（`will take place`…）—— 同届内优先取它，避免抽签/报名日顶掉比赛日 */
  announced: boolean;
  /** 判定与展示用：日期前后的小窗口 */
  evidence: string;
  /** 宽上下文（整句），仅供人工复核 */
  sentence?: string;
}

export interface PickResult {
  chosen: Candidate | null;
  targetYear: number;
  twoDay: boolean;
  notes: string[];
  allCandidates: Candidate[];
  droppedCandidates: Array<Candidate & { dropReason: string }>;
}

export function arg(name: string): string | undefined {
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

export function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function sentenceAround(text: string, idx: number): string {
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1);
  const end = text.indexOf(".", idx + 40);
  return text.slice(start, end === -1 ? idx + 240 : end + 1).trim().slice(0, 320);
}

/**
 * 日期前后的**小窗口**（判定赛事语义用）。
 *
 * 为什么不用整句：有的页面在正文前有一大段没有句号的导航/菜单文本
 * （柏林实测：`More Events Registration … Lottery Inlineskating … Charity Tour operators …`），
 * 用"上一个句号到下一个句号"会把菜单也算进来，于是真实的比赛日句子
 * （`The BMW BERLIN-MARATHON 2026 will take place on 27 September 2026.`）
 * 反而被判成"含 registration/charity 的非赛事日期"而落选。
 */
export function windowAround(text: string, idx: number, before = 110, after = 30): string {
  return text.slice(Math.max(0, idx - before), Math.min(text.length, idx + after)).trim();
}

/**
 * **句内**窗口（按句号截断）—— 专门用来判「宣告句式」。
 *
 * 为什么不能用上面的宽窗口：宽窗口会跨进上一句，把上一句的 `will be held on <比赛日>`
 * 算成当前日期的宣告句。纽约实测踩到：抽签句
 *   "...will be held on Sunday, November 1, 2026. The drawing for the 2027 race opens on Tuesday, January 5, 2027."
 * 里的抽签日期因为跨句被误判成"比赛日宣告"，于是顶掉了真正的比赛日。
 *
 * 注意：**赛事语义（raceLike）仍用宽窗口**。芝加哥首页实测：
 *   "Volunteer for the Chicago Marathon by joining a race weekend! … October 11, 2026 …"
 * 比赛日紧邻的是导航文字，句内窗口里没有 race 语义，靠宽窗口才认得出。
 */
export function sentenceWindow(text: string, idx: number, before = 110, after = 30): string {
  const rawStart = Math.max(0, idx - before);
  const rawEnd = Math.min(text.length, idx + after);
  const prevDot = text.lastIndexOf(".", idx);
  const nextDot = text.indexOf(".", idx);
  const start = prevDot >= rawStart ? prevDot + 1 : rawStart;
  const end = nextDot !== -1 && nextDot < rawEnd ? nextDot : rawEnd;
  return text.slice(start, end).trim();
}

/** 抓出页面正文里的**全部**日期候选，不做丢弃。 */
export function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  // 同一组日期在页面上可能出现多次（导航块 / 票券说明 / 正文），证据句质量差很多。
  // 取"最好"的那句：raceLike 优先；都 raceLike 时优先含 marathon 的。
  const score = (c: Candidate) =>
    (c.raceLike ? 2 : 0) + (c.announced ? 2 : 0) + (/(?:marathon|lauf)/i.test(c.evidence) ? 1 : 0);
  const push = (c: Candidate) => {
    const hit = out.find((x) => x.date === c.date && (x.dateEnd ?? "") === (c.dateEnd ?? ""));
    if (!hit) out.push(c);
    else if (score(c) > score(hit)) { hit.raceLike = c.raceLike; hit.announced = c.announced; hit.evidence = c.evidence; }
  };
  const mk = (d1: number, d2: number | null, mon: string, y: number, idx: number): Candidate => {
    const mo = MONTHS[mon.toLowerCase()];
    const win = windowAround(text, idx);
    const ev = win; // 判定与展示都用小窗口（宽上下文另存 sentence）
    return {
      sentence: sentenceAround(text, idx),
      date: iso(y, mo, d1),
      dateEnd: d2 === null ? undefined : iso(y, mo, d2),
      year: y,
      kind: d2 === null ? "single-day" : "two-day",
      raceLike: RACE_SEM.test(ev) && !NON_RACE.test(ev),
      announced: ANNOUNCE.test(sentenceWindow(text, idx)),
      evidence: ev,
    };
  };

  // 英文：两天 —— "…on Saturday 24 and Sunday 25 April 2027"（德式星期名同样支持）
  const two = new RegExp(String.raw`(?:${DAYNAME})\s+(\d{1,2})\s*(?:,)?\s+and\s+(?:${DAYNAME})\s+(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(two)) push(mk(+m[1], +m[2], m[3], +m[4], m.index ?? 0));

  // 英文：简写 —— "24 & 25 April 2027"
  const amp = new RegExp(String.raw`(\d{1,2})\s*(?:&|and)\s*(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(amp)) push(mk(+m[1], +m[2], m[3], +m[4], m.index ?? 0));

  // 英文/德文：单日「日在前」—— "27 September 2026" / "27. September 2026"
  const one = new RegExp(String.raw`(?:${DAYNAME}\s+)?(\d{1,2})\.?\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(one)) push(mk(+m[1], null, m[2], +m[3], m.index ?? 0));

  // 英文：美国式「月在前」—— "Monday, April 19, 2027" / "April 19, 2027"（美国站全是这种）
  const us = new RegExp(String.raw`(?:${DAYNAME},?\s+)?(${MONTH_ALT})\.?\s+(\d{1,2}),?\s+(\d{4})`, "gi");
  for (const m of text.matchAll(us)) push(mk(+m[2], null, m[1], +m[3], m.index ?? 0));

  // 英文：美国式两天 —— "April 24 and 25, 2027" / "April 24 & 25, 2027"
  const usTwo = new RegExp(String.raw`(${MONTH_ALT})\.?\s+(\d{1,2})\s*(?:&|and|-)\s*(\d{1,2}),?\s+(\d{4})`, "gi");
  for (const m of text.matchAll(usTwo)) push(mk(+m[2], +m[3], m[1], +m[4], m.index ?? 0));

  // 数字式 —— "27.09.2026"
  const numeric = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
  for (const m of text.matchAll(numeric)) {
    const mo = +m[2];
    if (mo < 1 || mo > 12) continue;
    push(mk(+m[1], null, Object.keys(MONTHS)[mo - 1] ?? "january", +m[3], m.index ?? 0));
  }
  return out;
}

export interface PickOpts {
  /**
   * 本站"主赛事"关键词（每站在自己的文件里给，如柏林 /BERLIN[- ]?MARATHON/i）。
   * 为什么必须给：官网首页/报名页常同时列出**配套赛**（柏林实测有 "Berlin Road Race -
   * Die Generalprobe" 8/23），只按"最近的未来日期"会挑到配套赛。
   * 主赛事关键词命中优先；一个都没命中时退回一般赛事语义，并在 notes 里说明。
   */
  mainEventHint?: RegExp;
}

export function pickRaceDates(text: string, todayIso: string, opts: PickOpts = {}): PickResult {
  const candidates = extractCandidates(text);
  const thisYear = Number(todayIso.slice(0, 4));
  const nextYear = thisYear + 1;

  // 届次基准：**有「宣告句式」的比赛日**优先。
  // 否则抽签/报名句会把年份带偏 —— 纽约实测：2026 届比赛日还没跑，页面上的抽签句已经在写 2027，
  // 按"所有候选的年份"取下一届就会挑到 2027 的抽签日。
  const raceLikeCands = candidates.filter((c) => c.raceLike);
  const announcedCands = raceLikeCands.filter((c) => c.announced);
  const yearBasis = announcedCands.length > 0 ? announcedCands : raceLikeCands;
  const years = [...new Set(yearBasis.map((c) => c.year))].sort((a, b) => b - a);
  const targetYear = years.includes(nextYear) ? nextYear : (years[0] ?? nextYear);

  const pool = candidates.filter((c) => c.raceLike && c.year === targetYear);
  // 同届里若有「宣告句式」，就只在这些里面挑（防止抽签/报名/领物日期顶掉比赛日）
  const announcedPool = pool.filter((c) => c.announced);
  const usedPool = announcedPool.length > 0 ? announcedPool : pool;
  const droppedCandidates = candidates
    .filter((c) => !usedPool.includes(c))
    .map((c) => ({
      ...c,
      dropReason: !c.raceLike
        ? "句子不含赛事语义或含 expo/participant 等词"
        : c.year !== targetYear
          ? `不是目标届（目标 ${targetYear}，它是 ${c.year}）`
          : "不是「宣告句式」（如抽签/报名/领物日期），已被同届的比赛日宣告句挤掉",
    }));

  // 主赛事优先（每站关键词）；一层都没命中就退回一般赛事语义
  const hint = opts.mainEventHint;
  const hintHit = hint ? usedPool.filter((c) => hint.test(c.evidence) || hint.test(c.sentence ?? "")) : usedPool;
  const hintMissed = Boolean(hint) && hintHit.length === 0;
  const stage1 = hintHit.length > 0 ? hintHit : usedPool;

  const twoDayPool = stage1.filter((c) => c.kind === "two-day");
  const prefer = twoDayPool.length > 0 ? twoDayPool : stage1;
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
    if (hintMissed) {
      notes.push("没有候选命中本站主赛事关键词，已退回一般赛事语义挑选 —— 请人工确认挑中的是主赛事而不是配套赛（退出码 0）");
    }
    if (chosen.kind === "two-day") notes.push(`两天赛：首日 ${chosen.date} / 末日 ${chosen.dateEnd} → race_date=首日, race_end_date=末日`);
    if (chosen.year !== nextYear) notes.push(`挑中的是 ${chosen.year} 届（当前年+1 = ${nextYear}），请人工确认是否要的是它`);
    if (announcedPool.length > 0 && announcedPool.length < pool.length) {
      notes.push(
        `同届有 ${pool.length} 个候选，其中 ${pool.length - announcedPool.length} 个不是「宣告句式」（抽签/报名/领物等）已被排除，仅在 ${announcedPool.length} 个比赛日宣告句中挑选`,
      );
    }
    const sameYear = usedPool.filter((c) => c.year === chosen.year);
    if (sameYear.length > 1) {
      const dates = sameYear.map((c) => c.date).sort();
      notes.push(`目标届有 ${sameYear.length} 个候选（最早 ${dates[0]} / 最晚 ${dates[dates.length - 1]}），已取最接近的未来日期 ${chosen.date}，建议人工复核`);
    }
  }
  return { chosen, targetYear, twoDay: chosen?.kind === "two-day", notes, allCandidates: candidates, droppedCandidates };
}

/**
 * 读入一个**已保存的页面文件**（当成一次抓取结果）。
 *
 * 为什么需要：有的站点对命令行抓取返回反爬挑战页（实测 baa.org 只回 ~3KB 挑战页，
 * fetch 与 curl 都一样）。此时用真实浏览器打开页面、存成 HTML，再喂给读取器解析：
 *   03-boston.ts --html=/tmp/baa.html
 */
export async function pageFromFile(path: string): Promise<FetchedPage> {
  const { readFileSync } = await import("node:fs");
  try {
    const html = readFileSync(path, "utf8");
    const text = toText(html);
    return { url: `file://${path}`, status: 200, bytes: html.length, textChars: text.length, error: null, text };
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { url: `file://${path}`, status: 0, bytes: 0, textChars: 0, error, text: "" };
  }
}

export interface FetchedPage {
  url: string;
  status: number;
  bytes: number;
  textChars: number;
  error: string | null;
  text: string;
}

/**
 * 用系统 curl 取页（同样返回 FetchedPage）。
 *
 * 为什么需要：个别站点对 Node 内置 fetch 只回拦截页 —— 实测 baa.org 用 fetch 只拿到 ~3KB，
 * 同一 URL 用 curl 拿到 67KB（TLS/HTTP 指纹差异）。这类站点的读取器改用本函数。
 */
export async function fetchWithCurl(url: string, ua: string = DEFAULT_UA): Promise<FetchedPage> {
  const { execFileSync } = await import("node:child_process");
  try {
    const html = execFileSync(
      "curl",
      ["-sSL", "--max-time", "30", "-A", ua, "-H", "Accept-Language: en-US,en;q=0.9", url],
      { maxBuffer: 32 * 1024 * 1024 },
    ).toString();
    const text = toText(html);
    return { url, status: html.length > 0 ? 200 : 0, bytes: html.length, textChars: text.length, error: null, text };
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { url, status: 0, bytes: 0, textChars: 0, error, text: "" };
  }
}

export async function fetchHtml(url: string, ua: string = DEFAULT_UA): Promise<FetchedPage> {
  try {
    // 只给 User-Agent 时部分站点（实测 baa.org）会回一个 3KB 的拦截页而不是正文
    //（同一 URL 用 curl 能拿到 67KB）→ 补常规浏览器请求头。
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const html = await res.text();
    const text = toText(html);
    return { url, status: res.status, bytes: html.length, textChars: text.length, error: null, text };
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { url, status: 0, bytes: 0, textChars: 0, error, text: "" };
  }
}
