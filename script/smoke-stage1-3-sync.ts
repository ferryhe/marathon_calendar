import "dotenv/config";
import { createServer } from "http";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { syncMarathonSourceOnce } from "../server/syncScheduler";
import {
  marathons,
  marathonEditions,
  marathonSources,
  marathonSyncRuns,
  rawCrawlData,
  sources,
} from "../shared/schema";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  invariant(db, "DATABASE_URL is not set; cannot run smoke test");

  const startedAt = Date.now();
  const idSuffix = String(startedAt);
  const canonicalName = `smoke-sync-${idSuffix}`;
  const sourceName = `Smoke Source ${idSuffix}`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Smoke Marathon",
        "startDate": "2026-03-15",
        "url": "https://example.invalid/smoke"
      }
    </script>
  </head>
  <body>ok</body>
</html>`;

  const htmlNoDate = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body>no date</body>
</html>`;

  const server = createServer((req, res) => {
    if (req.url === "/event") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    if (req.url === "/nodate") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(htmlNoDate);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  invariant(address && typeof address === "object", "Failed to get server address");
  const url = `http://127.0.0.1:${address.port}`;
  const urlEvent = `${url}/event`;
  const urlNoDate = `${url}/nodate`;

  let marathonId: string | null = null;
  let marathonId2: string | null = null;
  let sourceId: string | null = null;
  let marathonSourceId: string | null = null;
  let marathonSourceId2: string | null = null;

  try {
    const [marathon] = await db
      .insert(marathons)
      .values({
        name: "Smoke Marathon",
        canonicalName,
        city: "Smoke City",
        country: "China",
        description: "smoke",
        websiteUrl: null,
        updatedAt: new Date(),
      })
      .returning();
    marathonId = marathon.id;

    const [marathon2] = await db
      .insert(marathons)
      .values({
        name: "Smoke Marathon (no date)",
        canonicalName: `smoke-sync-nodate-${idSuffix}`,
        city: "Smoke City",
        country: "China",
        description: "smoke",
        websiteUrl: null,
        updatedAt: new Date(),
      })
      .returning();
    marathonId2 = marathon2.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: sourceName,
        type: "official",
        strategy: "HTML",
        baseUrl: null,
        priority: 1,
        isActive: false,
        retryMax: 1,
        retryBackoffSeconds: 1,
        requestTimeoutMs: 3000,
        minIntervalSeconds: 0,
        notes: "smoke",
        updatedAt: new Date(),
      })
      .returning();
    sourceId = source.id;

    const [ms] = await db
      .insert(marathonSources)
      .values({
        marathonId,
        sourceId,
        sourceUrl: urlEvent,
        isPrimary: true,
        lastCheckedAt: null,
      })
      .returning();
    marathonSourceId = ms.id;

    const [ms2] = await db
      .insert(marathonSources)
      .values({
        marathonId: marathonId2,
        sourceId,
        sourceUrl: urlNoDate,
        isPrimary: true,
        lastCheckedAt: null,
      })
      .returning();
    marathonSourceId2 = ms2.id;

    const result = await syncMarathonSourceOnce({
      source,
      marathonId,
      marathonSourceId,
      sourceUrl: urlEvent,
      lastHash: null,
    });
    invariant(result.status === "success", `sync failed: ${JSON.stringify(result)}`);

    const result2 = await syncMarathonSourceOnce({
      source,
      marathonId: marathonId2,
      marathonSourceId: marathonSourceId2,
      sourceUrl: urlNoDate,
      lastHash: null,
    });
    invariant(result2.status === "success", `sync failed: ${JSON.stringify(result2)}`);

    const editions = await db
      .select()
      .from(marathonEditions)
      .where(and(eq(marathonEditions.marathonId, marathonId), eq(marathonEditions.year, 2026)));
    invariant(editions.length === 1, "expected 1 edition upserted");
    invariant(editions[0].raceDate === "2026-03-15", "raceDate mismatch");

    const raw = await db
      .select({ id: rawCrawlData.id, status: rawCrawlData.status, processedAt: rawCrawlData.processedAt })
      .from(rawCrawlData)
      .where(eq(rawCrawlData.marathonId, marathonId));
    invariant(raw.length >= 1, "expected raw_crawl_data inserted");
    invariant(raw[0].status === "processed", "expected raw status processed");
    invariant(Boolean(raw[0].processedAt), "expected raw processedAt set");

    const raw2 = await db
      .select({ id: rawCrawlData.id, status: rawCrawlData.status })
      .from(rawCrawlData)
      .where(eq(rawCrawlData.marathonId, marathonId2));
    invariant(raw2.length >= 1, "expected raw_crawl_data inserted for nodate");
    invariant(raw2[0].status === "needs_review", "expected raw status needs_review for nodate");

    console.log("OK: Stage 1.3 sync smoke passed");
  } finally {
    server.close();

    // Best-effort cleanup (order matters due to FKs).
    if (marathonId) {
      await db.delete(rawCrawlData).where(eq(rawCrawlData.marathonId, marathonId));
      await db.delete(marathonSyncRuns).where(eq(marathonSyncRuns.marathonId, marathonId));
      await db.delete(marathonSources).where(eq(marathonSources.marathonId, marathonId));
      await db.delete(marathonEditions).where(eq(marathonEditions.marathonId, marathonId));
      await db.delete(marathons).where(eq(marathons.id, marathonId));
    }
    if (marathonId2) {
      await db.delete(rawCrawlData).where(eq(rawCrawlData.marathonId, marathonId2));
      await db.delete(marathonSyncRuns).where(eq(marathonSyncRuns.marathonId, marathonId2));
      await db.delete(marathonSources).where(eq(marathonSources.marathonId, marathonId2));
      await db.delete(marathonEditions).where(eq(marathonEditions.marathonId, marathonId2));
      await db.delete(marathons).where(eq(marathons.id, marathonId2));
    }
    if (sourceId) {
      await db.delete(sources).where(eq(sources.id, sourceId));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
