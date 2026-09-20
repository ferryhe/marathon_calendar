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
const DAYNAME = "(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|(?:Sonntag|Samstag|Freitag|Donnerstag|Mittwoch|Dienstag|Montag)";

/** 句子必须带赛事语义才算比赛日。 */
const RACE_SEM = /\b(marathon|race|run|lauf|marathonlauf)\b/i;
/** 这些词说明该日期不是比赛日（博览会/抽签/报名/领物…）。 */
const NON_RACE =
  /\b(expo|exhibition|running show|registration|ballot|draw|lottery|losverfahren|mini|kids|youth|charity|conference|packet|pickup|collection|press|expo)\b/i;

export interface Candidate {
  date: string;
  dateEnd?: string;
  year: number;
  kind: "two-day" | "single-day";
  raceLike: boolean;
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
export function windowAround(text: string, idx: number, span = 80): string {
  return text.slice(Math.max(0, idx - span), Math.min(text.length, idx + span)).trim();
}

/** 抓出页面正文里的**全部**日期候选，不做丢弃。 */
export function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  // 同一组日期在页面上可能出现多次（导航块 / 票券说明 / 正文），证据句质量差很多。
  // 取"最好"的那句：raceLike 优先；都 raceLike 时优先含 marathon 的。
  const score = (c: Candidate) =>
    (c.raceLike ? 2 : 0) + (/(?:marathon|lauf)/i.test(c.evidence) ? 1 : 0);
  const push = (c: Candidate) => {
    const hit = out.find((x) => x.date === c.date && (x.dateEnd ?? "") === (c.dateEnd ?? ""));
    if (!hit) out.push(c);
    else if (score(c) > score(hit)) { hit.raceLike = c.raceLike; hit.evidence = c.evidence; }
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
      evidence: ev,
    };
  };

  // 英文：两天 —— "…on Saturday 24 and Sunday 25 April 2027"（德式星期名同样支持）
  const two = new RegExp(String.raw`(?:${DAYNAME})\s+(\d{1,2})\s*(?:,)?\s+and\s+(?:${DAYNAME})\s+(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(two)) push(mk(+m[1], +m[2], m[3], +m[4], m.index ?? 0));

  // 英文：简写 —— "24 & 25 April 2027"
  const amp = new RegExp(String.raw`(\d{1,2})\s*(?:&|and)\s*(\d{1,2})\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(amp)) push(mk(+m[1], +m[2], m[3], +m[4], m.index ?? 0));

  // 英文/德文：单日 —— "27 September 2026" / "27. September 2026"
  const one = new RegExp(String.raw`(?:${DAYNAME}\s+)?(\d{1,2})\.?\s+(${MONTH_ALT})\s+(\d{4})`, "gi");
  for (const m of text.matchAll(one)) push(mk(+m[1], null, m[2], +m[3], m.index ?? 0));

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

  const years = [...new Set(candidates.map((c) => c.year))].sort((a, b) => b - a);
  const targetYear = years.includes(nextYear) ? nextYear : (years[0] ?? nextYear);

  const pool = candidates.filter((c) => c.raceLike && c.year === targetYear);
  const droppedCandidates = candidates
    .filter((c) => !pool.includes(c))
    .map((c) => ({
      ...c,
      dropReason: !c.raceLike
        ? "句子不含赛事语义或含 expo/ballot/registration 等词"
        : `不是目标届（目标 ${targetYear}，它是 ${c.year}）`,
    }));

  // 主赛事优先（每站关键词）；一层都没命中就退回一般赛事语义
  const hint = opts.mainEventHint;
  const hintHit = hint ? pool.filter((c) => hint.test(c.evidence) || hint.test(c.sentence ?? "")) : pool;
  const hintMissed = Boolean(hint) && hintHit.length === 0;
  const stage1 = hintHit.length > 0 ? hintHit : pool;

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
    const sameYear = pool.filter((c) => c.year === chosen.year);
    if (sameYear.length > 1) {
      const dates = sameYear.map((c) => c.date).sort();
      notes.push(`目标届有 ${sameYear.length} 个候选（最早 ${dates[0]} / 最晚 ${dates[dates.length - 1]}），已取最接近的未来日期 ${chosen.date}，建议人工复核`);
    }
  }
  return { chosen, targetYear, twoDay: chosen?.kind === "two-day", notes, allCandidates: candidates, droppedCandidates };
}

export interface FetchedPage {
  url: string;
  status: number;
  bytes: number;
  textChars: number;
  error: string | null;
  text: string;
}

export async function fetchHtml(url: string, ua: string = DEFAULT_UA): Promise<FetchedPage> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const html = await res.text();
    const text = toText(html);
    return { url, status: res.status, bytes: html.length, textChars: text.length, error: null, text };
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { url, status: 0, bytes: 0, textChars: 0, error, text: "" };
  }
}
