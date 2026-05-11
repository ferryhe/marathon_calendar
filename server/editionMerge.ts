import { and, eq } from "drizzle-orm";
import { marathonEditions } from "@shared/schema";

export type FieldSourceInfo = {
  sourceId: string;
  sourceType: string;
  priority: number;
  rank: number;
  at: string;
  value: string | null;
};

export type EditionIncomingFields = {
  raceDate?: string | null;
  registrationStatus?: string | null;
  registrationUrl?: string | null;
  // Admin-controlled overwrite fields (no per-field priority merge).
  status?: string | null;
  isLottery?: boolean;
  // Rich fields — merge by priority (higher rank wins, empty does not override non-empty).
  highlights?: string | null;
  distanceOptions?: unknown[] | null;
  startLocation?: string | null;
  finishLocation?: string | null;
  registrationOpenDate?: string | null;
  registrationCloseDate?: string | null;
};

export type MergeSource = {
  sourceId: string;
  sourceType: string;
  priority: number;
};

export type MergeConflict = {
  field: keyof Required<EditionIncomingFields>;
  existing: { value: string; source: FieldSourceInfo | null };
  incoming: { value: string; source: { sourceId: string; sourceType: string; priority: number; rank: number } };
};

export type MergeResult = {
  action: "inserted" | "updated" | "unchanged";
  year: number;
  conflicts: MergeConflict[];
};

export type PublishDecision = {
  status: "draft" | "published";
  at?: Date;
};

function sourceTypeWeight(sourceType: string) {
  switch (sourceType) {
    case "manual":
      return 1000;
    case "official":
      return 300;
    case "platform":
      return 200;
    case "search":
      return 100;
    case "social":
      return 50;
    default:
      return 0;
  }
}

export function computeSourceRank(sourceType: string, priority: number) {
  const w = sourceTypeWeight(sourceType);
  // Keep priority impact smaller than the type weight so "official" always beats "platform".
  return w * 10_000 + (Number.isFinite(priority) ? priority : 0);
}

function readFieldSources(value: unknown): Record<string, FieldSourceInfo> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, FieldSourceInfo>;
}

function buildFieldSourceInfo(params: {
  sourceId: string;
  sourceType: string;
  priority: number;
  value: string | null;
  at: Date;
}): FieldSourceInfo {
  const rank = computeSourceRank(params.sourceType, params.priority);
  return {
    sourceId: params.sourceId,
    sourceType: params.sourceType,
    priority: params.priority,
    rank,
    at: params.at.toISOString(),
    value: params.value,
  };
}

/**
 * Merge strategy for string fields:
 * - null/undefined incoming = "no data", never override anything (protected)
 * - non-empty incoming = normal priority-based merge
 * - empty string incoming = treated as "no data" (same as null)
 */
function shouldOverrideStringField(params: {
  existingValue: string | null;
  existingSource: FieldSourceInfo | null;
  incomingValue: string | null;
  incomingRank: number;
}) {
  // null/empty incoming = "no data provided", never override any existing value
  if (!params.incomingValue) {
    return { apply: false, reason: "incoming_empty" as const };
  }
  if (!params.existingValue) {
    return { apply: true, reason: "existing_empty" as const };
  }
  if (params.existingValue === params.incomingValue) {
    return { apply: false, reason: "same" as const };
  }
  const existingRank = params.existingSource?.rank ?? 0;
  if (params.incomingRank > existingRank) {
    return { apply: true, reason: "higher_priority" as const };
  }
  return { apply: false, reason: "lower_priority" as const };
}

/**
 * Merge strategy for array fields (distanceOptions):
 * - null/undefined incoming = no data provided, never override
 * - empty array [] = "no data" signal, only overrides null/empty in DB
 * - non-empty array = real data, overrides [] or lower-priority non-empty
 */
