import { db } from "../server/db";
import { marathonSources, sources } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

const now = new Date();

// 1. Add wmm-official as a new source (if not exists)
const wmmSourceId = "wmm-official";
const wmmUrl = "https://www.worldmarathonmajors.com";
const wmmRaceSites: Record<string, string> = {
  "41497d07-89fc-4f00-9b61-f11b2b67020a": "https://www.marathon.tokyo/en/",            // Tokyo
  "89a5d69f-bf27-4817-aec3-9743e61ffe72": "https://www.tcslondonmarathon.com/",        // London
  "a00b88b3-423d-44cb-b2b0-730f064df701": "https://sydneymarathon.com/",               // Sydney
  "7f9c0d0c-e093-46b0-873f-a5b397627bfd": "https://www.bmw-berlin-marathon.com/en/",   // Berlin
  "0ffe59de-a186-463b-ac68-18d2dff4d1c4": "https://www.baa.org/races/boston-marathon", // Boston
  "5092ff4b-2e2f-4865-840d-9a7a412deb9d": "https://www.nyrr.org/tcsnycmarathon",        // NYC
  "5aa50e7b-2648-4318-8860-197804ea361e": "https://www.chicagomarathon.com/",          // Chicago
  "967d0cb5-aba2-4280-ab8a-cc2c374c56a6": "https://capetownmarathon.com/",             // Cape Town
};

await db.insert(sources).values({
  id: wmmSourceId,
  name: "WMM Official (per-race sites)",
  type: "official",
  strategy: "HTML",
  baseUrl: wmmUrl,
  priority: 0,           // highest priority
  isActive: true,
  retryMax: 3,
  retryBackoffSeconds: 30,
  requestTimeoutMs: 15000,
  minIntervalSeconds: 60,
  notes: "World Marathon Majors hub + per-race official sites. Always primary source for 8 WMM marathons.",
  config: { perRaceUrls: wmmRaceSites },
}).onConflictDoNothing();
console.log(`✓ source ${wmmSourceId} ready`);

// 2. Add marathon_sources for 8 WMM (is_primary=true)
let added = 0;
for (const [marathonId, raceUrl] of Object.entries(wmmRaceSites)) {
  // Check if a primary source already exists
  const existing = await db.execute(sql`
    SELECT id, source_id, is_primary FROM marathon_sources
    WHERE marathon_id = ${marathonId} AND is_primary = true
    LIMIT 1
  `);
  if ((existing.rows as any[]).length > 0) {
    console.log(`  ⊘ ${marathonId.slice(0,8)} already has primary source`);
    continue;
  }
  // Insert primary source row
  await db.insert(marathonSources).values({
    marathonId,
    sourceId: wmmSourceId,
    sourceUrl: raceUrl,
    isPrimary: true,
    lastCheckedAt: null,
    nextCheckAt: null,
  });
  console.log(`  ✓ ${marathonId.slice(0,8)} → primary=${raceUrl.slice(0, 50)}`);
  added++;
}
console.log(`Added ${added} primary source associations`);

// 3. Verify
const verify = await db.execute(sql`
  SELECT m.name_zh, ms.source_id, ms.source_url, ms.is_primary
  FROM marathon_sources ms
  JOIN marathons m ON m.id = ms.marathon_id
  WHERE ms.is_primary = true
    AND m.id IN ('41497d07-89fc-4f00-9b61-f11b2b67020a','89a5d69f-bf27-4817-aec3-9743e61ffe72','a00b88b3-423d-44cb-b2b0-730f064df701','7f9c0d0c-e093-46b0-873f-a5b397627bfd','0ffe59de-a186-463b-ac68-18d2dff4d1c4','5092ff4b-2e2f-4865-840d-9a7a412deb9d','5aa50e7b-2648-4318-8860-197804ea361e','967d0cb5-aba2-4280-ab8a-cc2c374c56a6')
  ORDER BY m.name_zh
`);
console.log("\n=== WMM with primary source ===");
for (const r of verify.rows as any[]) {
  console.log(`  ${r.name_zh.padEnd(15)} | ${(r.source_url||'').slice(0, 50)}`);
}
process.exit(0);
