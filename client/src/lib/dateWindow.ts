/**
 * 首页列表的「未来 12 个月滚动窗」右端日期。
 *
 * 为什么单独放一个模块：列表（MarathonTable）和「国家下拉」（Home → getMarathonCountries）
 * 必须用**同一个**边界，否则会出现「列表里有、下拉里没有」。
 * 2026-09-21 的审计指出：列表原来用 `new Date(Date.now()+365d).toISOString().slice(0,10)`
 * —— 这是 **UTC** 日期，在 UTC 以东时区（如 CST）会比「本地 today+365」早一天；
 * 而国家下拉的服务端判据用的是 `CURRENT_DATE + 365`。两处不同源 → 边界最多差 1 天。
 *
 * 这里统一按**本地日历日**算（setDate 会自动处理月长/闰年），两边传同一个字符串。
 */
export const ROLLING_WINDOW_DAYS = 365;

export function rollingWindowEndDate(days: number = ROLLING_WINDOW_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
