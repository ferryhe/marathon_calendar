import crypto from "crypto";
import { load } from "cheerio";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import {
  marathonEditions,
  marathons,
  marathonSources,
  marathonSyncRuns,
  rawCrawlData,
  sources,
  type Source,
} from "@shared/schema";
import { db, pool } from "./db";
import { log } from "./logger";
import { aiExtractFromHtml, isAiFallbackEnabled } from "./aiExtractor";
import { upsertEditionWithMerge } from "./editionMerge";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const RAW_CONTENT_MAX_CHARS = 2 * 1024 * 1024;
const SCHEDULER_LOCK_KEY = 0x6d_63_5f_73; // "mc_s" for stable advisory lock

type EditionExtract = {
  raceDate: string | null;
  registrationStatus: string | null;
  registrationUrl: string | null;
  method: "rule" | "jsonld" | "regex" | "ai";
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function toLocalYmd(value: Date) {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isPastRaceDate(raceDate: string, todayYmd: string) {
  return raceDate < todayYmd;
}

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

function isValidYmd(yyyy: number, mm: number, dd: number) {
  if (!Number.isInteger(yyyy) || yyyy < 2000 || yyyy > 2100) return false;
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) return false;
  if (!Number.isInteger(dd) || dd < 1 || dd > 31) return false;
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  return (
    date.getUTCFullYear() === yyyy &&
    date.getUTCMonth() === mm - 1 &&
    date.getUTCDate() === dd
  );
}

function extractEditionFromHtml(html: string): EditionExtract | null {
  const jsonLdEvents = extractJsonLdEvents(html);
  for (const event of jsonLdEvents) {
    const raceDate = coerceDateString(event.startDate);
    if (raceDate) {
      return {
        raceDate,
        registrationStatus: null as string | null,
        registrationUrl: typeof event.url === "string" ? event.url : null,
        method: "jsonld" as const,
      };
    }
  }

  const dateMatch =
    html.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/) ??
    html.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (dateMatch) {
    const yyyyN = Number(dateMatch[1]);
    const mmN = Number(dateMatch[2]);
    const ddN = Number(dateMatch[3]);
    if (!isValidYmd(yyyyN, mmN, ddN)) {
      return null;
    }
    const yyyy = String(yyyyN);
    const mm = String(mmN).padStart(2, "0");
    const dd = String(ddN).padStart(2, "0");
    return {
      raceDate: `${yyyy}-${mm}-${dd}`,
      registrationStatus: null as string | null,
      registrationUrl: null as string | null,
      method: "regex" as const,
    };
  }

  return null;
}

type HtmlExtractRule = {
  selector: string;
  attr?: string;
  regex?: string;
  group?: number;
};

function readRule(
  config: Record<string, unknown> | null,
  key: string,
): HtmlExtractRule | null {
  if (!config || typeof config !== "object") return null;
  const extract = (config as any).extract;
  if (!extract || typeof extract !== "object") return null;
  const rule = (extract as any)[key];
  if (!rule || typeof rule !== "object") return null;
  if (typeof (rule as any).selector !== "string") return null;
  return {
    selector: (rule as any).selector,
    attr: typeof (rule as any).attr === "string" ? (rule as any).attr : undefined,
    regex: typeof (rule as any).regex === "string" ? (rule as any).regex : undefined,
    group: typeof (rule as any).group === "number" ? (rule as any).group : undefined,
  };
}

function applyRule($: ReturnType<typeof load>, rule: HtmlExtractRule): string | null {
  const el = $(rule.selector).first();
  if (!el || el.length === 0) return null;
  const rawValue =
    !rule.attr || rule.attr === "text"
      ? el.text()
      : rule.attr === "html"
        ? el.html() ?? ""
        : el.attr(rule.attr) ?? "";
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return null;

  if (!rule.regex) return trimmed;
  try {
    const re = new RegExp(rule.regex, "i");
    const match = trimmed.match(re);
    if (!match) return null;
    const index = rule.group ?? 1;
    return (match[index] ?? "").trim() || null;
  } catch {
    return null;
  }
}

function normalizeDateString(value: string): string | null {
  const direct = coerceDateString(value);
  if (direct) return direct;
  const m1 = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m1) {
    const yyyyN = Number(m1[1]);
    const mmN = Number(m1[2]);
    const ddN = Number(m1[3]);
    if (!isValidYmd(yyyyN, mmN, ddN)) return null;
    const yyyy = String(yyyyN);
    const mm = String(mmN).padStart(2, "0");
    const dd = String(ddN).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const m2 = value.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m2) {
    const yyyyN = Number(m2[1]);
    const mmN = Number(m2[2]);
    const ddN = Number(m2[3]);
    if (!isValidYmd(yyyyN, mmN, ddN)) return null;
    const yyyy = String(yyyyN);
    const mm = String(mmN).padStart(2, "0");
    const dd = String(ddN).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function isValidYmdString(value: string) {
  const m = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const yyyyN = Number(m[1]);
  const mmN = Number(m[2]);
  const ddN = Number(m[3]);
  return isValidYmd(yyyyN, mmN, ddN);
}

function resolveUrlMaybe(value: string, pageUrl: string): string {
  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return value;
  }
}

