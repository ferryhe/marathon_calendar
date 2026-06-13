import "dotenv/config";
import fs from "fs";
import { z } from "zod";
import { db } from "../server/db";
import { marathons, marathonEditions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

function requireDb() {
  if (!db) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  return db;
}

const EditionSchema = z.object({
  year: z.number().int(),
  raceDate: z.string().nullable().optional(),
  status: z.enum(["upcoming","open","closed","imminent","racing","ended","cancelled","tba"]).nullable().optional(),
  isLottery: z.boolean().optional(),
  registrationOpenDate: z.string().nullable().optional(),
  registrationCloseDate: z.string().nullable().optional(),
  registrationUrl: z.string().url().nullable().optional(),
  registrationChannels: z.array(z.string()).nullable().optional(),
  highlights: z.string().nullable().optional(),
  publishStatus: z.string().optional(),
});

const MarathonSchema = z.object({
  name: z.string().min(1),
  nameZh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  canonicalName: z.string().min(1),
  city: z.string().nullable().optional(),
  cityZh: z.string().nullable().optional(),
  cityEn: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionZh: z.string().nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  raceKind: z.enum(["marathon","trail"]).optional(),
});

const BatchSchema = z.array(z.object({
  marathon: MarathonSchema,
  editions: z.array(EditionSchema).default([]),
  notes: z.string().optional(),
}));

function toIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function upsertOne(item: z.infer<typeof BatchSchema>[number]) {
  const database = requireDb();
  const now = new Date();
  const m = item.marathon;

  // Upsert marathon by canonicalName
  const [mRow] = await database.insert(marathons).values({
    name: m.name, nameZh: m.nameZh ?? null, nameEn: m.nameEn ?? null,
    canonicalName: m.canonicalName,
    city: m.city ?? null, cityZh: m.cityZh ?? null, cityEn: m.cityEn ?? null,
    country: m.country ?? null,
    description: m.description ?? null, descriptionZh: m.descriptionZh ?? null,
    websiteUrl: m.websiteUrl ?? null,
    raceKind: m.raceKind ?? "marathon",
    updatedAt: now,
  }).onConflictDoUpdate({
    target: marathons.canonicalName,
    set: {
      name: m.name, nameZh: m.nameZh ?? null, nameEn: m.nameEn ?? null,
      city: m.city ?? null, cityZh: m.cityZh ?? null, cityEn: m.cityEn ?? null,
      country: m.country ?? null,
      description: m.description ?? null, descriptionZh: m.descriptionZh ?? null,
      websiteUrl: m.websiteUrl ?? null,
      raceKind: m.raceKind ?? "marathon",
      updatedAt: now,
    },
  }).returning({ id: marathons.id });

  console.log(`  marathon ${m.canonicalName} → id=${mRow.id.slice(0,8)}`);

  // Upsert each edition
  for (const e of item.editions) {
    const raceDate = toIsoDate(e.raceDate ?? null);
    const open = toIsoDate(e.registrationOpenDate ?? null);
    const close = toIsoDate(e.registrationCloseDate ?? null);
    const [eRow] = await database.insert(marathonEditions).values({
      marathonId: mRow.id, year: e.year,
      raceDate, status: e.status ?? "upcoming",
      isLottery: e.isLottery ?? null,
      registrationOpenDate: open, registrationCloseDate: close,
      registrationUrl: e.registrationUrl ?? null,
      registrationChannels: e.registrationChannels ?? null,
      highlights: e.highlights ?? null,
      publishStatus: e.publishStatus ?? "published",
      publishedAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: [marathonEditions.marathonId, marathonEditions.year],
      set: {
        raceDate, status: e.status ?? "upcoming",
        isLottery: e.isLottery ?? null,
        registrationOpenDate: open, registrationCloseDate: close,
        registrationUrl: e.registrationUrl ?? null,
        registrationChannels: e.registrationChannels ?? null,
        highlights: e.highlights ?? null,
        publishStatus: e.publishStatus ?? "published",
        updatedAt: now,
      },
    }).returning({ id: marathonEditions.id, year: marathonEditions.year, status: marathonEditions.status });
    console.log(`    edition year=${eRow.year} status=${eRow.status} raceDate=${raceDate}`);
  }
}

async function main() {
  const path = process.argv[2];
  if (!path) { console.error("Usage: tsx script/upsert-batch.ts <json-file>"); process.exit(2); }
  const raw = fs.readFileSync(path, "utf8");
  const items = BatchSchema.parse(JSON.parse(raw));
  console.log(`Upserting ${items.length} marathons...`);
  for (const it of items) {
    try { await upsertOne(it); }
    catch (e) { console.error(`  ❌ ${it.marathon.canonicalName}: ${(e as Error).message}`); }
  }
  console.log("Done.");
  process.exit(0);
}

main();
