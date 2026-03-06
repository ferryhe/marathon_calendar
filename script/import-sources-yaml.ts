import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "yaml";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { marathons, marathonSources, sources } from "@shared/schema";

function requireDb() {
  if (!db) {
    console.error("Database not configured. Please set DATABASE_URL environment variable.");
    process.exit(1);
  }
  return db;
}

const SourceYamlSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  strategy: z.string().optional(),
  baseUrl: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  retryMax: z.number().int().optional(),
  retryBackoffSeconds: z.number().int().optional(),
  requestTimeoutMs: z.number().int().optional(),
  minIntervalSeconds: z.number().int().optional(),
  notes: z.string().nullable().optional(),
  config: z.record(z.unknown()).nullable().optional(),
});

const MarathonSourceYamlSchema = z.object({
  marathonCanonicalName: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().min(1),
  isPrimary: z.boolean().optional().default(false),
});

const RootYamlSchema = z.object({
  version: z.number().int().optional(),
  sources: z.array(SourceYamlSchema).min(1),
  marathonSources: z.array(MarathonSourceYamlSchema).optional(),
});

async function upsertSourcesFromYaml(filePath: string) {
  const database = requireDb();
  const rawText = fs.readFileSync(filePath, "utf8");
  const parsed = parse(rawText);
  const doc = RootYamlSchema.parse(parsed);

  const now = new Date();
  const sourceIdByName = new Map<string, string>();

  for (const item of doc.sources) {
    const [row] = await database
      .insert(sources)
      .values({
        name: item.name,
        type: item.type ?? "official",
        strategy: item.strategy ?? "HTML",
        baseUrl: item.baseUrl ?? null,
        priority: item.priority ?? 0,
        isActive: item.isActive ?? true,
        retryMax: item.retryMax ?? 3,
        retryBackoffSeconds: item.retryBackoffSeconds ?? 30,
        requestTimeoutMs: item.requestTimeoutMs ?? 15000,
        minIntervalSeconds: item.minIntervalSeconds ?? 0,
        notes: item.notes ?? null,
        config: item.config ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sources.name,
        set: {
          type: item.type ?? "official",
          strategy: item.strategy ?? "HTML",
          baseUrl: item.baseUrl ?? null,
          priority: item.priority ?? 0,
          isActive: item.isActive ?? true,
          retryMax: item.retryMax ?? 3,
          retryBackoffSeconds: item.retryBackoffSeconds ?? 30,
          requestTimeoutMs: item.requestTimeoutMs ?? 15000,
          minIntervalSeconds: item.minIntervalSeconds ?? 0,
          notes: item.notes ?? null,
          config: item.config ?? null,
          updatedAt: now,
        },
      })
      .returning({ id: sources.id, name: sources.name });

    sourceIdByName.set(row.name, row.id);
    console.log(`OK: upserted source: ${row.name}`);
  }

  let links = 0;
  for (const link of doc.marathonSources ?? []) {
    const sourceId = sourceIdByName.get(link.sourceName) ?? null;
    if (!sourceId) {
      console.warn(`WARN: source not found (skip link): ${link.sourceName}`);
      continue;
    }

    const marathon = await database
      .select({ id: marathons.id })
      .from(marathons)
      .where(eq(marathons.canonicalName, link.marathonCanonicalName))
      .limit(1);
    const marathonId = marathon[0]?.id ?? null;
    if (!marathonId) {
      console.warn(
        `WARN: marathon not found by canonicalName (skip link): ${link.marathonCanonicalName}`,
      );
      continue;
    }

    await database
      .insert(marathonSources)
      .values({
        marathonId,
        sourceId,
        sourceUrl: link.sourceUrl,
        isPrimary: Boolean(link.isPrimary),
        lastCheckedAt: null,
      })
      .onConflictDoUpdate({
        target: [marathonSources.marathonId, marathonSources.sourceId],
        set: {
          sourceUrl: link.sourceUrl,
          isPrimary: Boolean(link.isPrimary),
        },
      });

    links += 1;
    console.log(
      `OK: linked marathon=${link.marathonCanonicalName} source=${link.sourceName}`,
    );
  }

  console.log(`Done. sources=${doc.sources.length} marathonSources=${links}`);
}

async function main() {
  const arg = process.argv[2];
  const filePath = path.resolve(process.cwd(), arg || "config/sources.yaml");
  if (!fs.existsSync(filePath)) {
    console.error(`Config file not found: ${filePath}`);
    process.exit(1);
  }
  await upsertSourcesFromYaml(filePath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

