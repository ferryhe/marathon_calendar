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

function shouldOverrideField(params: {
  existingValue: string | null;
  existingSource: FieldSourceInfo | null;
  incomingValue: string;
  incomingRank: number;
}) {
  if (!params.existingValue) return { apply: true, reason: "empty" as const };
  if (params.existingValue === params.incomingValue) {
    return { apply: false, reason: "same" as const };
  }
  const existingRank = params.existingSource?.rank ?? 0;
  if (params.incomingRank > existingRank) {
    return { apply: true, reason: "higher_priority" as const };
  }
  return { apply: false, reason: "lower_priority" as const };
}

export async function upsertEditionWithMerge(params: {
  database: any;
  marathonId: string;
  year: number;
  incoming: EditionIncomingFields;
  source: MergeSource;
}) : Promise<MergeResult> {
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
    })
    .from(marathonEditions)
    .where(
      and(eq(marathonEditions.marathonId, params.marathonId), eq(marathonEditions.year, params.year)),
    )
    .limit(1);

  if (existing.length === 0) {
    const fieldSources: Record<string, FieldSourceInfo> = {};
    if (params.incoming.raceDate) {
      fieldSources.raceDate = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.raceDate,
        at: now,
      });
    }
    if (params.incoming.registrationStatus) {
      fieldSources.registrationStatus = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.registrationStatus,
        at: now,
      });
    }
    if (params.incoming.registrationUrl) {
      fieldSources.registrationUrl = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.registrationUrl,
        at: now,
      });
    }

    await params.database.insert(marathonEditions).values({
      marathonId: params.marathonId,
      year: params.year,
      raceDate: params.incoming.raceDate ?? null,
      registrationStatus: params.incoming.registrationStatus ?? null,
      registrationUrl: params.incoming.registrationUrl ?? null,
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

  if (params.incoming.raceDate) {
    const existingValue = row.raceDate ? String(row.raceDate) : null;
    const decision = shouldOverrideField({
      existingValue,
      existingSource: fieldSources.raceDate ?? null,
      incomingValue: params.incoming.raceDate,
      incomingRank,
    });
    if (decision.apply) {
      set.raceDate = params.incoming.raceDate;
      nextFieldSources.raceDate = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.raceDate,
        at: now,
      });
      applied += 1;
    } else if (decision.reason === "lower_priority" && existingValue) {
      conflicts.push({
        field: "raceDate",
        existing: { value: existingValue, source: fieldSources.raceDate ?? null },
        incoming: {
          value: params.incoming.raceDate,
          source: { sourceId: params.source.sourceId, sourceType, priority, rank: incomingRank },
        },
      });
    }
  }

  if (params.incoming.registrationStatus) {
    const existingValue = row.registrationStatus ?? null;
    const decision = shouldOverrideField({
      existingValue,
      existingSource: fieldSources.registrationStatus ?? null,
      incomingValue: params.incoming.registrationStatus,
      incomingRank,
    });
    if (decision.apply) {
      set.registrationStatus = params.incoming.registrationStatus;
      nextFieldSources.registrationStatus = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.registrationStatus,
        at: now,
      });
      applied += 1;
    } else if (decision.reason === "lower_priority" && existingValue) {
      conflicts.push({
        field: "registrationStatus",
        existing: { value: existingValue, source: fieldSources.registrationStatus ?? null },
        incoming: {
          value: params.incoming.registrationStatus,
          source: { sourceId: params.source.sourceId, sourceType, priority, rank: incomingRank },
        },
      });
    }
  }

  if (params.incoming.registrationUrl) {
    const existingValue = row.registrationUrl ?? null;
    const decision = shouldOverrideField({
      existingValue,
      existingSource: fieldSources.registrationUrl ?? null,
      incomingValue: params.incoming.registrationUrl,
      incomingRank,
    });
    if (decision.apply) {
      set.registrationUrl = params.incoming.registrationUrl;
      nextFieldSources.registrationUrl = buildFieldSourceInfo({
        sourceId: params.source.sourceId,
        sourceType,
        priority,
        value: params.incoming.registrationUrl,
        at: now,
      });
      applied += 1;
    } else if (decision.reason === "lower_priority" && existingValue) {
      conflicts.push({
        field: "registrationUrl",
        existing: { value: existingValue, source: fieldSources.registrationUrl ?? null },
        incoming: {
          value: params.incoming.registrationUrl,
          source: { sourceId: params.source.sourceId, sourceType, priority, rank: incomingRank },
        },
      });
    }
  }

  set.fieldSources = Object.keys(nextFieldSources).length > 0 ? nextFieldSources : null;

  await params.database.update(marathonEditions).set(set).where(eq(marathonEditions.id, row.id));

  return {
    action: applied > 0 ? "updated" : "unchanged",
    year: params.year,
    conflicts,
  };
}

