import type { Express, Request } from "express";
import { type Server } from "http";
import path from "path";
import { promises as fs } from "fs";
import COS from "cos-nodejs-sdk-v5";
import { eq, and, or, like, sql, desc, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  users,
  insertUserSchema,
  insertMarathonSchema,
  insertReviewSchema,
  userFavoriteMarathons,
  marathonReviews,
  marathons,
  marathonEditions,
  reviewLikes,
  reviewReports,
} from "@shared/schema";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./auth";

const reviewPayloadSchema = insertReviewSchema.omit({
  marathonId: true,
  userId: true,
  userDisplayName: true,
});

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

const limitQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
});


const registerPayloadSchema = insertUserSchema.extend({
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(128),
});

const loginPayloadSchema = z.object({
  username: z.string().trim().min(3).max(30),
  password: z.string().min(6).max(128),
});

const updateReviewPayloadSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).nullable().optional(),
});

const updateProfilePayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  avatarUrl: z.string().url().nullable().optional(),
  avatarSource: z.enum(["manual", "upload", "wechat"]).optional(),
});

const avatarUploadPayloadSchema = z.object({
  dataUrl: z.string().min(32).max(6 * 1024 * 1024),
});

const bindWechatPayloadSchema = z.object({
  wechatOpenId: z.string().trim().min(6).max(128),
  wechatUnionId: z.string().trim().min(6).max(128).optional(),
  wechatNickname: z.string().trim().min(1).max(50),
  wechatAvatarUrl: z.string().url().optional(),
});

