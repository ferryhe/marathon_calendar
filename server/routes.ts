import type { Express } from "express";
import { type Server } from "http";
import { eq, and, or, like, sql, desc, asc, inArray } from "drizzle-orm";
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
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'raceDate']).default('raceDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
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
            like(marathons.canonicalName, `%${params.search}%`),
            like(marathons.description, `%${params.search}%`)
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

      const baseMarathons = await database
        .select()
        .from(marathons)
        .where(whereClause)
        .orderBy(asc(marathons.name));

      if (baseMarathons.length === 0) {
        return res.json({
          data: [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total: 0,
            totalPages: 0,
          },
        });
      }

      const marathonIds = baseMarathons.map((marathon) => marathon.id);
      const editionConditions = [inArray(marathonEditions.marathonId, marathonIds)];

      if (params.year) {
        editionConditions.push(eq(marathonEditions.year, params.year));
      }

      if (params.month) {
        editionConditions.push(
          sql`extract(month from ${marathonEditions.raceDate}) = ${params.month}`,
        );
      }

      if (params.status) {
        editionConditions.push(eq(marathonEditions.registrationStatus, params.status));
      }

      const editionWhereClause =
        editionConditions.length > 1 ? and(...editionConditions) : editionConditions[0];

      const editionRecords = await database
        .select()
        .from(marathonEditions)
        .where(editionWhereClause)
        .orderBy(asc(marathonEditions.raceDate), desc(marathonEditions.year));

      const editionsByMarathon = new Map<string, typeof editionRecords>();
      for (const edition of editionRecords) {
        const list = editionsByMarathon.get(edition.marathonId) ?? [];
        list.push(edition);
        editionsByMarathon.set(edition.marathonId, list);
      }

      const requiresEditionFilter =
        params.year !== undefined ||
        params.month !== undefined ||
        params.status !== undefined;

      const enrichedRecords = baseMarathons
        .map((marathon) => {
          const editions = editionsByMarathon.get(marathon.id) ?? [];
          const nextEdition = editions[0];
          return {
            ...marathon,
            nextEdition,
          };
        })
        .filter((record) => (requiresEditionFilter ? !!record.nextEdition : true));

      const sortedRecords = [...enrichedRecords].sort((a, b) => {
        if (params.sortBy === "name") {
          const compareValue = a.name.localeCompare(b.name, "zh-Hans-CN");
          return params.sortOrder === "desc" ? -compareValue : compareValue;
        }

        if (params.sortBy === "createdAt") {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          return params.sortOrder === "desc" ? timeB - timeA : timeA - timeB;
        }

        const raceA = a.nextEdition?.raceDate
          ? new Date(a.nextEdition.raceDate).getTime()
          : params.sortOrder === "desc"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY;
        const raceB = b.nextEdition?.raceDate
          ? new Date(b.nextEdition.raceDate).getTime()
          : params.sortOrder === "desc"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY;

        return params.sortOrder === "desc" ? raceB - raceA : raceA - raceB;
      });

      const total = sortedRecords.length;
      const offset = (params.page - 1) * params.limit;
      const paged = sortedRecords.slice(offset, offset + params.limit);

      res.json({
        data: paged,
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

  // Search marathons (simplified search endpoint) - MUST come before /:id
  app.get("/api/marathons/search", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const { q: searchQuery } = searchQuerySchema.parse(req.query);
      
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

  // Get upcoming marathons - MUST come before /:id
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

  app.get("/api/marathons/hot", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const records = await database
        .select({
          marathon: marathons,
          reviewCount: sql<number>`count(${marathonReviews.id})::int`,
          averageRating: sql<number>`coalesce(avg(${marathonReviews.rating}), 0)::float`,
        })
        .from(marathons)
        .leftJoin(marathonReviews, eq(marathonReviews.marathonId, marathons.id))
        .groupBy(marathons.id)
        .orderBy(
          desc(sql`count(${marathonReviews.id})`),
          desc(sql`coalesce(avg(${marathonReviews.rating}), 0)`),
          asc(marathons.name),
        )
        .limit(limit);

      res.json({
        data: records.map((record) => ({
          ...record.marathon,
          stats: {
            reviewCount: record.reviewCount,
            averageRating: Number(record.averageRating ?? 0),
          },
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // Get marathon details by ID - MUST come after /search and /upcoming
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
