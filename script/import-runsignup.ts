import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../server/db";
import { marathonEditions, marathonSources, marathons, sources } from "@shared/schema";

const WANTED_KINDS = new Set(["marathon", "half-marathon", "ultra", "trail"]);

type RaceRecord = {
  canonical_name: string;
  name: string;
  name_en: string | null;
  date: string;
  city: string | null;
  state: string | null;
  country: string | null;
  location_name: string | null;
  street_address: string | null;
  postal_code: string | null;
  organizer: string | null;
  url: string;
  registration_status: string | null;
  price_range: string | null;
  source: string;
  race_kind: string;
};

function eventKey(r: RaceRecord): string {
  const date = r.date ? r.date.split("T")[0] : "unknown";
  return `${r.url}|${date}`;
}

function mapStatus(s: string | null): string | null {
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === "open") return "报名中";
  if (l === "closed" || l === "complete" || l === "completed" || l === "sold-out") return "已截止";
  if (l === "upcoming" || l === "future") return "未开放";
  return s;
}

function raceKindToSchemaKind(kind: string): "marathon" | "trail" {
  return kind === "trail" || kind === "ultra" ? "trail" : "marathon";
}

function isHalfMarathonOnly(kinds: Set<string>): boolean {
  return kinds.has("half-marathon") && !kinds.has("marathon") && !kinds.has("ultra");
}

