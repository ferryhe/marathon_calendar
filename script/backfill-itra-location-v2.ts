/**
 * backfill-itra-location-v2.ts
 *
 * Fetches ITRA pages, saves results to JSON, then does batch DB update.
 */
import "dotenv/config";
import { load } from "cheerio";
import { chromium, Browser } from "playwright";
import { db } from "../server/db";
import { marathonEditions, marathonSources, sources } from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { pool } from "../server/db";
import * as fs from "fs";

const ITRA_SOURCE_ID = "d61d03e5-0b61-481d-919b-7cd0313d5cd2";
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 20000;
const RESULT_FILE = "/tmp/itra-locations.json";

interface LocationResult {
  editionId: string;
  marathonId: string;
  startLocation: string | null;
  error?: string;
}

function parseLocation(html: string): string | null {
  const $ = load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  // Handles: "Azuga, Romania", "Malcesine VR, Italy", "Turokovtsi, Tran Municipality, Bulgaria"
  const match = text.match(/Event Information\s+([^,]+(?:,\s*[^,]+)*?)\s+(?=\d{1,2}\s+\w+\s+\d{4})/);
  return match ? match[1].trim() : null;
}

async function fetchPage(browser: Browser, url: string): Promise<string> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: REQUEST_TIMEOUT_MS });
    const html = await page.content();
    await ctx.close();
    return html;
  } catch {
    await ctx.close();
    return "";
  }
}

async function main() {
  console.log("=== ITRA Location Backfill v2 ===\n");

  const browser = await chromium.launch({ headless: true });

  try {
    // Get bindings with NULL start_location
    const boundRows = await db
      .select({
        editionId: marathonEditions.id,
        marathonId: marathonEditions.marathonId,
        sourceUrl: marathonSources.sourceUrl,
      })
      .from(marathonEditions)
      .innerJoin(
        marathonSources,
        and(
          eq(marathonSources.marathonId, marathonEditions.marathonId),
          eq(marathonSources.sourceId, ITRA_SOURCE_ID)
        )
      )
      .where(isNull(marathonEditions.startLocation));

    console.log(`NULL start_location: ${boundRows.length}\n`);

    // Fetch
    console.log("[Step 1] Fetching...");
    const results: LocationResult[] = [];

    for (let i = 0; i < boundRows.length; i += CONCURRENCY) {
      const batch = boundRows.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (row) => {
          const html = await fetchPage(browser, row.sourceUrl);
          const loc = html ? parseLocation(html) : null;
          return { editionId: row.editionId, marathonId: row.marathonId, startLocation: loc } as LocationResult;
        })
      );
      results.push(...batchResults);
      process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, boundRows.length)}/${boundRows.length}`);
    }

    console.log(`\n\nFetched! Valid locations: ${results.filter(r => r.startLocation).length}`);

    // Save to JSON
    fs.writeFileSync(RESULT_FILE, JSON.stringify(results, null, 2));
    console.log(`Saved to ${RESULT_FILE}\n`);

    // Batch update
    console.log("[Step 2] Batch updating DB...");
    const valid = results.filter(r => r.startLocation);
    const editionIds = valid.map(r => r.editionId);
    const locations = valid.map(r => r.startLocation);

    if (editionIds.length > 0) {
      // Batch: UPDATE with WHERE id = ANY($1)
      const timestamp = new Date().toISOString();
      const sql = `
        UPDATE marathon_editions AS e
        SET
          start_location = v.loc,
          field_sources = jsonb_set(
            COALESCE(e.field_sources, '{}'),
            '{startLocation}',
            ('{"source":"itra.run","at":"' || '${timestamp}' || '"}')::jsonb
          ),
          updated_at = NOW()
        FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS loc) AS v
        WHERE e.id = v.id
      `;
      await pool!.query(sql, [editionIds, locations]);
      console.log(`Updated ${editionIds.length} rows!\n`);
    }

    // Final stats
    const remainingNull = await db
      .select({ cnt: marathonEditions.id })
      .from(marathonEditions)
      .innerJoin(marathonSources, and(
        eq(marathonSources.marathonId, marathonEditions.marathonId),
        eq(marathonSources.sourceId, ITRA_SOURCE_ID)
      ))
      .where(isNull(marathonEditions.startLocation));
    console.log(`Remaining NULL start_location: ${remainingNull.length}/886`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
