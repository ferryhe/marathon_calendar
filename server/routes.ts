import type { Express } from "express";
import { type Server } from "http";
import { eq, and, or, like, sql, desc, asc } from "drizzle-orm";
import { z } from "zod";
import {
  insertMarathonSchema,
  insertReviewSchema,
  marathonReviews,
  marathons,
  marathonEditions,
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

// Query parameter schemas
const marathonQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  year: z.coerce.number().optional(),
  month: z.coerce.number().min(1).max(12).optional(),
  status: z.string().optional(),
  sortBy: z.enum(['raceDate', 'name', 'createdAt']).default('raceDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
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
  // Get marathons list with filtering, pagination and search
  app.get("/api/marathons", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const params = marathonQuerySchema.parse(req.query);
      
      // Build where conditions
      const conditions = [];
      
      if (params.search) {
        conditions.push(
          or(
            like(marathons.name, `%${params.search}%`),
            like(marathons.city, `%${params.search}%`),
            like(marathons.canonicalName, `%${params.search}%`)
          )
        );
      }
      
      if (params.city) {
        conditions.push(eq(marathons.city, params.city));
      }
      
      if (params.country) {
        conditions.push(eq(marathons.country, params.country));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Get total count
      const countResult = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(marathons)
        .where(whereClause);
      
      const total = countResult[0]?.count || 0;
      
      // Get paginated records with sorting
      const offset = (params.page - 1) * params.limit;
      const orderColumn = params.sortBy === 'name' ? marathons.name :
                         params.sortBy === 'createdAt' ? marathons.createdAt :
                         marathons.name; // default fallback
      
      const records = await database
        .select()
        .from(marathons)
        .where(whereClause)
        .orderBy(params.sortOrder === 'desc' ? desc(orderColumn) : asc(orderColumn))
        .limit(params.limit)
        .offset(offset);
      
      res.json({
        data: records,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Get marathon details by ID
  app.get("/api/marathons/:id", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const [record] = await database
        .select()
        .from(marathons)
        .where(eq(marathons.id, req.params.id));
      
      if (!record) {
        return res.status(404).json({ error: "Marathon not found" });
      }
      
      // Get associated editions
      const editions = await database
        .select()
        .from(marathonEditions)
        .where(eq(marathonEditions.marathonId, req.params.id))
        .orderBy(desc(marathonEditions.year));
      
      // Get reviews with aggregated stats
      const reviews = await database
        .select()
        .from(marathonReviews)
        .where(eq(marathonReviews.marathonId, req.params.id))
        .orderBy(desc(marathonReviews.createdAt));
      
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;
      
      res.json({
        ...record,
        editions,
        reviews: {
          items: reviews,
          averageRating: avgRating,
          count: reviews.length,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Search marathons (simplified search endpoint)
  app.get("/api/marathons/search", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const searchQuery = req.query.q as string;
      
      if (!searchQuery) {
        return res.json({ data: [] });
      }
      
      const records = await database
        .select()
        .from(marathons)
        .where(
          or(
            like(marathons.name, `%${searchQuery}%`),
            like(marathons.city, `%${searchQuery}%`),
            like(marathons.description, `%${searchQuery}%`)
          )
        )
        .limit(20);
      
      res.json({ data: records });
    } catch (error) {
      next(error);
    }
  });

  // Get upcoming marathons
  app.get("/api/marathons/upcoming", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      
      // Get marathons with editions that have future race dates
      const records = await database
        .select({
          marathon: marathons,
          edition: marathonEditions,
        })
        .from(marathons)
        .innerJoin(marathonEditions, eq(marathons.id, marathonEditions.marathonId))
        .where(sql`${marathonEditions.raceDate} >= CURRENT_DATE`)
        .orderBy(asc(marathonEditions.raceDate))
        .limit(limit);
      
      res.json({ 
        data: records.map(r => ({
          ...r.marathon,
          nextEdition: r.edition,
        }))
      });
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