function requireAuth(req: Request) {
  if (!req.session?.userId) {
    const error = new Error("Authentication required");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}

function ensureDatabase() {
  if (!db) {
    throw new Error("Database unavailable: DATABASE_URL is not configured");
  }

  return db;
}

function canonicalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function toAuthUser(user: {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarSource: string;
  isWechatBound: boolean;
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    avatarSource: user.avatarSource,
    isWechatBound: user.isWechatBound,
    wechatNickname: user.wechatNickname,
    wechatAvatarUrl: user.wechatAvatarUrl,
  };
}

function parseAvatarDataUrl(dataUrl: string) {
  const match = dataUrl.match(
    /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i,
  );
  if (!match) {
    const error = new Error("Invalid image data");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const mime = match[1].toLowerCase();
  const base64Body = match[3];
  const buffer = Buffer.from(base64Body, "base64");

  if (buffer.length > 2 * 1024 * 1024) {
    const error = new Error("Avatar image exceeds 2MB");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const ext = mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : mime.split("/")[1];
  return { buffer, ext };
}

const COS_BUCKET = process.env.COS_BUCKET ?? "marathon-calendar-1256398230";
const COS_REGION = process.env.COS_REGION;
const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const COS_PUBLIC_BASE_URL = process.env.COS_PUBLIC_BASE_URL;

const cosClient =
  COS_REGION && COS_SECRET_ID && COS_SECRET_KEY
    ? new COS({
        SecretId: COS_SECRET_ID,
        SecretKey: COS_SECRET_KEY,
      })
    : null;

function getCosPublicUrl(key: string) {
  const normalized = key.replace(/^\/+/, "");
  if (COS_PUBLIC_BASE_URL) {
    const base = COS_PUBLIC_BASE_URL.replace(/\/+$/, "");
    return `${base}/${normalized}`;
  }

  if (!COS_REGION) {
    throw new Error("COS_REGION is required for COS uploads");
  }

  return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${normalized}`;
}

async function uploadAvatarObject(
  userId: string,
  ext: string,
  buffer: Buffer,
): Promise<{ avatarUrl: string; storage: "cos" | "local" }> {
  const now = Date.now();
  const objectKey = `avatars/${userId}/${now}.${ext}`;

  if (cosClient && COS_REGION) {
    await new Promise<void>((resolve, reject) => {
      cosClient.putObject(
        {
          Bucket: COS_BUCKET,
          Region: COS_REGION,
          Key: objectKey,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
          CacheControl: "public, max-age=31536000, immutable",
        },
        (err) => {
          if (err) {
            return reject(err);
          }

          return resolve();
        },
      );
    });

    return {
      avatarUrl: getCosPublicUrl(objectKey),
      storage: "cos",
    };
  }

  const relativeDir = path.join("uploads", "avatars");
  const absoluteDir = path.resolve(process.cwd(), relativeDir);
  await fs.mkdir(absoluteDir, { recursive: true });

  const fileName = `${userId}-${now}.${ext}`;
  await fs.writeFile(path.join(absoluteDir, fileName), buffer);

  return {
    avatarUrl: `/uploads/avatars/${fileName}`,
    storage: "local",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const payload = registerPayloadSchema.parse(req.body);

      const [existingUser] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, payload.username));

      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(payload.password);
      const [user] = await database
        .insert(users)
        .values({
          username: payload.username,
          password: hashedPassword,
          displayName: payload.username,
          avatarSource: "manual",
        })
        .returning();

      // Regenerate session to prevent session fixation
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.displayName = user.displayName ?? user.username;

      res.json({
        user: toAuthUser(user),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      const payload = loginPayloadSchema.parse(req.body);

      const [user] = await database
        .select({
          id: users.id,
          username: users.username,
          password: users.password,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          avatarSource: users.avatarSource,
          isWechatBound: users.isWechatBound,
          wechatNickname: users.wechatNickname,
          wechatAvatarUrl: users.wechatAvatarUrl,
        })
        .from(users)
        .where(eq(users.username, payload.username));

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await verifyPassword(payload.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Regenerate session to prevent session fixation
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.displayName = user.displayName ?? user.username;

      res.json({
        user: toAuthUser(user),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      if (!req.session) {
        return res.json({ success: true });
      }

      req.session.destroy((err) => {
        if (err) {
          return next(err);
        }

        res.clearCookie("mc.sid");
        return res.json({ success: true });
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/me", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const [user] = await database
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          avatarSource: users.avatarSource,
          isWechatBound: users.isWechatBound,
          wechatNickname: users.wechatNickname,
          wechatAvatarUrl: users.wechatAvatarUrl,
        })
        .from(users)
        .where(eq(users.id, req.session.userId));

      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      res.json({ user: toAuthUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/users/me", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);
      const payload = updateProfilePayloadSchema.parse(req.body);

      const [updated] = await database
        .update(users)
        .set({
          displayName: payload.displayName,
          avatarUrl: payload.avatarUrl ?? null,
          avatarSource: payload.avatarSource ?? "manual",
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.session.userId!))
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          avatarSource: users.avatarSource,
          isWechatBound: users.isWechatBound,
          wechatNickname: users.wechatNickname,
          wechatAvatarUrl: users.wechatAvatarUrl,
        });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      req.session.displayName = updated.displayName ?? updated.username;
      res.json({ user: toAuthUser(updated) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/me/avatar/upload", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);
      const payload = avatarUploadPayloadSchema.parse(req.body);
      const { buffer, ext } = parseAvatarDataUrl(payload.dataUrl);
      const { avatarUrl } = await uploadAvatarObject(req.session.userId!, ext, buffer);

      const [updated] = await database
        .update(users)
        .set({
          avatarUrl,
          avatarSource: "upload",
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.session.userId!))
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          avatarSource: users.avatarSource,
          isWechatBound: users.isWechatBound,
          wechatNickname: users.wechatNickname,
          wechatAvatarUrl: users.wechatAvatarUrl,
        });

      res.json({
        avatarUrl,
        user: updated ? toAuthUser(updated) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  // Backend-oriented operation: in production this should be called after server-side
  // verification with WeChat OAuth data, not directly by arbitrary clients.
  app.post("/api/users/me/wechat/bind", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);
      const payload = bindWechatPayloadSchema.parse(req.body);

      // Check if wechatOpenId or wechatUnionId is already bound to another user
      const conditions = [];
      if (payload.wechatOpenId) {
        conditions.push(eq(users.wechatOpenId, payload.wechatOpenId));
      }
      if (payload.wechatUnionId) {
        conditions.push(eq(users.wechatUnionId, payload.wechatUnionId));
      }

      if (conditions.length > 0) {
        const [existingBinding] = await database
          .select({ id: users.id })
          .from(users)
          .where(and(
            or(...conditions),
            sql`${users.id} != ${req.session.userId}`
          ));

        if (existingBinding) {
          return res.status(409).json({ 
            message: "This WeChat account is already bound to another user" 
          });
        }
      }

      const [updated] = await database
        .update(users)
        .set({
          wechatOpenId: payload.wechatOpenId,
          wechatUnionId: payload.wechatUnionId ?? null,
          wechatNickname: payload.wechatNickname,
          wechatAvatarUrl: payload.wechatAvatarUrl ?? null,
          isWechatBound: true,
          wechatBoundAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.session.userId!))
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          avatarSource: users.avatarSource,
          isWechatBound: users.isWechatBound,
          wechatNickname: users.wechatNickname,
          wechatAvatarUrl: users.wechatAvatarUrl,
        });

      res.json({ user: updated ? toAuthUser(updated) : null });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/me/wechat/unbind", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);

      const [updated] = await database
        .update(users)
        .set({
          wechatOpenId: null,
          wechatUnionId: null,
          wechatNickname: null,
          wechatAvatarUrl: null,
          isWechatBound: false,
          wechatBoundAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.session.userId!))
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          avatarSource: users.avatarSource,
          isWechatBound: users.isWechatBound,
          wechatNickname: users.wechatNickname,
          wechatAvatarUrl: users.wechatAvatarUrl,
        });

      res.json({ user: updated ? toAuthUser(updated) : null });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/me/reviews", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);

      const records = await database
        .select({
          id: marathonReviews.id,
          marathonId: marathonReviews.marathonId,
          userId: marathonReviews.userId,
          marathonEditionId: marathonReviews.marathonEditionId,
          userDisplayName: sql<string>`coalesce(${users.displayName}, ${marathonReviews.userDisplayName})`,
          userAvatarUrl: users.avatarUrl,
          rating: marathonReviews.rating,
          comment: marathonReviews.comment,
          likesCount: marathonReviews.likesCount,
          reportCount: marathonReviews.reportCount,
          createdAt: marathonReviews.createdAt,
          marathon: {
            id: marathons.id,
            name: marathons.name,
            city: marathons.city,
            country: marathons.country,
          },
        })
        .from(marathonReviews)
        .leftJoin(users, eq(users.id, marathonReviews.userId))
        .innerJoin(marathons, eq(marathons.id, marathonReviews.marathonId))
        .where(eq(marathonReviews.userId, req.session.userId!))
        .orderBy(desc(marathonReviews.createdAt));

      res.json({ data: records });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/me/favorites", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);

      const records = await database
        .select({
          id: userFavoriteMarathons.id,
          favoritedAt: userFavoriteMarathons.createdAt,
          marathon: {
            id: marathons.id,
            name: marathons.name,
            city: marathons.city,
            country: marathons.country,
            websiteUrl: marathons.websiteUrl,
            description: marathons.description,
          },
        })
        .from(userFavoriteMarathons)
        .innerJoin(marathons, eq(marathons.id, userFavoriteMarathons.marathonId))
        .where(eq(userFavoriteMarathons.userId, req.session.userId!))
        .orderBy(desc(userFavoriteMarathons.createdAt));

      res.json({ data: records });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/me/favorites/:marathonId", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);

      const [marathon] = await database
        .select({ id: marathons.id })
        .from(marathons)
        .where(eq(marathons.id, req.params.marathonId));

      if (!marathon) {
        return res.status(404).json({ message: "Marathon not found" });
      }

      await database
        .insert(userFavoriteMarathons)
        .values({
          userId: req.session.userId!,
          marathonId: req.params.marathonId,
        })
        .onConflictDoNothing({
          target: [
            userFavoriteMarathons.userId,
            userFavoriteMarathons.marathonId,
          ],
        });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/users/me/favorites/:marathonId", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);

      await database
        .delete(userFavoriteMarathons)
        .where(
          and(
            eq(userFavoriteMarathons.userId, req.session.userId!),
            eq(userFavoriteMarathons.marathonId, req.params.marathonId),
          ),
        );

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

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
      const { limit } = limitQuerySchema.parse(req.query);
      
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

  app.get("/api/marathons/:marathonId/favorite-status", async (req, res, next) => {
    try {
      const database = ensureDatabase();

      if (!req.session?.userId) {
        return res.json({ isFavorited: false });
      }

      const [record] = await database
        .select({ id: userFavoriteMarathons.id })
        .from(userFavoriteMarathons)
        .where(
          and(
            eq(userFavoriteMarathons.userId, req.session.userId),
            eq(userFavoriteMarathons.marathonId, req.params.marathonId),
          ),
        )
        .limit(1);

      res.json({ isFavorited: !!record });
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
      
      // Get reviews with user profile data for avatar/display name rendering.
      const reviews = await database
        .select({
          id: marathonReviews.id,
          marathonId: marathonReviews.marathonId,
          userId: marathonReviews.userId,
          marathonEditionId: marathonReviews.marathonEditionId,
          userDisplayName: sql<string>`coalesce(${users.displayName}, ${marathonReviews.userDisplayName})`,
          userAvatarUrl: users.avatarUrl,
          rating: marathonReviews.rating,
          comment: marathonReviews.comment,
          likesCount: marathonReviews.likesCount,
          reportCount: marathonReviews.reportCount,
          createdAt: marathonReviews.createdAt,
        })
        .from(marathonReviews)
        .leftJoin(users, eq(users.id, marathonReviews.userId))
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
        .select({
          id: marathonReviews.id,
          marathonId: marathonReviews.marathonId,
          userId: marathonReviews.userId,
          marathonEditionId: marathonReviews.marathonEditionId,
          userDisplayName: sql<string>`coalesce(${users.displayName}, ${marathonReviews.userDisplayName})`,
          userAvatarUrl: users.avatarUrl,
          rating: marathonReviews.rating,
          comment: marathonReviews.comment,
          likesCount: marathonReviews.likesCount,
          reportCount: marathonReviews.reportCount,
          createdAt: marathonReviews.createdAt,
        })
        .from(marathonReviews)
        .leftJoin(users, eq(users.id, marathonReviews.userId))
        .where(eq(marathonReviews.marathonId, req.params.marathonId))
        .orderBy(desc(marathonReviews.createdAt));
      res.json(records);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/marathons/:marathonId/reviews", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);
      const parsed = reviewPayloadWithEditionSchema.parse(req.body);
      const [author] = await database
        .select({
          username: users.username,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, req.session.userId!));

      const displayName =
        author?.displayName ??
        author?.username ??
        req.session.displayName ??
        req.session.username ??
        "匿名用户";
      const [record] = await database
        .insert(marathonReviews)
        .values({
          ...parsed,
          marathonId: req.params.marathonId,
          userId: req.session.userId!,
          userDisplayName: displayName,
        })
        .returning();

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/reviews/:id", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);
      const payload = updateReviewPayloadSchema.parse(req.body);

      const [existing] = await database
        .select()
        .from(marathonReviews)
        .where(eq(marathonReviews.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Review not found" });
      }

      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Permission denied" });
      }

      const [updated] = await database
        .update(marathonReviews)
        .set({
          ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
          ...(payload.comment !== undefined ? { comment: payload.comment } : {}),
        })
        .where(eq(marathonReviews.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/reviews/:id", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      requireAuth(req);

      const [existing] = await database
        .select()
        .from(marathonReviews)
        .where(eq(marathonReviews.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Review not found" });
      }

      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Permission denied" });
      }

      await database.delete(marathonReviews).where(eq(marathonReviews.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reviews/:id/like", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      
      // Require authentication
      if (!req.session.userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if review exists
      const [review] = await database
        .select()
        .from(marathonReviews)
        .where(eq(marathonReviews.id, req.params.id));

      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      // Check if user already liked this review
      const [existingLike] = await database
        .select()
        .from(reviewLikes)
        .where(
          and(
            eq(reviewLikes.reviewId, req.params.id),
            eq(reviewLikes.userId, req.session.userId)
          )
        );

      if (existingLike) {
        return res.status(409).json({ message: "Already liked this review" });
      }

      // Add like record
      await database.insert(reviewLikes).values({
        reviewId: req.params.id,
        userId: req.session.userId,
      });

      // Increment like count
      const [updated] = await database
        .update(marathonReviews)
        .set({
          likesCount: sql`${marathonReviews.likesCount} + 1`,
        })
        .where(eq(marathonReviews.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reviews/:id/report", async (req, res, next) => {
    try {
      const database = ensureDatabase();
      
      // Require authentication
      if (!req.session.userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if review exists
      const [review] = await database
        .select()
        .from(marathonReviews)
        .where(eq(marathonReviews.id, req.params.id));

      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      // Check if user already reported this review
      const [existingReport] = await database
        .select()
        .from(reviewReports)
        .where(
          and(
            eq(reviewReports.reviewId, req.params.id),
            eq(reviewReports.userId, req.session.userId)
          )
        );

      if (existingReport) {
        return res.status(409).json({ message: "Already reported this review" });
      }

      // Add report record
      await database.insert(reviewReports).values({
        reviewId: req.params.id,
        userId: req.session.userId,
      });

      // Increment report count
      const [updated] = await database
        .update(marathonReviews)
        .set({
          reportCount: sql`${marathonReviews.reportCount} + 1`,
        })
        .where(eq(marathonReviews.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  return httpServer;
}