function extractEditionFromHtmlWithConfig(params: {
  html: string;
  pageUrl: string;
  source: Source;
}): EditionExtract | null {
  const config = (params.source.config ?? null) as Record<string, unknown> | null;
  const raceDateRule = readRule(config, "raceDate");
  const statusRule = readRule(config, "registrationStatus");
  const regUrlRule = readRule(config, "registrationUrl");
  const hasRules = Boolean(raceDateRule || statusRule || regUrlRule);

  if (hasRules) {
    const $ = load(params.html);
    const rawRaceDate = raceDateRule ? applyRule($, raceDateRule) : null;
    const raceDate = rawRaceDate ? normalizeDateString(rawRaceDate) : null;
    const registrationStatus = statusRule ? applyRule($, statusRule) : null;
    const rawRegUrl = regUrlRule ? applyRule($, regUrlRule) : null;
    const registrationUrl = rawRegUrl ? resolveUrlMaybe(rawRegUrl, params.pageUrl) : null;

    if (raceDate || registrationStatus || registrationUrl) {
      return { raceDate, registrationStatus, registrationUrl, method: "rule" as const };
    }
  }

  return extractEditionFromHtml(params.html);
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
  const todayYmd = toLocalYmd(startedAt);

  const [latestRaceDateRow] = await database
    .select({
      latestRaceDate: sql<string | null>`max(${marathonEditions.raceDate})`,
    })
    .from(marathonEditions)
    .where(
      and(
        eq(marathonEditions.marathonId, params.marathonId),
        isNotNull(marathonEditions.raceDate),
      ),
    );
  const latestRaceDate = latestRaceDateRow?.latestRaceDate ?? null;
  if (latestRaceDate && isPastRaceDate(latestRaceDate, todayYmd)) {
    const message = `赛事已完赛（${latestRaceDate}），已停止自动更新`;
    const [run] = await database
      .insert(marathonSyncRuns)
      .values({
        marathonId: params.marathonId,
        sourceId: params.source.id,
        status: "skipped",
        strategyUsed: params.source.strategy,
        attempt: 1,
        message,
        startedAt,
        finishedAt: new Date(),
      })
      .returning();

    await database
      .update(marathonSources)
      .set({
        lastCheckedAt: new Date(),
        lastError: message,
        nextCheckAt: null,
      })
      .where(eq(marathonSources.id, params.marathonSourceId));

    return { runId: run.id, status: "skipped" as const };
  }

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
    let rawRowId: string | null = null;
    let rawFetchedAtIso: string | null = null;
    let rawHttpStatus: number | null = null;
    let rawContentHash: string | null = null;
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
      const fetchedAtIso = new Date().toISOString();
      rawFetchedAtIso = fetchedAtIso;
      rawHttpStatus = httpStatus;

      const contentHash = sha256(raw);
      rawContentHash = contentHash;
      const isUnchanged = Boolean(params.lastHash && params.lastHash === contentHash);

      if (!isUnchanged) {
        const inserted = await database
          .insert(rawCrawlData)
          .values({
          marathonId: params.marathonId,
          sourceId: params.source.id,
          sourceUrl: params.sourceUrl,
          contentType,
          httpStatus,
          rawContent: raw,
          contentHash,
          status: "pending",
          metadata: {
            fetchedAt: fetchedAtIso,
          },
        })
          .returning({ id: rawCrawlData.id });
        rawRowId = inserted[0]?.id ?? null;
      }

      let updatedCount = 0;
      let unchangedCount = 0;

      if (isUnchanged) {
        unchangedCount = 1;
      } else if (params.source.strategy === "HTML") {
        let extracted = extractEditionFromHtmlWithConfig({
          html: raw,
          pageUrl: params.sourceUrl,
          source: params.source,
        });

        let usedAi = false;
        let aiError: string | null = null;
        if (!extracted?.raceDate && isAiFallbackEnabled()) {
          try {
            const ai = await aiExtractFromHtml({
              pageUrl: params.sourceUrl,
              html: raw,
            });
            if (ai) {
              usedAi = true;
              extracted = {
                raceDate: ai.raceDate,
                registrationStatus: ai.registrationStatus,
                registrationUrl: ai.registrationUrl,
                method: "ai" as const,
              };
            }
          } catch (error) {
            usedAi = true;
            aiError = error instanceof Error ? error.message : "AI extract failed";
          }
        }

        const extractedRaceDate =
          extracted?.raceDate && isValidYmdString(extracted.raceDate)
            ? extracted.raceDate
            : null;

        if (extracted && extractedRaceDate) {
          const year = Number(extractedRaceDate.slice(0, 4));
          const merge = await upsertEditionWithMerge({
            database,
            marathonId: params.marathonId,
            year,
            incoming: {
              raceDate: extractedRaceDate,
              registrationStatus: extracted.registrationStatus,
              registrationUrl: extracted.registrationUrl,
            },
            source: {
              sourceId: params.source.id,
              sourceType: params.source.type,
              priority: params.source.priority,
            },
            // Auto-publish only when the race date is extracted and there are no conflicts,
            // and the source is an official site.
            publish:
              params.source.type === "official"
                ? { status: "published" as const }
                : { status: "draft" as const },
          });

          if (merge.action === "updated" || merge.action === "inserted") {
            updatedCount = 1;
          } else {
            unchangedCount = 1;
          }

          if (rawRowId) {
            await database
              .update(rawCrawlData)
              .set({
                status: merge.conflicts.length > 0 ? "needs_review" : "processed",
                processedAt: new Date(),
                metadata: {
                  fetchedAt: fetchedAtIso,
                  extraction: {
                    method: extracted.method,
                    raceDate: extractedRaceDate,
                    registrationStatus: extracted.registrationStatus,
                    registrationUrl: extracted.registrationUrl,
                  },
                  merge: {
                    action: merge.action,
                    year: merge.year,
                    conflicts: merge.conflicts,
                  },
                  ai: usedAi
                    ? {
                        used: true,
                        model: process.env.AI_MODEL ?? null,
                        error: aiError,
                      }
                    : { used: false },
                },
              })
              .where(eq(rawCrawlData.id, rawRowId));
          }
        } else {
          unchangedCount = 1;

          if (rawRowId) {
            await database
              .update(rawCrawlData)
              .set({
                status: "needs_review",
                processedAt: new Date(),
                metadata: {
                  fetchedAt: fetchedAtIso,
                  extraction: extracted
                    ? {
                        method: extracted.method,
                        raceDate: extractedRaceDate,
                        registrationStatus: extracted.registrationStatus,
                        registrationUrl: extracted.registrationUrl,
                      }
                    : { method: "none" },
                  ai: usedAi
                    ? {
                        used: true,
                        model: process.env.AI_MODEL ?? null,
                        error: aiError,
                      }
                    : { used: false },
                },
              })
              .where(eq(rawCrawlData.id, rawRowId));
          }
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
      const message = error instanceof Error ? error.message : "Unknown error";

      if (rawRowId) {
        await database
          .update(rawCrawlData)
          .set({
            status: "failed",
            processedAt: new Date(),
            metadata: {
              fetchedAt: rawFetchedAtIso,
              httpStatus: rawHttpStatus,
              contentHash: rawContentHash,
              error: {
                at: new Date().toISOString(),
                message,
              },
            },
          })
          .where(eq(rawCrawlData.id, rawRowId));
      }

      const backoffSeconds = (params.source.retryBackoffSeconds ?? 30) * attempt;
      const minIntervalSeconds = params.source.minIntervalSeconds ?? 0;
      const nextDelaySeconds = Math.max(backoffSeconds, minIntervalSeconds);
      const nextCheckAt =
        nextDelaySeconds > 0 ? new Date(Date.now() + nextDelaySeconds * 1000) : null;

      await database
        .update(marathonSources)
        .set({
          lastCheckedAt: new Date(),
          lastHttpStatus: null,
          lastError: message,
          nextCheckAt,
        })
        .where(eq(marathonSources.id, params.marathonSourceId));

      await database
        .update(marathonSyncRuns)
        .set({
          status: attempt < (params.source.retryMax ?? 3) ? "retrying" : "failed",
          attempt,
          message,
        })
        .where(eq(marathonSyncRuns.id, run.id));

      if (attempt >= (params.source.retryMax ?? 3)) {
        break;
      }
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
  const todayYmd = toLocalYmd(now);

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

    const marathonIds = Array.from(new Set(links.map((x) => x.marathonId)));
    const latestRaceDateByMarathonId = new Map<string, string>();
    if (marathonIds.length > 0) {
      const latestRaceDateRows = await database
        .select({
          marathonId: marathonEditions.marathonId,
          latestRaceDate: sql<string | null>`max(${marathonEditions.raceDate})`,
        })
        .from(marathonEditions)
        .where(
          and(
            inArray(marathonEditions.marathonId, marathonIds),
            isNotNull(marathonEditions.raceDate),
          ),
        )
        .groupBy(marathonEditions.marathonId);

      for (const row of latestRaceDateRows) {
        if (row.latestRaceDate) {
          latestRaceDateByMarathonId.set(row.marathonId, row.latestRaceDate);
        }
      }
    }

    for (const link of links) {
      const latestRaceDate = latestRaceDateByMarathonId.get(link.marathonId) ?? null;
      if (latestRaceDate && isPastRaceDate(latestRaceDate, todayYmd)) {
        await database
          .update(marathonSources)
          .set({
            lastCheckedAt: now,
            lastError: `赛事已完赛（${latestRaceDate}），已停止自动更新`,
            nextCheckAt: null,
          })
          .where(eq(marathonSources.id, link.id));
        continue;
      }

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