function shouldOverrideArrayField(params: {
  existingValue: unknown[] | null;
  existingSource: FieldSourceInfo | null;
  incomingValue: unknown[];
  incomingRank: number;
}) {
  const incomingEmpty = !params.incomingValue || params.incomingValue.length === 0;
  const existingEmpty = !params.existingValue || params.existingValue.length === 0;

  // Incoming is empty → never override (no data to contribute)
  if (incomingEmpty) return { apply: false, reason: "incoming_empty" as const };

  // Existing is empty → incoming non-empty always wins
  if (existingEmpty) return { apply: true, reason: "existing_empty" as const };

  // Both non-empty → higher rank wins
  const existingRank = params.existingSource?.rank ?? 0;
  if (params.incomingRank > existingRank) {
    return { apply: true, reason: "higher_priority" as const };
  }
  return { apply: false, reason: "lower_priority" as const };
}

type RichFieldName = "highlights" | "startLocation" | "registrationOpenDate" | "registrationCloseDate";

const STRING_RICH_FIELDS: RichFieldName[] = [
  "highlights",
  "startLocation",
  "registrationOpenDate",
  "registrationCloseDate",
];

export async function upsertEditionWithMerge(params: {
  database: any;
  marathonId: string;
  year: number;
  incoming: EditionIncomingFields;
  source: MergeSource;
  publish?: PublishDecision;
}): Promise<MergeResult> {
  const now = new Date();
  const sourceType = params.source.sourceType ?? "unknown";
  const priority = params.source.priority ?? 0;
  const incomingRank = computeSourceRank(sourceType, priority);

  const existing = await params.database
    .select({
      id: marathonEditions.id,
      raceDate: marathonEditions.raceDate,
      registrationStatus: marathonEditions.registrationStatus,
      registrationUrl: marathonEditions.registrationUrl,
      fieldSources: marathonEditions.fieldSources,
      // Rich fields
      highlights: marathonEditions.highlights,
      distanceOptions: marathonEditions.distanceOptions,
      startLocation: marathonEditions.startLocation,
      finishLocation: marathonEditions.finishLocation,
      registrationOpenDate: marathonEditions.registrationOpenDate,
      registrationCloseDate: marathonEditions.registrationCloseDate,
    })
    .from(marathonEditions)
    .where(
      and(eq(marathonEditions.marathonId, params.marathonId), eq(marathonEditions.year, params.year)),
    )
    .limit(1);

  if (existing.length === 0) {
    const fieldSources: Record<string, FieldSourceInfo> = {};
    const addFieldSource = (field: string, value: string | null) => {
      if (value) {
        fieldSources[field] = buildFieldSourceInfo({
          sourceId: params.source.sourceId,
          sourceType,
          priority,
          value,
          at: now,
        });
      }
    };
    addFieldSource("raceDate", params.incoming.raceDate ?? null);
    addFieldSource("registrationStatus", params.incoming.registrationStatus ?? null);
    addFieldSource("registrationUrl", params.incoming.registrationUrl ?? null);
    addFieldSource("highlights", params.incoming.highlights ?? null);
    addFieldSource("startLocation", params.incoming.startLocation ?? null);
    addFieldSource("registrationOpenDate", params.incoming.registrationOpenDate ?? null);
    addFieldSource("registrationCloseDate", params.incoming.registrationCloseDate ?? null);

    await params.database.insert(marathonEditions).values({
      marathonId: params.marathonId,
      year: params.year,
      raceDate: params.incoming.raceDate ?? null,
      registrationStatus: params.incoming.registrationStatus ?? null,
      registrationUrl: params.incoming.registrationUrl ?? null,
      highlights: params.incoming.highlights ?? null,
      distanceOptions: params.incoming.distanceOptions ?? null,
      startLocation: params.incoming.startLocation ?? null,
      registrationOpenDate: params.incoming.registrationOpenDate ?? null,
      registrationCloseDate: params.incoming.registrationCloseDate ?? null,
      status: params.incoming.status ?? null,
      ...(params.incoming.isLottery !== undefined ? { isLottery: params.incoming.isLottery } : {}),
      publishStatus: params.publish?.status ?? "draft",
      publishedAt:
        (params.publish?.status ?? "draft") === "published"
          ? (params.publish?.at ?? now)
          : null,
      fieldSources: Object.keys(fieldSources).length > 0 ? fieldSources : null,
      lastSyncedAt: now,
      updatedAt: now,
    });

    return { action: "inserted", year: params.year, conflicts: [] };
  }

  const row = existing[0]!;
  const fieldSources = readFieldSources(row.fieldSources);
  const nextFieldSources: Record<string, FieldSourceInfo> = { ...fieldSources };
  const conflicts: MergeConflict[] = [];

  const set: Record<string, any> = {
    lastSyncedAt: now,
    updatedAt: now,
  };

  let applied = 0;

  // ── Core string fields ────────────────────────────────────────────────────
  const stringFieldPairs: Array<{ key: string; value: string | null; existing: string | null }> = [
    { key: "raceDate", value: params.incoming.raceDate ?? null, existing: row.raceDate ? String(row.raceDate) : null },
    { key: "registrationStatus", value: params.incoming.registrationStatus ?? null, existing: row.registrationStatus },
    { key: "registrationUrl", value: params.incoming.registrationUrl ?? null, existing: row.registrationUrl },
    { key: "highlights", value: params.incoming.highlights ?? null, existing: row.highlights },
    { key: "startLocation", value: params.incoming.startLocation ?? null, existing: row.startLocation },
    { key: "finishLocation", value: params.incoming.finishLocation ?? null, existing: row.finishLocation },
    { key: "registrationOpenDate", value: params.incoming.registrationOpenDate ?? null, existing: row.registrationOpenDate },
    { key: "registrationCloseDate", value: params.incoming.registrationCloseDate ?? null, existing: row.registrationCloseDate },
  ];

  for (const { key, value, existing } of stringFieldPairs) {
    if (value) {
      const fs = fieldSources[key as keyof typeof fieldSources] ?? null;
      const decision = shouldOverrideStringField({
        existingValue: existing,
        existingSource: fs,
        incomingValue: value,
        incomingRank,
      });
      if (decision.apply) {
        set[key] = value;
        nextFieldSources[key] = buildFieldSourceInfo({
          sourceId: params.source.sourceId,
          sourceType,
          priority,
          value,
          at: now,
        });
        applied += 1;
      } else if (decision.reason === "lower_priority" && existing) {
        conflicts.push({
          field: key as keyof Required<EditionIncomingFields>,
          existing: { value: existing, source: fs },
          incoming: { value, source: { sourceId: params.source.sourceId, sourceType, priority, rank: incomingRank } },
        });
      }
    }
  }

  // ── distanceOptions (array) ────────────────────────────────────────────────
  if (params.incoming.distanceOptions !== undefined) {
    const fs = fieldSources.distanceOptions ?? null;
    const decision = shouldOverrideArrayField({
      existingValue: row.distanceOptions,
      existingSource: fs,
      incomingValue: params.incoming.distanceOptions ?? [],
      incomingRank,
    });
    if (decision.apply) {
      set.distanceOptions = params.incoming.distanceOptions;
      nextFieldSources.distanceOptions = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.distanceOptions ? JSON.stringify(params.incoming.distanceOptions) : null,
        at: now,
      });
      applied += 1;
    }
  }

  // ── Admin-controlled fields ────────────────────────────────────────────────
  if (params.incoming.status !== undefined) {
    set.status = params.incoming.status;
    applied += 1;
  }
  if (params.incoming.isLottery !== undefined) {
    set.isLottery = params.incoming.isLottery;
    applied += 1;
  }

  set.fieldSources = Object.keys(nextFieldSources).length > 0 ? nextFieldSources : null;

  if (params.publish) {
    if (params.publish.status === "published") {
      set.publishStatus = "published";
      set.publishedAt = params.publish.at ?? now;
    } else {
      set.publishStatus = "draft";
      set.publishedAt = null;
    }
  }

  await params.database.update(marathonEditions).set(set).where(eq(marathonEditions.id, row.id));

  return {
    action: applied > 0 ? "updated" : "unchanged",
    year: params.year,
    conflicts,
  };
}
