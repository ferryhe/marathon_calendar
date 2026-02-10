import crypto from "crypto";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import {
  marathons,
  marathonEditions,
  marathonSources,
  marathonSyncRuns,
  rawCrawlData,
  sources,
  type Source,
} from "@shared/schema";
import { db, pool } from "./db";
import { log } from "./logger";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const RAW_CONTENT_MAX_CHARS = 2 * 1024 * 1024;
const SCHEDULER_LOCK_KEY = 0x6d_63_5f_73; // "mc_s" for stable advisory lock

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function ensureDatabase() {
  if (!db || !pool) {
    throw new Error("Database unavailable: DATABASE_URL is not configured");
  }
  return db;
}

async function tryAcquireSchedulerLock() {
  ensureDatabase();
  const result = await pool!.query("select pg_try_advisory_lock($1) as locked", [
    SCHEDULER_LOCK_KEY,
  ]);
  const locked = Boolean(result.rows?.[0]?.locked);
  if (!locked) return null;
  return async () => {
    await pool!.query("select pg_advisory_unlock($1)", [SCHEDULER_LOCK_KEY]);
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs: number },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "marathon-calendar/1.0 (+https://github.com/ferryhe/marathon_calendar)",
        ...(options.headers ?? {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function extractJsonLdEvents(html: string) {
  const events: Array<Record<string, unknown>> = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length > 0) {
        const item = stack.pop();
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const typeValue = obj["@type"];
        const types = Array.isArray(typeValue) ? typeValue : [typeValue];
        if (types.some((t) => t === "Event")) {
          events.push(obj);
        }

        for (const value of Object.values(obj)) {
          if (Array.isArray(value)) {
            for (const v of value) stack.push(v);
          } else if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }
  return events;
}

function coerceDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractEditionFromHtml(html: string) {
  const jsonLdEvents = extractJsonLdEvents(html);
  for (const event of jsonLdEvents) {
    const raceDate = coerceDateString(event.startDate);
    if (raceDate) {
      return {
        raceDate,
        registrationStatus: null as string | null,
        registrationUrl: typeof event.url === "string" ? event.url : null,
      };
    }
  }

  const dateMatch =
    html.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/) ??
    html.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (dateMatch) {
    const yyyy = dateMatch[1];
    const mm = String(dateMatch[2]).padStart(2, "0");
    const dd = String(dateMatch[3]).padStart(2, "0");
    return {
      raceDate: `${yyyy}-${mm}-${dd}`,
      registrationStatus: null as string | null,
      registrationUrl: null as string | null,
    };
  }

  return null;
}

export async function syncMarathonSourceOnce(params: {
  source: Source;
  marathonId: string;
  marathonSourceId: string;
  sourceUrl: string;
  lastHash: string | null;
}) {
  const database = ensureDatabase();
  const startedAt = new Date();

  const [run] = await database
    .insert(marathonSyncRuns)
    .values({
      marathonId: params.marathonId,
      sourceId: params.source.id,
      status: "running",
      strategyUsed: params.source.strategy,
      attempt: 1,
      startedAt,
    })
    .returning();

  const timeoutMs = params.source.requestTimeoutMs ?? 15000;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < (params.source.retryMax ?? 3)) {
    attempt += 1;
    try {
      const response = await fetchWithTimeout(params.sourceUrl, {
        timeoutMs,
        method: "GET",
        headers: { Accept: "*/*" },
      });

      const contentType = response.headers.get("content-type");
      const httpStatus = response.status;
      let raw = await response.text();
      if (raw.length > RAW_CONTENT_MAX_CHARS) {
        raw = raw.slice(0, RAW_CONTENT_MAX_CHARS);
      }

      const contentHash = sha256(raw);
      const isUnchanged = Boolean(params.lastHash && params.lastHash === contentHash);

      if (!isUnchanged) {
        await database.insert(rawCrawlData).values({
          marathonId: params.marathonId,
          sourceId: params.source.id,
          sourceUrl: params.sourceUrl,
          contentType,
          httpStatus,
          rawContent: raw,
          contentHash,
          status: "pending",
          metadata: {
            fetchedAt: startedAt.toISOString(),
          },
        });
      }

      let updatedCount = 0;
      let unchangedCount = 0;

      if (isUnchanged) {
        unchangedCount = 1;
      } else if (params.source.strategy === "HTML") {
        const extracted = extractEditionFromHtml(raw);
        if (extracted?.raceDate) {
          const year = Number(extracted.raceDate.slice(0, 4));
          await database
            .insert(marathonEditions)
            .values({
              marathonId: params.marathonId,
              year,
              raceDate: extracted.raceDate,
              registrationStatus: extracted.registrationStatus,
              registrationUrl: extracted.registrationUrl,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [marathonEditions.marathonId, marathonEditions.year],
              set: {
                raceDate: extracted.raceDate,
                registrationStatus: extracted.registrationStatus,
                registrationUrl: extracted.registrationUrl,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          updatedCount = 1;
        } else {
          unchangedCount = 1;
        }
      }

      await database
        .update(marathonSources)
        .set({
          lastCheckedAt: new Date(),
          lastHash: contentHash,
          lastHttpStatus: httpStatus,
          lastError: null,
          nextCheckAt:
            params.source.minIntervalSeconds && params.source.minIntervalSeconds > 0
              ? new Date(Date.now() + params.source.minIntervalSeconds * 1000)
              : null,
        })
        .where(eq(marathonSources.id, params.marathonSourceId));

      await database
        .update(marathonSyncRuns)
        .set({
          status: "success",
          attempt,
          updatedCount,
          unchangedCount,
          finishedAt: new Date(),
        })
        .where(eq(marathonSyncRuns.id, run.id));

      return { runId: run.id, status: "success" as const };
    } catch (error) {
      lastError = error;
      await database
        .update(marathonSyncRuns)
        .set({
          status: attempt < (params.source.retryMax ?? 3) ? "retrying" : "failed",
          attempt,
          message: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(marathonSyncRuns.id, run.id));

      if (attempt >= (params.source.retryMax ?? 3)) {
        break;
      }
      const backoffSeconds = (params.source.retryBackoffSeconds ?? 30) * attempt;
      await sleep(backoffSeconds * 1000);
    }
  }

  await database
    .update(marathonSyncRuns)
    .set({
      status: "failed",
      attempt,
      finishedAt: new Date(),
      errorMessage: lastError instanceof Error ? lastError.message : "Unknown error",
    })
    .where(eq(marathonSyncRuns.id, run.id));

  return { runId: run.id, status: "failed" as const };
}

async function syncSources() {
  const database = ensureDatabase();
  const now = new Date();

  const activeSources = await database
    .select()
    .from(sources)
    .where(eq(sources.isActive, true))
    .orderBy(desc(sources.priority), asc(sources.name));

  for (const source of activeSources) {
    log(`Syncing source: ${source.name}`, "sync");
    await database
      .update(sources)
      .set({ lastRunAt: now, updatedAt: now })
      .where(eq(sources.id, source.id));

    const links = await database
      .select({
        id: marathonSources.id,
        marathonId: marathonSources.marathonId,
        sourceUrl: marathonSources.sourceUrl,
        lastHash: marathonSources.lastHash,
        lastCheckedAt: marathonSources.lastCheckedAt,
        nextCheckAt: marathonSources.nextCheckAt,
        websiteUrl: marathons.websiteUrl,
      })
      .from(marathonSources)
      .innerJoin(marathons, eq(marathons.id, marathonSources.marathonId))
      .where(
        and(
          eq(marathonSources.sourceId, source.id),
          or(
            isNull(marathonSources.nextCheckAt),
            lte(marathonSources.nextCheckAt, now),
          ),
        ),
      )
      .orderBy(desc(marathonSources.isPrimary), asc(marathonSources.createdAt));

    for (const link of links) {
      const urlToFetch = link.sourceUrl || link.websiteUrl;
      if (!urlToFetch) continue;

      await syncMarathonSourceOnce({
        source,
        marathonId: link.marathonId,
        marathonSourceId: link.id,
        sourceUrl: urlToFetch,
        lastHash: link.lastHash,
      });
    }
  }
}

export async function syncNowOnce() {
  const release = await tryAcquireSchedulerLock();
  if (!release) {
    log("Sync scheduler lock is held by another instance; skipping run.", "sync");
    return;
  }
  try {
    await syncSources();
  } finally {
    await release();
  }
}

export function startSyncScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  let running = false;
  const interval = setInterval(async () => {
    if (running) {
      log("Sync already running, skipping interval tick.", "sync");
      return;
    }
    running = true;
    try {
      await syncNowOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log(`Sync scheduler error: ${message}`, "sync");
    } finally {
      running = false;
    }
  }, intervalMs);

  log(`Sync scheduler started (interval ${intervalMs}ms).`, "sync");

  return () => {
    clearInterval(interval);
    log("Sync scheduler stopped.", "sync");
  };
}
