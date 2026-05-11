// Edition status taxonomy aligned with nowrun.cn:
//   upcoming  — info available, registration not yet open
//   open      — registration open (highlighted in UI)
//   closed    — registration closed but race not yet held ("待比赛")
//   racing    — race day in progress
//   ended     — race finished
//   cancelled — race cancelled
//
// Stored on marathon_editions.status. Can be set explicitly by a source/admin or
// derived on-the-fly from dates via `computeEditionStatus` below.

export const STATUS_VALUES = [
  "upcoming",
  "open",
  "closed",
  "racing",
  "ended",
  "cancelled",
] as const;

export type EditionStatus = (typeof STATUS_VALUES)[number];

export function isEditionStatus(v: unknown): v is EditionStatus {
  return typeof v === "string" && (STATUS_VALUES as readonly string[]).includes(v);
}

// Solid-color badges — saturated background + white text for unambiguous
// contrast on any card background (light or dark). Previous pastel-on-pastel
// (-50/-100 bg with -600/-700 text) was hard to read on the near-white card.
export const STATUS_COLOR_CLASSES: Record<EditionStatus, string> = {
  upcoming: "text-white border-amber-600 bg-amber-500 dark:bg-amber-600 dark:border-amber-500",
  open: "text-white border-emerald-600 bg-emerald-500 dark:bg-emerald-600 dark:border-emerald-500",
  closed: "text-white border-blue-600 bg-blue-500 dark:bg-blue-600 dark:border-blue-500",
  racing: "text-white border-purple-600 bg-purple-500 dark:bg-purple-600 dark:border-purple-500",
  ended: "text-white border-gray-600 bg-gray-500 dark:bg-gray-600 dark:border-gray-500",
  cancelled: "text-white border-red-600 bg-red-500 dark:bg-red-600 dark:border-red-500",
};

export const STATUS_ICON: Record<EditionStatus, string> = {
  upcoming: "🔜",
  open: "🔥",
  closed: "⏰",
  racing: "🏃",
  ended: "✅",
  cancelled: "✗",
};

// i18n key suffix; combined with `status.${suffix}` in client.
export const STATUS_I18N_KEY: Record<EditionStatus, string> = {
  upcoming: "status.upcoming",
  open: "status.open",
  closed: "status.closed",
  racing: "status.racing",
  ended: "status.ended",
  cancelled: "status.cancelled",
};

// Map legacy Chinese-string statuses to the new enum. Non-recognized values
// fall back to null so callers can still derive from dates.
export function mapLegacyStatus(legacy: string | null | undefined): EditionStatus | null {
  if (!legacy) return null;
  const v = legacy.trim();
  switch (v) {
    case "报名中":
      return "open";
    case "已截止":
    case "已报满":
      return "closed";
    case "即将开始":
      return "upcoming";
    case "未开放":
    case "待公布":
    case "待更新":
      return "upcoming";
    case "已完赛":
    case "已结束":
      return "ended";
    case "已取消":
      return "cancelled";
    default:
      return null;
  }
}

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

// Date-driven status calculator. Day-precision: race day == "racing" all day in
// the local timezone. registrationCloseDate is treated as inclusive end-of-day
// (registration is open through 23:59:59 local on the close date).
export function computeEditionStatus(input: ComputeStatusInput): EditionStatus {
  if (input.cancelled) return "cancelled";

  const now = input.now ?? new Date();
  const today = toLocalDay(now)!;
  const race = toLocalDay(input.raceDate);
  const regStartDay = toLocalDay(input.registrationStart);
  const regEndDay = toLocalDay(input.registrationEnd);

  if (race) {
    if (race.getTime() < today.getTime()) return "ended";
    if (race.getTime() === today.getTime()) return "racing";
  }

  // closed = today is strictly after the close date (close date itself still open)
  if (regEndDay && today.getTime() > regEndDay.getTime()) return "closed";
  if (regStartDay && today.getTime() >= regStartDay.getTime()) {
    if (!regEndDay || today.getTime() <= regEndDay.getTime()) return "open";
  }

  return "upcoming";
}

// Resolve the "best" status: prefer explicit stored value, else derive from
// dates, else legacy string mapping, else upcoming as ultimate fallback.
export function resolveEditionStatus(params: {
  status?: string | null;
  legacyStatus?: string | null;
  raceDate?: string | Date | null;
  registrationStart?: string | Date | null;
  registrationEnd?: string | Date | null;
  cancelled?: boolean;
  now?: Date;
}): EditionStatus {
  // 1. Explicit new-enum value wins.
  if (isEditionStatus(params.status)) return params.status;

  const legacy = mapLegacyStatus(params.legacyStatus);
  const computed = computeEditionStatus({
    raceDate: params.raceDate,
    registrationStart: params.registrationStart,
    registrationEnd: params.registrationEnd,
    cancelled: params.cancelled ?? false,
    now: params.now,
  });

  // 2. Race-date-derived terminal states (ended/racing) always trump legacy hints.
  if (computed === "ended" || computed === "racing") return computed;

  // 3. Legacy "ended"/"cancelled" are trusted when no race-date overrides them.
  if (legacy === "ended" || legacy === "cancelled") return legacy;

  // 4. Otherwise prefer legacy open/closed/upcoming over the date-only fallback,
  //    since legacy reflects a human-curated signal that may be more accurate
  //    than what we can derive from incomplete date fields.
  if (legacy === "open" || legacy === "closed" || legacy === "upcoming") {
    return legacy;
  }

  return computed;
}
