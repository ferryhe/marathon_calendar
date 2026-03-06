/**
 * Shared utility functions for marathon application
 */

/**
 * Known aliases for China in various formats
 */
export const CHINA_COUNTRY_ALIASES = [
  "china",
  "cn",
  "chn",
  "中国",
  "中国大陆",
  "中华人民共和国",
  "mainland china",
  "people's republic of china",
  "prc",
] as const;

/**
 * Normalize country text for comparison
 */
export function normalizeCountryText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .replace(/['']/g, "'");
}

/**
 * Check if a country value represents China
 */
export function isChinaCountry(value?: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeCountryText(value);
  if (!normalized) return false;
  return CHINA_COUNTRY_ALIASES.some((alias) => normalizeCountryText(alias) === normalized);
}

/**
 * Return canonical country value ("China" for all China aliases, original value for others)
 */
export function canonicalCountryValue(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isChinaCountry(trimmed) ? "China" : trimmed;
}
