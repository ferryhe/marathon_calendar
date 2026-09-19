/**
 * 每站一个日期适配器 / per-source race-date adapter.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Race dates used to be parsed inline by each script, with two copies of the
 * same `parseRaceDate()` helper (`script/import-zuicool-trail.ts`,
 * `script/fix-year-mismatch.ts`). Both shared the same defects:
 *
 *   1. No-year fallback: when the body copy omitted the year the helper wrote
 *      `new Date().getFullYear()` (+ a ">60 days in the past → +1 year"
 *      heuristic). Measured effect: 98 / 998 zuicool rows carried a wrong year
 *      (e.g. `天上阿里・极境征途—冈仁波齐52`真 2025-10-01 被记成 2026-10-01).
 *   2. The weekly checker filtered candidates with `highlights ~ '定于\d{4}年'`,
 *      so the 771 zuicool rows whose copy says only `定于10月1日` were invisible
 *      to it — the report was structurally always empty.
 *   3. nowrun's JSON-LD `startDate` is UTC (`2025-12-31T23:30:00.000Z` = CST
 *      2026-01-01); taking the literal date invented a year-off row.
 *   4. A runsignup detail page carries 1–21 `startDate` values (series races,
 *      multi-round events, UTC variants) — first/min is not "the tracked
 *      edition".
 *
 * Contract of this module (single source of truth for every importer *and* the
 * weekly checker):
 *   - **No current-year fallback, no past/future heuristic.** If a year cannot
 *     be established from the page, we return `date: null` and let the caller
 *     skip the row and log it. A missing year is a data-quality signal, not a
 *     licence to guess.
 *   - **Authority order** for the year: explicit year in the body copy
 *     (`定于YYYY年M月D日`) > page-level authoritative field (zuicool's
 *     `start_datetime-loc`, other sites' JSON-LD `startDate`) > body copy with
 *     month/day but no year (year then *must* come from the authoritative
 *     field) > `date: null, reason: 'no_year'`.
 *   - **Multi-day events store the first day** (project convention). zuicool's
 *     `start_datetime-loc` is authoritative for the *year only*; the *day* comes
 *     from the body copy's first `定于M月D日`. On conflict: year from the page
 *     field, day from the copy.
 *   - **Reschedules** (`延期/改期/推迟` + `至/到 M月D日` or `YYYY年M月D日`) win
 *     over the original date.
 *   - **Timezones**: nowrun emits UTC instants for CST races, so its JSON-LD is
 *     shifted into Asia/Shanghai (+08:00) before the calendar day is taken.
 *     Callers must NOT shift a second time when persisting.
 */

export type RaceDateSource = "desc_year" | "start_datetime_loc" | "jsonld" | "tba";

export type RaceDateReason =
  | "ok"
  /** the winning sentence was a reschedule clause */
  | "rescheduled"
  /** the copy describes a multi-day window; `date` is the first day */
  | "multi_day"
  /** body copy has month/day but nothing on the page establishes the year */
  | "no_year"
  /** page fetched fine but exposes no parseable date */
  | "no_parseable_start_date"
  /** multi-event page and none of the events matched the tracked edition */
  | "no_tracked_match"
  /** matched editions disagree on the calendar day — refuse to pick one */
  | "ambiguous_multi_edition"
  /** field present but not a parseable date */
  | "unparsable_date";

export interface PageDateResult {
  /** 4-digit year, or null when it could not be established. */
  year: number | null;
  /** `YYYY-MM-DD` (first day for multi-day events), or null. */
  date: string | null;
  source: RaceDateSource;
  /** The exact text the decision came from — keep it, it goes into warning logs. */
  evidence?: string;
  reason?: RaceDateReason;
  /** True when the copy describes a multi-day window (date = first day). */
  multiDay?: boolean;
}

export type RaceSourceKind =
  | "zuicool"
  | "nowrun"
  | "runsignup"
  | "worldsmarathons"
  | "unknown";

