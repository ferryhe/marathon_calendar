/**
 * 比赛日区间渲染：官网把多日赛写成区间（如伦敦 2027 的 24–25 April），
 * 库里用 race_date=首日 + race_end_date=末日 存两个日期；这里统一渲染成便于阅读的区间。
 *
 * 中英各自输出，且同年同月只写一次年月（`2027年4月24–25日` / `Apr 24–25, 2027`）。
 * 末日缺失或与首日相同时退化为单日，行为与原有单日渲染一致。
 */
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(dateValue?: string | null): { y: number; m: number; d: number } | null {
  if (!dateValue) return null;
  const datePart = dateValue.includes("T") ? dateValue.split("T")[0] : dateValue;
  const [y, m, d] = (datePart as string).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** 单日（与原 MarathonDetail.formatDate 输出保持一致） */
export function formatOneDate(dateValue?: string | null, lang = "zh", fallback = "—"): string {
  const s = parse(dateValue);
  if (!s) return fallback;
  return lang.startsWith("en") ? `${MONTHS_EN[s.m - 1]} ${s.d}, ${s.y}` : `${s.y}年${s.m}月${s.d}日`;
}

/** 区间（末日缺失/等于首日 → 退化为单日） */
export function formatDateRange(
  startValue?: string | null,
  endValue?: string | null,
  lang = "zh",
  fallback = "—",
): string {
  const a = parse(startValue);
  const b = parse(endValue);
  if (!a) return fallback;
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return formatOneDate(startValue, lang, fallback);
  const en = lang.startsWith("en");
  if (a.y === b.y && a.m === b.m) {
    return en
      ? `${MONTHS_EN[a.m - 1]} ${a.d}–${b.d}, ${a.y}`
      : `${a.y}年${a.m}月${a.d}–${b.d}日`;
  }
  if (a.y === b.y) {
    return en
      ? `${MONTHS_EN[a.m - 1]} ${a.d} – ${MONTHS_EN[b.m - 1]} ${b.d}, ${a.y}`
      : `${a.y}年${a.m}月${a.d}日–${b.m}月${b.d}日`;
  }
  return en
    ? `${MONTHS_EN[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS_EN[b.m - 1]} ${b.d}, ${b.y}`
    : `${a.y}年${a.m}月${a.d}日–${b.y}年${b.m}月${b.d}日`;
}
