import "dotenv/config";
import fs from "fs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { marathons, marathonEditions } from "@shared/schema";

function requireDb() {
  if (!db) {
    console.error(
      "DATABASE_URL not set. Configure .env or set environment variable.",
    );
    process.exit(1);
  }
  return db;
}

const DistanceOptionSchema = z.object({
  kind: z.string().min(1),
  capacity: z.number().int().nullable().optional(),
  price: z.number().nullable().optional(),
});

const OfficialDocumentsSchema = z
  .object({
    registrationNotice: z.string().nullable().optional(),
    raceRules: z.string().nullable().optional(),
    courseInfo: z.string().nullable().optional(),
    packetPickup: z.string().nullable().optional(),
    officialWebsite: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

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
  websiteUrl: z.string().url().nullable().optional(),
  certificationGrade: z.string().nullable().optional(),
  organizer: z.string().nullable().optional(),
  officialWechatAccount: z.string().nullable().optional(),
  raceKind: z.enum(["marathon", "trail"]).optional(),
});

const EditionSchema = z.object({
  year: z.number().int(),
  raceDate: z.string().nullable().optional(),
  registrationUrl: z.string().url().nullable().optional(),
  registrationOpenDate: z.string().nullable().optional(),
  registrationCloseDate: z.string().nullable().optional(),
  status: z
    .enum(["upcoming", "open", "closed", "imminent", "racing", "ended", "cancelled"])
    .nullable()
    .optional(),
  isLottery: z.boolean().optional(),
  distanceOptions: z.array(DistanceOptionSchema).nullable().optional(),
  highlights: z.string().nullable().optional(),
  startLocation: z.string().nullable().optional(),
  finishLocation: z.string().nullable().optional(),
  packetPickupLocation: z.string().nullable().optional(),
  medalImageUrls: z.array(z.string()).nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  registrationChannels: z.array(z.string()).nullable().optional(),
  officialDocuments: OfficialDocumentsSchema,
});

const RootSchema = z.object({
  marathon: MarathonSchema,
  editions: z.array(EditionSchema).default([]),
  // Optional metadata for audit trail — not stored, just printed.
  notes: z.string().optional(),
});

type Payload = z.infer<typeof RootSchema>;

function readInput(): Payload {
  const args = process.argv.slice(2);
  let raw: string;
  if (args.includes("--file")) {
    const idx = args.indexOf("--file");
    const filePath = args[idx + 1];
    if (!filePath) {
      console.error("--file requires a path");
      process.exit(2);
    }
    raw = fs.readFileSync(filePath, "utf8");
  } else if (args[0] === "-") {
    raw = fs.readFileSync(0, "utf8"); // stdin
  } else if (args[0]) {
    raw = fs.readFileSync(args[0], "utf8");
  } else {
    console.error("Usage: tsx script/upsert-wmm-marathon.ts <json-file> | - (stdin) | --file <path>");
    process.exit(2);
  }
  return RootSchema.parse(JSON.parse(raw));
}

function toIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Accept ISO yyyy-mm-dd or anything Date can parse; normalize to yyyy-mm-dd.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return d.toISOString().slice(0, 10);
}

async function upsertMarathon(payload: Payload) {
  const database = requireDb();
  const now = new Date();
  const m = payload.marathon;

  const [row] = await database
    .insert(marathons)
    .values({
      name: m.name,
      nameZh: m.nameZh ?? null,
      nameEn: m.nameEn ?? null,
      canonicalName: m.canonicalName,
      city: m.city ?? null,
      cityZh: m.cityZh ?? null,
      cityEn: m.cityEn ?? null,
      country: m.country ?? null,
      description: m.description ?? null,
      websiteUrl: m.websiteUrl ?? null,
      certificationGrade: m.certificationGrade ?? null,
      organizer: m.organizer ?? null,
      officialWechatAccount: m.officialWechatAccount ?? null,
      raceKind: m.raceKind ?? "marathon",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: marathons.canonicalName,
      set: {
        name: m.name,
        nameZh: m.nameZh ?? null,
        nameEn: m.nameEn ?? null,
        city: m.city ?? null,
        cityZh: m.cityZh ?? null,
        cityEn: m.cityEn ?? null,
        country: m.country ?? null,
        description: m.description ?? null,
        websiteUrl: m.websiteUrl ?? null,
        certificationGrade: m.certificationGrade ?? null,
        organizer: m.organizer ?? null,
        officialWechatAccount: m.officialWechatAccount ?? null,
        raceKind: m.raceKind ?? "marathon",
        updatedAt: now,
      },
    })
    .returning();

  console.log(
    `✓ Marathon upserted: id=${row.id} canonical=${row.canonicalName} name=${row.name}`,
  );

  for (const e of payload.editions) {
    const raceDate = toIsoDate(e.raceDate ?? null);
    const registrationOpenDate = toIsoDate(e.registrationOpenDate ?? null);
    const registrationCloseDate = toIsoDate(e.registrationCloseDate ?? null);

    await database
      .insert(marathonEditions)
      .values({
        marathonId: row.id,
        year: e.year,
        raceDate,
        registrationUrl: e.registrationUrl ?? null,
        registrationOpenDate,
        registrationCloseDate,
        status: e.status ?? null,
        isLottery: e.isLottery ?? false,
        distanceOptions: e.distanceOptions ?? null,
        highlights: e.highlights ?? null,
        startLocation: e.startLocation ?? null,
        finishLocation: e.finishLocation ?? null,
        packetPickupLocation: e.packetPickupLocation ?? null,
        medalImageUrls: e.medalImageUrls ?? null,
        distanceKm: e.distanceKm ?? null,
        registrationChannels: e.registrationChannels ?? null,
        officialDocuments: e.officialDocuments ?? null,
        publishStatus: "draft",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [marathonEditions.marathonId, marathonEditions.year],
        set: {
          raceDate,
          registrationUrl: e.registrationUrl ?? null,
          registrationOpenDate,
          registrationCloseDate,
          status: e.status ?? null,
          isLottery: e.isLottery ?? false,
          distanceOptions: e.distanceOptions ?? null,
          highlights: e.highlights ?? null,
          startLocation: e.startLocation ?? null,
          finishLocation: e.finishLocation ?? null,
          packetPickupLocation: e.packetPickupLocation ?? null,
          medalImageUrls: e.medalImageUrls ?? null,
          distanceKm: e.distanceKm ?? null,
          registrationChannels: e.registrationChannels ?? null,
          officialDocuments: e.officialDocuments ?? null,
          updatedAt: now,
        },
      });
    console.log(`  ✓ Edition upserted: year=${e.year} raceDate=${raceDate ?? "?"}`);
  }

  return row;
}

async function main() {
  const payload = readInput();
  if (payload.notes) console.log(`Notes: ${payload.notes}`);
  const row = await upsertMarathon(payload);
  console.log(`\n✅ Done. marathon_id=${row.id}`);
}

main().catch((err) => {
  console.error("❌ upsert failed:", err);
  process.exit(1);
});