/** China Standard Time has no DST — a fixed +08:00 shift is exact. */
export const CST_OFFSET_MINUTES = 480;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build `YYYY-MM-DD`, rejecting impossible calendar days (e.g. 2月30日). */
export function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Calendar day (`YYYY-MM-DD`) of an ISO-8601 timestamp.
 *
 * - A `Z` timestamp is an *instant*: it is shifted by `tzOffsetMinutes` first
 *   (nowrun → `CST_OFFSET_MINUTES`, i.e. `2025-12-31T23:30:00.000Z` = 2026-01-01).
 * - A timestamp carrying a non-UTC offset (`2026-04-20T07:00:00-04:00`) or no
 *   offset at all already is source-local wall clock: its date part is used
 *   verbatim, never re-shifted.
 * - Date-only strings are returned as-is.
 */
export function calendarDay(iso: string | null | undefined, tzOffsetMinutes = 0): string | null {
  if (!iso) return null;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?\s*$/.exec(
      String(iso).trim(),
    );
  if (!m) return null;
  const [, y, mo, da, hh = "00", mi = "00", ss = "00", off] = m;
  // No offset, or an explicit non-UTC offset → the wall-clock date is the answer.
  if (!off || off !== "Z") return isoDate(+y, +mo, +da);
  const t = Date.UTC(+y, +mo - 1, +da, +hh, +mi, +ss) + tzOffsetMinutes * 60_000;
  const d = new Date(t);
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·");
}

/** Read a `<meta name=|property=X content=Y>` value (either attribute order). */
export function metaContent(html: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${esc}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*/?>`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  const re2 = new RegExp(
    `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]*(?:name|property)=["']${esc}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : null;
}

// ---------------------------------------------------------------------------
// Body-copy ("正文") parsing
// ---------------------------------------------------------------------------

interface DateMatch {
  year?: number;
  month: number;
  day: number;
  evidence: string;
}

/**
 * `定于|将于|拟于 YYYY年M月D日` — the strong "race date" sentence.
 * NOTE: a bare `于` is deliberately NOT an anchor: prose such as
 * "…从2020年5月24日首次开展" / "…于2010年4月26日出生" would otherwise be read as
 * the race date (real regressions on zuicool-37212 / zuicool-52970).
 */
const RE_ANCHORED_FULL =
  /(?:定于|将于|拟于)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

/** `定于|将于|拟于 M月D日` — strong sentence, year must come elsewhere. */
const RE_ANCHORED_MONTH_DAY = /(?:定于|将于|拟于)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

const RE_PLAIN_FULL = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const RE_PLAIN_MONTH_DAY = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

/**
 * Wording that marks a date as *not* the race date: registration windows
 * ("…9:30开启报名"), age/birthdate bounds ("…后出生"), history ("…首次开展").
 */
const NON_RACE_CONTEXT =
  /(出生|报名|截止|开放|上线|开抢|缴费|退费|早鸟|优惠|折扣|开展|首次|诞生|成立|创办|举办过|发布|招募)/;

/** "从/自/历经 2020年…" — a past-tense historical mention, not this edition. */
const NON_RACE_PREFIX = /(自|从|历经|始于)$/;

/**
 * Sub-event timestamps that sit in the copy *before* a date:
 * "报到截止时间2026年11月6日20:00", "出发时间2026年11月7日07:30".
 */
const NON_RACE_BEFORE =
  /(报到|截止|关门|出发|领物|领取|签到|开放|报名|缴费|优惠|早鸟|折扣|出生|开展|首次)/;

/** True when `index` sits inside the innermost open （…） / (…) at that point. */
function insideParens(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const open = Math.max(before.lastIndexOf("（"), before.lastIndexOf("("));
  if (open < 0) return false;
  const close = Math.max(before.lastIndexOf("）"), before.lastIndexOf(")"));
  return open > close;
}

/** Offset of the end of the copy's first sentence (any 。！？； or newline). */
function firstSentenceEnd(text: string): number {
  const m = /[。！？；;\n]/.exec(text);
  return m && m.index !== undefined ? m.index : text.length;
}

/**
 * Guards applied to the *weak* (unanchored) matches only — the anchored
 * `定于…` forms are trusted and skip all of this.
 *
 * Rejects, in order: date ranges inside （）(age/birth bands), dates that open a
 * sub-event clause (报到截止/出发/关门/报名…), history prefixes (从2020年…),
 * registration/history wording right after the date, and anything past the first
 * sentence — zuicool's lead sentence holds the race date, later paragraphs hold
 * check-in/start/cut-off times (real row zuicool-48442: "报到截止时间2026年11月6日"
 * must not beat "定于11月4日-11月7日").
 */