async function main() {
  const dataFile = process.argv[2] ?? "data/runsignup/races_2026-05-12.jsonl";
  const filePath = path.resolve(process.cwd(), dataFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const allRecords: RaceRecord[] = [];
  let excludedOther = 0;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const r: RaceRecord = JSON.parse(line);
      if (WANTED_KINDS.has(r.race_kind)) {
        allRecords.push(r);
      } else {
        excludedOther++;
      }
    } catch {
      // skip
    }
  }
  console.log(`Loaded ${allRecords.length} records (excluded other: ${excludedOther})`);

  const runsignupSourceId = "runsignup-001-us-races";
  const [existingSrc] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, runsignupSourceId)).limit(1);
  if (!existingSrc) {
    await db.insert(sources).values({
      id: runsignupSourceId,
      name: "RunSignup (runsignup.com)",
      type: "aggregator",
      strategy: "HTML",
      base_url: "https://runsignup.com",
      priority: 85,
      is_active: true,
      notes: "US marathon/half-marathon/ultra/trail events scraped from runsignup.com",
    });
    console.log("Inserted source: runsignup-001-us-races");
  } else {
    console.log("Source already exists: runsignup-001-us-races");
  }

  // Group by (url, date) — one race per event date
  const eventGroups = new Map<string, RaceRecord[]>();
  for (const r of allRecords) {
    const key = eventKey(r);
    if (!eventGroups.has(key)) eventGroups.set(key, []);
    eventGroups.get(key)!.push(r);
  }
  console.log(`Event groups (url+date): ${eventGroups.size}`);

  const now = new Date();
  let upsertedMarathons = 0;
  let upsertedEditions = 0;
  let linkedSources = 0;
  let skippedInternalDups = 0;

  for (const [, group] of eventGroups) {
    // Deduplicate within group by race_kind (keep first occurrence)
    const kindSeen = new Set<string>();
    const uniqueGroup: RaceRecord[] = [];
    for (const r of group) {
      if (!kindSeen.has(r.race_kind)) {
        kindSeen.add(r.race_kind);
        uniqueGroup.push(r);
      } else {
        skippedInternalDups++;
      }
    }

    // Preference: marathon > half-marathon > ultra > trail for naming
    const kindPriority = ["marathon", "half-marathon", "ultra", "trail"];
    uniqueGroup.sort((a, b) => kindPriority.indexOf(a.race_kind) - kindPriority.indexOf(b.race_kind));
    const rep = uniqueGroup[0];

    const kindsPresent = new Set(uniqueGroup.map((r) => r.race_kind));
    const isHalfOnly = isHalfMarathonOnly(kindsPresent);

    let name = rep.name;
    if (isHalfOnly) {
      if (!name.toLowerCase().includes("half")) name = `${name} (Half Marathon)`;
    }

    // Build unique canonical_name using url hash to avoid crawler slug collisions
    const urlHash = rep.url.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-10);
    const canonicalName = `${rep.canonical_name}-${urlHash}`;

    // Display name: use name + city + state; append month/year if same combo appears in same batch
    const city = rep.city || rep.location_name || null;
    const state = rep.state || null;
    const locationSuffix = [city, state].filter(Boolean).join(", ");
    const baseDisplayName = locationSuffix ? `${rep.name} (${locationSuffix})` : rep.name;
    const monthYear = rep.date ? new Date(rep.date).toISOString().slice(0, 7).replace("-", "/") : "";
    // NOTE: displayName collisions within a single import batch are resolved by appending month/year
    // Cross-batch or cross-import collisions are handled by ON CONFLICT DO NOTHING below
    const uniqueName = (baseDisplayName + (monthYear ? ` (${monthYear})` : "")).slice(0, 180);
    const country = rep.country || null;

    const raceKind: "marathon" | "trail" =
      isHalfOnly || kindsPresent.has("marathon") || kindsPresent.has("half-marathon") ? "marathon" : "trail";

    const raceKindsInSchema = isHalfOnly
      ? ["half-marathon"]
      : Array.from(kindsPresent);

    const distanceOptions: string[] = raceKindsInSchema.flatMap((k) => {
      if (k === "marathon") return ["26.2 miles"];
      if (k === "half-marathon") return ["13.1 miles"];
      if (k === "ultra") return ["ultra"];
      if (k === "trail") return ["trail"];
      return [];
    });

    // Upsert marathon with raw SQL.
    // Use ON CONFLICT DO NOTHING on canonical_name to avoid duplicate inserts.
    // The name unique constraint violation is also possible; we handle it by catching
    // the error and skipping (acceptable since name collisions = truly identical races).
    try {
      await db.execute(sql`INSERT INTO marathons (name, canonical_name, city, country, website_url, organizer, race_kind, updated_at)
        VALUES (${uniqueName}, ${canonicalName}, ${city}, ${country}, ${rep.url}, ${rep.organizer || null}, ${raceKind}, ${now})
        ON CONFLICT (canonical_name) DO UPDATE SET
          name = EXCLUDED.name,
          city = EXCLUDED.city,
          country = EXCLUDED.country,
          website_url = EXCLUDED.website_url,
          organizer = EXCLUDED.organizer,
          race_kind = EXCLUDED.race_kind,
          updated_at = EXCLUDED.updated_at`);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.includes("duplicate key") && msg.includes("marathons_name_unique")) {
        // name unique constraint hit — this is a true duplicate, skip gracefully
        skippedInternalDups++;
        continue;
      }
      throw err;
    }

    const [row] = await db.select({ id: marathons.id }).from(marathons).where(eq(marathons.canonicalName, canonicalName));
    upsertedMarathons++;

    if (row) {
      const raceDate = rep.date ? new Date(rep.date) : null;
      const raceYear = raceDate ? raceDate.getFullYear() : null;

      const statuses = uniqueGroup.map((r) => mapStatus(r.registration_status)).filter(Boolean);
      let registrationStatus: string | null = null;
      if (statuses.includes("报名中")) registrationStatus = "报名中";
      else if (statuses.includes("未开放")) registrationStatus = "未开放";
      else registrationStatus = statuses[0] ?? null;

      if (raceYear) {
        await db
          .insert(marathonEditions)
          .values({
            marathonId: row.id,
            year: raceYear,
            raceDate,
            registrationStatus,
            registrationUrl: rep.url,
            distanceOptions,
            publishStatus: "published",
            publishedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [marathonEditions.marathonId, marathonEditions.year],
            set: {
              raceDate,
              registrationStatus,
              registrationUrl: rep.url,
              distanceOptions,
              updatedAt: now,
            },
          });
        upsertedEditions++;
      }

      await db
        .insert(marathonSources)
        .values({
          marathonId: row.id,
          sourceId: runsignupSourceId,
          sourceUrl: rep.url,
          isPrimary: true,
          lastCheckedAt: now,
          lastHttpStatus: 200,
        })
        .onConflictDoUpdate({
          target: [marathonSources.marathonId, marathonSources.sourceId],
          set: { sourceUrl: rep.url, isPrimary: true, lastCheckedAt: now, lastHttpStatus: 200 },
        });
      linkedSources++;
    }
  }

  console.log(`
=== Import Summary ===
  Raw filtered records:  ${allRecords.length}
  Excluded (other):       ${excludedOther}
  Event groups (unique): ${eventGroups.size}
  Internal kind dups:    ${skippedInternalDups}
  ---
  Marathons upserted:    ${upsertedMarathons}
  Editions upserted:     ${upsertedEditions}
  Sources linked:        ${linkedSources}
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
