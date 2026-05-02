import { useTranslation } from "react-i18next";

export type LocalizedMarathonNames = {
  name?: string | null;
  nameZh?: string | null;
  nameEn?: string | null;
};

export type LocalizedMarathonCity = {
  city?: string | null;
  cityZh?: string | null;
  cityEn?: string | null;
};

export type AppLocale = "zh" | "en";

export function normalizeLocale(lang: string | undefined | null): AppLocale {
  return lang && lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

// Silent fallback: prefer current locale, then the other locale, then legacy `name`/`city`.
export function pickLocalizedName(m: LocalizedMarathonNames, locale: AppLocale): string {
  if (locale === "en") {
    return m.nameEn ?? m.nameZh ?? m.name ?? "";
  }
  return m.nameZh ?? m.nameEn ?? m.name ?? "";
}

export function pickLocalizedCity(m: LocalizedMarathonCity, locale: AppLocale): string | null {
  if (locale === "en") {
    return m.cityEn ?? m.cityZh ?? m.city ?? null;
  }
  return m.cityZh ?? m.cityEn ?? m.city ?? null;
}

export function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return normalizeLocale(i18n.language);
}

export function useLocalizedName(m: LocalizedMarathonNames): string {
  return pickLocalizedName(m, useLocale());
}

export function useLocalizedCity(m: LocalizedMarathonCity): string | null {
  return pickLocalizedCity(m, useLocale());
}