function looksNonRaceContext(text: string, start: number, end: number): boolean {
  if (insideParens(text, start)) return true;
  if (start >= firstSentenceEnd(text)) return true;
  if (NON_RACE_BEFORE.test(text.slice(Math.max(0, start - 6), start))) return true;
  if (NON_RACE_PREFIX.test(text.slice(Math.max(0, start - 3), start))) return true;
  // 20-char look-ahead: enough for "…2018年4月26日出生；" and
  // "…2025年12月19日9:30开启报名" (both real rows), while a legit race sentence
  // is unaffected because those use the anchored `定于…` form.
  return NON_RACE_CONTEXT.test(text.slice(end, end + 20));
}

/**
 * `延期|改期|推迟` … `至|到` `[YYYY年]M月D日` — all three sentence shapes the
 * sources use. A clause preceded by registration wording (`报名延期至…`) is
 * rejected: that is a deadline change, not a race-date change.
 */
const RE_RESCHEDULE =
  /(?:延期|改期|推迟)[^。；;，,\n]{0,16}?(?:至|到)\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

function evidenceAround(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 12), Math.min(text.length, index + length + 12)).trim();
}

function findFullYearDate(text: string): DateMatch | null {
  const anchored = RE_ANCHORED_FULL.exec(text);
  if (anchored && anchored.index !== undefined) {
    return {
      year: +anchored[1],
      month: +anchored[2],
      day: +anchored[3],
      evidence: evidenceAround(text, anchored.index, anchored[0].length),
    };
  }
  // Plain `YYYY年M月D日` is accepted only when its context looks like a race
  // sentence: "报名2026年9月1日截止" (registration), "从2020年5月24日首次开展"
  // (history) and "（2010年4月26日…出生）" (age bounds) must all be skipped.
  const re = new RegExp(RE_PLAIN_FULL.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (looksNonRaceContext(text, m.index, m.index + m[0].length)) continue;
    return {
      year: +m[1],
      month: +m[2],
      day: +m[3],
      evidence: evidenceAround(text, m.index, m[0].length),
    };
  }
  return null;
}

function findMonthDay(text: string, anchoredOnly: boolean): DateMatch | null {
  const anchored = RE_ANCHORED_MONTH_DAY.exec(text);
  if (anchored && anchored.index !== undefined) {
    return {
      month: +anchored[1],
      day: +anchored[2],
      evidence: evidenceAround(text, anchored.index, anchored[0].length),
    };
  }
  if (anchoredOnly) return null;
  const re = new RegExp(RE_PLAIN_MONTH_DAY.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (looksNonRaceContext(text, m.index, m.index + m[0].length)) continue;
    return {
      month: +m[1],
      day: +m[2],
      evidence: evidenceAround(text, m.index, m[0].length),
    };
  }
  return null;
}

interface RescheduleMatch extends DateMatch {
  keyword: string;
}

export function findReschedule(text: string): RescheduleMatch | null {
  const re = new RegExp(RE_RESCHEDULE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    // "报名延期至…" / "缴费截止推迟到…" are registration windows, not races.
    if (/报名|缴费|退费|早鸟|优惠|折扣|截止/.test(before)) continue;
    // …and so is "延期至10月10日开放报名" (a deadline right after the clause), but
    // be strict with the window here: "延期至11月23日举行，报名通道继续开放" IS a
    // reschedule and is followed by 报名 later in the same sentence.
    if (/^(报名|缴费|开放|上线|开抢|截止)/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 3))) {
      continue;
    }
    return {
      keyword: m[0].slice(0, 2),
      year: m[1] ? +m[1] : undefined,
      month: +m[2],
      day: +m[3],
      evidence: evidenceAround(text, m.index, m[0].length),
    };
  }
  return null;
}

/**
 * Multi-day window (`定于11月4日-11月7日` / `8月15日-16日`). The stored
 * `race_date` stays the first day (project convention) — this flag only lets
 * callers annotate reports.
 */
export function looksMultiDay(text: string): boolean {
  return (
    /\d{1,2}\s*月\s*\d{1,2}\s*日\s*(?:[-—~～－]|至|到)\s*(?:\d{1,2}\s*月\s*)?\d{1,2}\s*日/.test(
      text,
    ) || /\d{1,2}\s*月\s*\d{1,2}\s*[-—~～－]\s*\d{1,2}\s*日/.test(text)
  );
}

