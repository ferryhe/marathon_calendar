import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { db } from "../server/db";
import { syncMarathonSourceOnce } from "../server/syncScheduler";
import { marathonEditions, marathonSources, marathons, sources } from "../shared/schema";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const canonicalNames = [
  "tokyo-marathon-2026",
  "paris-marathon-2026",
  "boston-marathon-2026",
  "berlin-marathon-2026",
  "chicago-marathon-2026",
] as const;

async function main() {
  invariant(db, "DATABASE_URL is not set");

  const [official] = await db
    .select()
    .from(sources)
    .where(eq(sources.name, "赛事官方网站（直采）"));
  invariant(official, "Missing source: 赛事官方网站（直采） (run npm run db:seed)");

  console.log(`Using source: ${official.name} (${official.id})`);

  for (const canonicalName of canonicalNames) {
    const [marathon] = await db
      .select()
      .from(marathons)
      .where(eq(marathons.canonicalName, canonicalName));
    invariant(marathon, `Missing marathon: ${canonicalName} (run npm run db:seed)`);

    const [link] = await db
      .select()
      .from(marathonSources)
      .where(eq(marathonSources.marathonId, marathon.id))
      .where(eq(marathonSources.sourceId, official.id));
    invariant(link, `Missing marathon_sources link for ${canonicalName}`);

    const result = await syncMarathonSourceOnce({
      source: official,
      marathonId: marathon.id,
      marathonSourceId: link.id,
      sourceUrl: link.sourceUrl,
      lastHash: link.lastHash ?? null,
    });

    const editions = await db
      .select({
        year: marathonEditions.year,
        raceDate: marathonEditions.raceDate,
        registrationStatus: marathonEditions.registrationStatus,
        registrationUrl: marathonEditions.registrationUrl,
        lastSyncedAt: marathonEditions.lastSyncedAt,
      })
      .from(marathonEditions)
      .where(eq(marathonEditions.marathonId, marathon.id))
      .orderBy(desc(marathonEditions.year))
      .limit(3);

    const raceDates = editions.map((e) => e.raceDate).filter(Boolean);
    invariant(
      raceDates.length > 0,
      `No raceDate extracted for ${canonicalName} from ${link.sourceUrl}`,
    );

    console.log(
      `${canonicalName}: ${result.status} -> latest editions: ${editions
        .map((e) => `${e.year}:${e.raceDate ?? "null"}`)
        .join(", ")}`,
    );
  }

  console.log("OK: core official crawl verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

