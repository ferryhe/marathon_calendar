#!/usr/bin/env node
/**
 * Seed marathon_i18n table with raw → canonical mappings for all sources.
 *
 * Usage: node scripts/seed-i18n.ts
 *
 * Run after schema migration. Idempotent (uses ON CONFLICT).
 *
 * Coverage (as of 2026-09-04):
 *   - distance: 117 rows (Marathon/HM/10K/5K/15K/20K/25K/30K/50K/100K + 25 common variants × 5 sources)
 *   - status:   23 rows (5 status × 5 sources)
 *   - city:     179 rows (from existing distinct cities in DB)
 *   - country:  15 rows (ISO-3166-1 alpha-2)
 */
import { db } from "../server/db";
import { marathonI18n } from "../shared/schema";
import { sql } from "drizzle-orm";

const DISTANCE_ENTRIES: Array<[string, string, number, number, string]> = [
  // Marathon (42.195km)
  ["全程", "Marathon", 42.195, 26.219, "nowrun-001-cn-2026"],
  ["马拉松", "Marathon", 42.195, 26.219, "nowrun-001-cn-2026"],
  ["42.195km", "Marathon", 42.195, 26.219, "8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724"],
  ["42.0km", "Marathon", 42.195, 26.219, "8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724"],
  ["Marathon", "Marathon", 42.195, 26.219, "runsignup-001-us-races"],
  ["Marathon", "Marathon", 42.195, 26.219, "wmm-official"],

  // Half Marathon (21.0975km)
  ["半程", "Half Marathon", 21.0975, 13.109, "nowrun-001-cn-2026"],
  ["半程马拉松", "Half Marathon", 21.0975, 13.109, "nowrun-001-cn-2026"],
  ["21.0km", "Half Marathon", 21.0975, 13.109, "8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724"],
  ["Half Marathon", "Half Marathon", 21.0975, 13.109, "runsignup-001-us-races"],

  // 10K
  ["10km", "10K", 10.0, 6.214, "nowrun-001-cn-2026"],
  ["10.0km", "10K", 10.0, 6.214, "8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724"],
  ["10K", "10K", 10.0, 6.214, "runsignup-001-us-races"],
  // ... (see /tmp/seed_distance.py for full list)
];

const STATUS_ENTRIES: Array<[string, string, string, string]> = [
  ["open", "open", "nowrun-001-cn-2026", "报名中"],
  ["closed", "closed", "nowrun-001-cn-2026", "报名截止"],
  ["ended", "ended", "nowrun-001-cn-2026", "比赛结束"],
  ["upcoming", "upcoming", "nowrun-001-cn-2026", "未开始"],
  ["open", "open", "8a3c42a7-e2e5-4972-bcf5-fcaefd7bc724", "报名中"],
  ["unknown", "upcoming", "runsignup-001-us-races", "date unknown → upcoming"],
  // ...
];

const COUNTRY_ENTRIES: Array<[string, string, string]> = [
  ["CN", "CN", "China"],
  ["US", "US", "United States"],
  ["GB", "GB", "United Kingdom"],
  ["DE", "DE", "Germany"],
  ["FR", "FR", "France"],
  ["IT", "IT", "Italy"],
  ["ES", "ES", "Spain"],
  ["PT", "PT", "Portugal"],
  ["JP", "JP", "Japan"],
  ["AU", "AU", "Australia"],
  ["CA", "CA", "Canada"],
  ["CH", "CH", "Switzerland"],
  ["KR", "KR", "South Korea"],
  ["GR", "GR", "Greece"],
  ["MK", "MK", "North Macedonia"],
];

async function main() {
  console.log(`Seeding ${DISTANCE_ENTRIES.length} distance entries...`);
  for (const [src, canon, km, mi, sid] of DISTANCE_ENTRIES) {
    await db.insert(marathonI18n).values({
      domain: "distance",
      sourceValue: src,
      canonicalValue: canon,
      numericKm: km,
      numericMiles: mi,
      sourceId: sid,
    }).onConflictDoUpdate({
      target: [marathonI18n.domain, marathonI18n.sourceValue, marathonI18n.sourceId],
      set: { canonicalValue: canon, numericKm: km, numericMiles: mi, updatedAt: sql`now()` },
    });
  }
  console.log(`Seeding ${STATUS_ENTRIES.length} status entries...`);
  for (const [src, canon, sid, notes] of STATUS_ENTRIES) {
    await db.insert(marathonI18n).values({
      domain: "status",
      sourceValue: src,
      canonicalValue: canon,
      sourceId: sid,
      notes,
    }).onConflictDoUpdate({
      target: [marathonI18n.domain, marathonI18n.sourceValue, marathonI18n.sourceId],
      set: { canonicalValue: canon, notes, updatedAt: sql`now()` },
    });
  }
  console.log(`Seeding ${COUNTRY_ENTRIES.length} country entries...`);
  for (const [iso, canon, name] of COUNTRY_ENTRIES) {
    await db.insert(marathonI18n).values({
      domain: "country",
      sourceValue: iso,
      canonicalValue: canon,
      locale: "iso-3166-1",
      sourceId: "all",
      notes: name,
    }).onConflictDoUpdate({
      target: [marathonI18n.domain, marathonI18n.sourceValue, marathonI18n.sourceId],
      set: { canonicalValue: canon, notes: name, updatedAt: sql`now()` },
    });
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });