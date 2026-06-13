import { db } from "../server/db";
import { marathonEditions, marathons } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const now = new Date();

// 1. Chengdu 2026: lookup full id, then add reg window 2026-06-10 → 2026-06-24 + registrationUrl
const cIdR = await db.execute(sql`SELECT id FROM marathons WHERE canonical_name='chengdu-marathon' LIMIT 1`);
const chengduId = (cIdR.rows as any[])[0]?.id;
if (chengduId) {
  const chengduRow = await db.update(marathonEditions).set({
    registrationOpenDate: "2026-06-10",
    registrationCloseDate: "2026-06-24",
    registrationUrl: "http://chengdumarathon.cn",
    highlights: "2026 race scheduled for late October. Lottery window 2026-06-10 → 2026-06-24 (per nowrun.cn 2026-06-13).",
    updatedAt: now,
  }).where(and(eq(marathonEditions.marathonId, chengduId), eq(marathonEditions.year, 2026)))
  .returning({ id: marathonEditions.id, status: marathonEditions.status, open: marathonEditions.registrationOpenDate, close: marathonEditions.registrationCloseDate });
  console.log("✓ chengdu 2026:", chengduRow[0]);
} else {
  console.log("⊘ chengdu-marathon not in DB");
}

// 2. Zuicool-67868: fix race_date 2026-01-01 (registration open) → 2026-05-17 (actual race)
const zr = await db.update(marathonEditions).set({
  raceDate: "2026-05-17",
  status: "ended",  // race was 2026-05-17, today is 2026-06-13 → ended
  updatedAt: now,
}).where(and(eq(marathonEditions.marathonId, "8ad8a06d-a0c3-4afc-8343-ffe1f4ce9bc4"), eq(marathonEditions.year, 2026)))
.returning({ id: marathonEditions.id, race: marathonEditions.raceDate, status: marathonEditions.status });
// Find the actual ID first
const zId = await db.execute(sql`SELECT id FROM marathons WHERE canonical_name='zuicool-67868' LIMIT 1`);
const zuicoolId = (zId.rows as any[])[0]?.id;
if (zuicoolId) {
  const r2 = await db.update(marathonEditions).set({
    raceDate: "2026-05-17", status: "ended", updatedAt: now,
  }).where(and(eq(marathonEditions.marathonId, zuicoolId), eq(marathonEditions.year, 2026)))
  .returning({ id: marathonEditions.id, race: marathonEditions.raceDate, status: marathonEditions.status });
  console.log("✓ zuicool-67868 2026:", r2[0]);
} else {
  console.log("  ⊘ zuicool-67868 not found");
}

process.exit(0);
