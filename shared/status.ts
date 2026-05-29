// Edition status taxonomy:
//   upcoming  — registration not yet open (报名未开始)
//   imminent  — race day approaching / registration closed (即将开始)
//   open      — registration open (报名中)
//   closed    — registration closed, race not imminent (报名已截止)
//   racing    — race day in progress
//   ended     — race finished
//   cancelled — race cancelled
//   tba       — status missing / unknown from source (待定)
//
// Stored on marathon_editions.status. Can be set explicitly by a source/admin or
// derived on-the-fly from dates via `computeEditionStatus` below.

export const STATUS_VALUES = [
  "upcoming",
  "imminent",
  "open",
  "closed",
  "racing",
  "ended",
  "cancelled",
] as const;

export type EditionStatus = (typeof STATUS_VALUES)[number];
export const DISPLAY_STATUS_VALUES = [...STATUS_VALUES, "tba"] as const;
export type DisplayEditionStatus = (typeof DISPLAY_STATUS_VALUES)[number];

export function isEditionStatus(v: unknown): v is EditionStatus {
  return typeof v === "string" && (STATUS_VALUES as readonly string[]).includes(v);
}

export function isDisplayEditionStatus(v: unknown): v is DisplayEditionStatus {
  return (
    typeof v === "string" &&
    (DISPLAY_STATUS_VALUES as readonly string[]).includes(v)
  );
}

// Solid-color badges — saturated background + white text for unambiguous
// contrast on any card background (light or dark). Previous pastel-on-pastel
// (-50/-100 bg with -600/-700 text) was hard to read on the near-white card.
export const STATUS_COLOR_CLASSES: Record<DisplayEditionStatus, string> = {
  upcoming: "text-white border-amber-600 bg-amber-500 dark:bg-amber-600 dark:border-amber-500",
  imminent: "text-white border-orange-600 bg-orange-500 dark:bg-orange-600 dark:border-orange-500",
  open: "text-white border-emerald-600 bg-emerald-500 dark:bg-emerald-600 dark:border-emerald-500",
  closed: "text-white border-blue-600 bg-blue-500 dark:bg-blue-600 dark:border-blue-500",
  racing: "text-white border-purple-600 bg-purple-500 dark:bg-purple-600 dark:border-purple-500",
  ended: "text-white border-gray-600 bg-gray-500 dark:bg-gray-600 dark:border-gray-500",
  cancelled: "text-white border-red-600 bg-red-500 dark:bg-red-600 dark:border-red-500",
  tba: "text-white border-slate-600 bg-slate-500 dark:bg-slate-600 dark:border-slate-500",
};

export const STATUS_ICON: Record<DisplayEditionStatus, string> = {
  upcoming: "📋",
  imminent: "🔜",
  open: "🔥",
  closed: "⏰",
  racing: "🏃",
  ended: "✅",
  cancelled: "✗",
  tba: "⏸",
};

// i18n key suffix; combined with `status.${suffix}` in client.
export const STATUS_I18N_KEY: Record<DisplayEditionStatus, string> = {
  upcoming: "status.upcoming",
  imminent: "status.imminent",
  open: "status.open",
  closed: "status.closed",
  racing: "status.racing",
  ended: "status.ended",
  cancelled: "status.cancelled",
  tba: "status.tba",
};

const DISPLAY_PLACEHOLDER_STATUSES = new Set([
  "待更新",
  "待公布",
  "待发布",
  "待确认",
  "未知",
  "未公开",
  "notset",
  "notavailable",
]);

const UPCOMING_STATUS_VALUES = new Set([
  "upcoming",
  "notopen",
  "notyetopen",
  "报名未开始",
  "未开放",
]);

const IMMINENT_STATUS_VALUES = new Set([
  "comingsoon",
  "imminent",
  "startingsoon",
  "abouttostart",
  "即将开始",
  "即将",
  "即将开赛",
]);

const OPEN_STATUS_VALUES = new Set(["open", "registering", "registrationopen", "报名中"]);
const CLOSED_STATUS_VALUES = new Set([
  "closed",
  "close",
  "deadlinepassed",
  "soldout",
  "报名已截止",
  "已报满",
  "已截止",
  "报名截止",
]);

const RACING_STATUS_VALUES = new Set(["racing", "比赛中"]);
const ENDED_STATUS_VALUES = new Set(["ended", "finished", "已完赛", "已结束"]);
const CANCELLED_STATUS_VALUES = new Set(["cancelled", "canceled", "已取消"]);

// Map legacy string statuses to the new canonical enum.
export interface ComputeStatusInput {
  raceDate?: string | Date | null;
  registrationStart?: string | Date | null;
  registrationEnd?: string | Date | null;
  cancelled?: boolean;
  now?: Date;
}

