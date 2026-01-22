import type { Express } from "express";
import { type Server } from "http";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  insertMarathonSchema,
  insertReviewSchema,
  marathonReviews,
  marathons,
} from "@shared/schema";
import { db } from "./db";

const reviewPayloadSchema = insertReviewSchema.omit({ marathonId: true });

const marathonEditionIdSchema = z.union([
  z.string().uuid(),
  z.literal("").transform(() => undefined),
  z.undefined(),
]);

const reviewPayloadWithEditionSchema = reviewPayloadSchema.extend({
  marathonEditionId: marathonEditionIdSchema,
});

function ensureDatabase() {
  if (!db) {
    throw new Error("Database unavailable: DATABASE_URL is not configured");
  }

  return db;
}

function canonicalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.get("/api/marathons", async (_req, res, next) => {
    try {
      const database = ensureDatabase();
      const records = await database.select().from(marathons);
      res.json(records);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/marathons", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const payload = insertMarathonSchema.parse({
        ...req.body,
        canonicalName:
          req.body.canonicalName ?? canonicalizeName(req.body.name ?? ""),
      });

      const [record] = await database
        .insert(marathons)
        .values({
          ...payload,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: marathons.canonicalName,
          set: {
            ...payload,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/marathons/:marathonId/reviews", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const records = await database
        .select()
        .from(marathonReviews)
        .where(eq(marathonReviews.marathonId, req.params.marathonId));
      res.json(records);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/marathons/:marathonId/reviews", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const parsed = reviewPayloadWithEditionSchema.parse(req.body);
      const [record] = await database
        .insert(marathonReviews)
        .values({
          ...parsed,
          marathonId: req.params.marathonId,
        })
        .returning();

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  return httpServer;
}
