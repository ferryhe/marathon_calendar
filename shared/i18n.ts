/**
 * Cross-source normalization helpers (added 2026-09-04 by issue-to-merge Round 1).
 *
 * Single source of truth for raw value → canonical value mappings across all
 * marathon sources (zuicool / nowrun / runsignup / worldsmarathons / wmm).
 *
 * Backed by the `marathon_i18n` table. Per-source skills should call
 * normalizeDistance / normalizeStatus / normalizeCity / normalizeCountry
 * at import time instead of hard-coding source-specific lookups.
 */
import { db } from "../server/db";
import { marathonI18n } from "../shared/schema";
import { and, eq } from "drizzle-orm";

export type I18nDomain = "distance" | "status" | "city" | "country";

export interface NormalizedDistance {
  canonical: string; // 'Marathon' | 'Half Marathon' | '10K' | etc.
  km: number | null;
  miles: number | null;
}

export interface NormalizedCity {
  cityEn: string;
  districtZh: string | null;
  districtEn: string | null;
}

export async function normalizeDistance(
  rawKind: string,
  sourceId: string,
): Promise<NormalizedDistance | null> {
  const rows = await db
    .select()
    .from(marathonI18n)
    .where(
      and(
        eq(marathonI18n.domain, "distance"),
        eq(marathonI18n.sourceValue, rawKind),
        eq(marathonI18n.sourceId, sourceId),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    canonical: row.canonicalValue,
    km: row.numericKm ?? null,
    miles: row.numericMiles ?? null,
  };
}

export async function normalizeStatus(
  rawStatus: string,
  sourceId: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(marathonI18n)
    .where(
      and(
        eq(marathonI18n.domain, "status"),
        eq(marathonI18n.sourceValue, rawStatus),
        eq(marathonI18n.sourceId, sourceId),
      ),
    )
    .limit(1);
  return rows[0]?.canonicalValue ?? null;
}

export async function normalizeCity(
  rawCity: string,
): Promise<NormalizedCity | null> {
  // Case-insensitive lookup against city domain
  const rows = await db
    .select()
    .from(marathonI18n)
    .where(
      and(
        eq(marathonI18n.domain, "city"),
        eq(marathonI18n.sourceValue, rawCity),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    cityEn: row.canonicalValue,
    districtZh: row.districtZh ?? null,
    districtEn: row.districtEn ?? null,
  };
}

export async function normalizeCountry(rawCountry: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(marathonI18n)
    .where(
      and(
        eq(marathonI18n.domain, "country"),
        eq(marathonI18n.sourceValue, rawCountry),
      ),
    )
    .limit(1);
  return rows[0]?.canonicalValue ?? null;
}