// ---------------------------------------------------------------------------
// Page-level authoritative fields
// ---------------------------------------------------------------------------

export interface ZuicoolDateMeta {
  year: number;
  month: number;
  day: number;
  /** `YYYY-MM-DD` from the page field — year/day reference, first day of the run. */
  full: string;
  evidence: string;
}

/**
 * zuicool event pages carry the authoritative start date in
 * `<div class="start_datetime-loc">\n  2025.10.01  &middot;\n  西藏 …  </div>`
 * (measured coverage 120/120). Used for the **year** (and as the whole date when
 * the body copy has no date of its own).
 */
export function extractZuicoolStartDatetime(html: string): ZuicoolDateMeta | null {
  const div =
    /<div[^>]*class=["'][^"']*start_datetime-loc[^"']*["'][^>]*>([\s\S]{0,400}?)<\/div>/i.exec(
      html,
    );
  const window = div ? div[1] : (() => {
    // Fallback: the markup may be nested/malformed — scan a window after the class.
    const i = html.indexOf("start_datetime-loc");
    return i < 0 ? null : html.slice(i, i + 300);
  })();
  if (!window) return null;
  const m = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(decodeEntities(window));
  if (!m) return null;
  const [full, y, mo, da] = m;
  const iso = isoDate(+y, +mo, +da);
  if (!iso) return null;
  return {
    year: +y,
    month: +mo,
    day: +da,
    full: iso,
    evidence: full.trim(),
  };
}

export interface JsonLdEvent {
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  types: string[];
}

/**
 * Every JSON-LD `*Event` node on the page, in document order, including ones
 * without a `startDate` (needed so "how many editions does this page describe"
 * stays honest). Handles arrays, `@graph`, nested `subEvent`/`itemListElement`.
 */