// Parse a value into a local-calendar Date (midnight local). YYYY-MM-DD strings
// are parsed as local — not UTC — to avoid off-by-one bugs across timezones.
function toLocalDay(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Date-driven status calculator.
//
// Decision logic (prioritized):
//  1. race < today                  → ended
//  2. race = today                  → racing
//  3. race > today, no close date   → imminent ("即将开始")
//  4. today > close, race - today ≤ 14d → imminent ("即将开始")
//  5. today > close, race - today > 14d → closed ("报名已截止")
//  6. open ≤ today ≤ close          → open ("报名中")
//  7. today < open                  → upcoming ("报名未开始")
//
// Day-precision: race day == "racing" all day in local timezone.
// registrationCloseDate is inclusive (open through 23:59:59 on close date).
const RACE_IMMINENT_DAYS = 14;

export function normalizeLegacyStatus(status?: string | null): EditionStatus | "tba" | null {
  const raw = (status ?? "").trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase().replace(/[_\s-]+/g, "");
  if (UPCOMING_STATUS_VALUES.has(normalized)) {
    return "upcoming";
  }
  if (IMMINENT_STATUS_VALUES.has(normalized)) {
    return "imminent";
  }
  if (OPEN_STATUS_VALUES.has(normalized)) return "open";
  if (CLOSED_STATUS_VALUES.has(normalized)) {
    return "closed";
  }
  if (RACING_STATUS_VALUES.has(normalized)) return "racing";
  if (ENDED_STATUS_VALUES.has(normalized)) return "ended";
  if (CANCELLED_STATUS_VALUES.has(normalized)) return "cancelled";

  // 占位/待发布/待确认：不进入固定状态，交给时间/空字段兜底为待定。
  if (DISPLAY_PLACEHOLDER_STATUSES.has(normalized)) {
    return "tba";
  }

  return isEditionStatus(normalized) ? (normalized as EditionStatus) : null;
}

export function normalizeEditionStatusForStorage(input?: string | null): "" | EditionStatus {
  const normalized = normalizeLegacyStatus(input);
  return normalized === "tba" || normalized === null ? "" : normalized;
}

export function computeEditionStatus(input: ComputeStatusInput): EditionStatus {
  if (input.cancelled) return "cancelled";

  const now = input.now ?? new Date();
  const today = toLocalDay(now)!;
  const race = toLocalDay(input.raceDate);
  const regStartDay = toLocalDay(input.registrationStart);
  const regEndDay = toLocalDay(input.registrationEnd);

  // Terminal race states
  if (race) {
    if (race.getTime() < today.getTime()) return "ended";
    if (race.getTime() === today.getTime()) return "racing";
  }

  // Case 3: race_only (future race, no close date) → "即将开始"
  if (race && !regEndDay) {
    return "imminent";
  }

  // Case 4+5: past close date → "报名已截止" or "即将开始"
  if (regEndDay && today.getTime() > regEndDay.getTime()) {
    const daysToRace = race
      ? Math.round((race.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;
    if (daysToRace <= RACE_IMMINENT_DAYS) return "imminent"; // "即将开始"
    return "closed"; // "报名已截止"
  }

  // Case 6: open window
  if (regStartDay && today.getTime() >= regStartDay.getTime()) {
    if (!regEndDay || today.getTime() <= regEndDay.getTime()) return "open";
  }

  // Case 7: before registration opens
  return "upcoming";
}

// Resolve the "best" status:
// - explicit stored value wins, except for near-future upcoming recalc fallback.
// - if no date fields are present, return tba for unknown source status.
export function resolveEditionStatus(params: {
  status?: string | null;
  raceDate?: string | Date | null;
  registrationStart?: string | Date | null;
  registrationEnd?: string | Date | null;
  cancelled?: boolean;
  now?: Date;
}): DisplayEditionStatus {
  const normalizedStatus = normalizeLegacyStatus(params.status);

  // 1. Special case: do not trust `upcoming` for near-future races.
  //    When an explicit upcoming is stale but the race is within 14 days,
  //    derive from dates to avoid showing "报名未开始" incorrectly.
  if (normalizedStatus === "upcoming" && params.raceDate) {
    const now = params.now ?? new Date();
    const today = toLocalDay(now)!;
    const raceDate = toLocalDay(params.raceDate);

    if (
      raceDate &&
      Math.round((raceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 14
    ) {
      return computeEditionStatus({
        raceDate: params.raceDate,
        registrationStart: params.registrationStart,
        registrationEnd: params.registrationEnd,
        cancelled: params.cancelled ?? false,
        now,
      });
    }
  }

  // 2. Legacy or explicit new-enum status wins, unless handled by rule #1.
  if (normalizedStatus && normalizedStatus !== "tba") return normalizedStatus;

  const hasAnyDate = Boolean(params.raceDate || params.registrationStart || params.registrationEnd);
  if (!hasAnyDate) return "tba";

  const computed = computeEditionStatus({
    raceDate: params.raceDate,
    registrationStart: params.registrationStart,
    registrationEnd: params.registrationEnd,
    cancelled: params.cancelled ?? false,
    now: params.now,
  });

  return computed;
}
