import { storage } from "./storage";
import { log } from "./logger";
import type { Source } from "@shared/schema";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function fetchByStrategy(source: Source): Promise<void> {
  switch (source.strategy) {
    case "RSS":
      log(`Fetching RSS feed for ${source.name}`, "sync");
      break;
    case "HTML":
      log(`Fetching HTML content for ${source.name}`, "sync");
      break;
    case "API":
      log(`Fetching API data for ${source.name}`, "sync");
      break;
    default:
      throw new Error(`Unsupported strategy: ${source.strategy}`);
  }
}

async function runWithRetries(source: Source, runId: string) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < source.retryMax) {
    attempt += 1;
    try {
      await storage.updateSource(source.id, { lastRunAt: new Date() });
      await fetchByStrategy(source);
      return { attempt, status: "success" as const };
    } catch (error) {
      lastError = error;
      if (attempt >= source.retryMax) {
        break;
      }
      await storage.updateSyncRun(runId, {
        status: "retrying",
        attempt,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      log(
        `Attempt ${attempt} failed for ${source.name}, retrying in ${
          source.retryBackoffSeconds * attempt
        }s`,
        "sync",
      );
      await sleep(source.retryBackoffSeconds * attempt * 1000);
    }
  }

  return { attempt, status: "failed" as const, error: lastError };
}

async function syncSources() {
  const sources = await storage.listActiveSourcesByPriority();
  for (const source of sources) {
    const run = await storage.createSyncRun({
      sourceId: source.id,
      status: "running",
      strategyUsed: source.strategy,
      attempt: 1,
      startedAt: new Date(),
    });

    const result = await runWithRetries(source, run.id);
    const finishedAt = new Date();

    if (result.status === "success") {
      await storage.updateSyncRun(run.id, {
        status: "success",
        attempt: result.attempt,
        finishedAt,
      });
    } else {
      await storage.updateSyncRun(run.id, {
        status: "failed",
        attempt: result.attempt,
        finishedAt,
        message:
          result.error instanceof Error ? result.error.message : "Unknown error",
      });
    }
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
      await syncSources();
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