export function collectJsonLdEvents(html: string): JsonLdEvent[] {
  const out: JsonLdEvent[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .replace(/^\s*\/\*<!\[CDATA\[\*\//, "")
      .replace(/\/\*\]\]>\*\/\s*$/, "")
      .trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    walk(parsed);
  }
  return out;

  function walk(node: unknown): void {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    const types = (Array.isArray(t) ? t : t ? [t] : []).filter(
      (x): x is string => typeof x === "string",
    );
    if (types.some((x) => /event/i.test(x))) {
      out.push({
        name: typeof obj.name === "string" ? obj.name : undefined,
        startDate: typeof obj.startDate === "string" ? obj.startDate : undefined,
        endDate: typeof obj.endDate === "string" ? obj.endDate : undefined,
        url: typeof obj.url === "string" ? obj.url : undefined,
        types,
      });
    }
    for (const key of ["@graph", "subEvent", "subEvents", "itemListElement", "item", "event", "events"]) {
      if (key in obj) walk(obj[key]);
    }
  }
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function normalizeUrlKey(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

export interface TrackedEditionOpts {
  /** Race name as tracked in our DB (marathon.name / name_en). */
  trackedName?: string;
  /** Source URL as tracked in our DB (marathon_sources.source_url). */
  eventUrl?: string;
}

/**
 * Pick the JSON-LD event that corresponds to the *tracked edition*.
 *
 * Never "first" / "min" — runsignup pages legitimately carry up to 21
 * `startDate` values (series races, multi-round events, UTC variants of the same
 * event). Returns `null` plus a reason when the page cannot identify the edition
 * unambiguously.
 */
function pickJsonLdEvent(
  events: JsonLdEvent[],
  opts: TrackedEditionOpts,
): { event: JsonLdEvent; reason: RaceDateReason } | { event: null; reason: RaceDateReason } {
  const withDate = events.filter((e) => Boolean(e.startDate));
  if (withDate.length === 0) return { event: null, reason: "no_parseable_start_date" };

  // 1) explicit URL match wins — it identifies the edition, not just the name.
  if (opts.eventUrl) {
    const want = normalizeUrlKey(opts.eventUrl);
    const byUrl = withDate.filter((e) => e.url && normalizeUrlKey(e.url) === want);
    if (byUrl.length >= 1) return { event: byUrl[0], reason: "ok" };
  }

  // 2) name match (exact normalized, then a >=60% containment match so a DB name
  //    like "Boston Marathon 2026/04" still matches JSON-LD "Boston Marathon"
  //    while a training-program/5k sibling does not).
  if (opts.trackedName) {
    const want = normalizeName(opts.trackedName);
    let matches: JsonLdEvent[] = [];
    if (want) {
      matches = withDate.filter((e) => e.name && normalizeName(e.name) === want);
      if (matches.length === 0) {
        matches = withDate.filter((e) => {
          if (!e.name) return false;
          const got = normalizeName(e.name);
          if (!got || !want) return false;
          const [short, long] = got.length <= want.length ? [got, want] : [want, got];
          return long.includes(short) && short.length / long.length >= 0.6;
        });
      }
    }
    if (matches.length === 0) return { event: null, reason: "no_tracked_match" };
    if (matches.length >= 1) return { event: matches[0], reason: "ok" };
  }

  if (withDate.length === 1) return { event: withDate[0], reason: "ok" };
  return { event: null, reason: "no_tracked_match" };
}

/**
 * Days of every candidate event; if the matched editions disagree on the
 * calendar day we refuse to choose (`ambiguous_multi_edition`) instead of
 * silently taking the first/min. Same-day duplicates (UTC variants) are fine.
 */
function resolveFromJsonLd(
  html: string,
  opts: TrackedEditionOpts,
  tzOffsetMinutes: number,
): PageDateResult {
  const events = collectJsonLdEvents(html);
  const picked = pickJsonLdEvent(events, opts);
  if (!picked.event) {
    return {
      year: null,
      date: null,
      source: "tba",
      reason: picked.reason,
      evidence: `${events.length} JSON-LD event node(s) on page`,
    };
  }
  const { event } = picked;
  const day = calendarDay(event.startDate, tzOffsetMinutes);
  if (!day) {
    return {
      year: null,
      date: null,
      source: "tba",
      reason: "unparsable_date",
      evidence: String(event.startDate),
    };
  }
  const [y, mo, da] = day.split("-").map(Number);
  return {
    year: y,
    date: day,
    source: "jsonld",
    evidence: `startDate=${event.startDate}${event.name ? ` name=${event.name}` : ""}`,
    reason: "ok",
  };
}

// ---------------------------------------------------------------------------
// Per-source resolvers
// ---------------------------------------------------------------------------

/**
 * zuicool.com event page. Priority:
 *   1. 延期/改期/推迟 clause (year from the clause, else from the page field)
 *   2. explicit year in the copy (`定于YYYY年M月D日`)
 *   3. month/day in the copy + year from `start_datetime-loc`
 *   4. `start_datetime-loc` alone
 *   5. nothing → `date: null, reason: 'no_year'`
 */
export function resolveZuicoolRaceDate(html: string): PageDateResult {
  const desc =
    metaContent(html, "og:description") ?? metaContent(html, "description") ?? "";
  const meta = extractZuicoolStartDatetime(html);
  const multiDay = looksMultiDay(desc);

  const resched = findReschedule(desc);
  if (resched) {
    // Year: the clause itself > the page's authoritative field > an explicit year
    // stated elsewhere in the same copy (last resort, never the current year).
    const year =
      resched.year ?? meta?.year ?? findFullYearDate(desc)?.year ?? null;
    const iso = year ? isoDate(year, resched.month, resched.day) : null;
    if (!iso) {
      return {
        year: null,
        date: null,
        source: "tba",
        reason: "no_year",
        evidence: resched.evidence,
        multiDay,
      };
    }
    return {
      year,
      date: iso,
      source: resched.year ? "desc_year" : "start_datetime_loc",
      evidence: resched.evidence,
      reason: "rescheduled",
      multiDay,
    };
  }

  const full = findFullYearDate(desc);
  if (full) {
    const iso = isoDate(full.year!, full.month, full.day);
    if (iso) {
      return {
        year: full.year!,
        date: iso,
        source: "desc_year",
        evidence: full.evidence,
        reason: multiDay ? "multi_day" : "ok",
        multiDay,
      };
    }
  }

  const md = findMonthDay(desc, false);
  if (md) {
    if (!meta) {
      // Month/day without any authoritative year → no guess. This is the exact
      // case that produced the 98 wrong-year rows.
      return {
        year: null,
        date: null,
        source: "tba",
        reason: "no_year",
        evidence: md.evidence,
        multiDay,
      };
    }
    const iso = isoDate(meta.year, md.month, md.day);
    if (iso) {
      return {
        year: meta.year,
        date: iso,
        source: "start_datetime_loc",
        evidence: `${md.evidence} @ start_datetime-loc=${meta.evidence}`,
        reason: multiDay ? "multi_day" : "ok",
        multiDay,
      };
    }
  }

  if (meta) {
    return {
      year: meta.year,
      date: meta.full,
      source: "start_datetime_loc",
      evidence: meta.evidence,
      reason: "ok",
      multiDay,
    };
  }

  return { year: null, date: null, source: "tba", reason: "no_year", multiDay };
}

export interface NowrunOpts extends TrackedEditionOpts {}

/**
 * nowrun.cn event page: the only reliable field is the JSON-LD `Event.startDate`
 * and it is a **UTC instant** for a CST race. `2025-12-31T23:30:00.000Z` is
 * 2026-01-01 in Shanghai — the fixed `+08:00` shift is applied here exactly once.
 */
export function resolveNowrunStartDate(html: string, opts: NowrunOpts = {}): PageDateResult {
  const res = resolveFromJsonLd(html, opts, CST_OFFSET_MINUTES);
  if (!res.date && res.reason === "no_parseable_start_date") {
    // Chinese body copy is a usable secondary signal *only* when it carries an
    // explicit year (never a month/day without a year).
    const desc =
      metaContent(html, "og:description") ?? metaContent(html, "description") ?? "";
    const full = findFullYearDate(desc);
    if (full) {
      const iso = isoDate(full.year!, full.month, full.day);
      if (iso) {
        return {
          year: full.year!,
          date: iso,
          source: "desc_year",
          evidence: full.evidence,
          reason: "ok",
          multiDay: looksMultiDay(desc),
        };
      }
    }
  }
  return res;
}

export interface RunsignupOpts extends TrackedEditionOpts {}

/**
 * runsignup.com race page: 1–21 `startDate` values per page (series / sub-races /
 * UTC variants). The tracked edition is identified by `trackedName`/`eventUrl`;
 * pulling first/min produced "series race took a sibling's date" rows.
 * runsignup emits source-local ISO (offset or naive), so no tz shift is applied.
 */
export function resolveRunsignupStartDate(
  html: string,
  opts: RunsignupOpts = {},
): PageDateResult {
  return resolveFromJsonLd(html, opts, 0);
}

/**
 * worldsmarathons.com event page: its Event JSON-LD `startDate` is reliable.
 * Anything unparseable stays TBA — the project does not guess (wmm-official
 * pages measured 0/5 parseable `startDate`, English "Held on Sunday 1 March
 * 2026" matched 0/7 → TBA, never a fabricated date).
 */
export function resolveWorldsmarathonsStartDate(html: string): PageDateResult {
  return resolveFromJsonLd(html, {}, 0);
}

/** Generic JSON-LD Event date — used for one-off/official race sites. */
export function resolveGenericJsonLdEventDate(
  html: string,
  opts: TrackedEditionOpts = {},
): PageDateResult {
  return resolveFromJsonLd(html, opts, 0);
}

// ---------------------------------------------------------------------------
// Source dispatch (shared by importers and the weekly checker)
// ---------------------------------------------------------------------------

export function classifySourceKind(url: string | null | undefined): RaceSourceKind {
  if (!url) return "unknown";
  const u = url.toLowerCase();
  if (u.includes("zuicool.com")) return "zuicool";
  if (u.includes("nowrun.")) return "nowrun";
  if (u.includes("runsignup.com")) return "runsignup";
  if (u.includes("worldsmarathons.com")) return "worldsmarathons";
  return "unknown";
}

export function resolveRaceDateBySource(
  kind: RaceSourceKind,
  html: string,
  opts: TrackedEditionOpts = {},
): PageDateResult {
  switch (kind) {
    case "zuicool":
      return resolveZuicoolRaceDate(html);
    case "nowrun":
      return resolveNowrunStartDate(html, opts);
    case "runsignup":
      return resolveRunsignupStartDate(html, opts);
    case "worldsmarathons":
      return resolveWorldsmarathonsStartDate(html);
    default:
      return resolveGenericJsonLdEventDate(html, opts);
  }
}
