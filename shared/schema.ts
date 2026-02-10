import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  avatarSource: text("avatar_source").default("manual").notNull(),
  wechatOpenId: text("wechat_openid").unique(),
  wechatUnionId: text("wechat_unionid").unique(),
  wechatNickname: text("wechat_nickname"),
  wechatAvatarUrl: text("wechat_avatar_url"),
  isWechatBound: boolean("is_wechat_bound").default(false).notNull(),
  wechatBoundAt: timestamp("wechat_bound_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const marathons = pgTable(
  "marathons",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    canonicalName: text("canonical_name").notNull(),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    websiteUrl: text("website_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("marathons_name_unique").on(table.name),
    canonicalUnique: uniqueIndex("marathons_canonical_unique").on(
      table.canonicalName,
    ),
  }),
);

export const marathonEditions = pgTable(
  "marathon_editions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    marathonId: varchar("marathon_id")
      .references(() => marathons.id)
      .notNull(),
    year: integer("year").notNull(),
    raceDate: date("race_date"),
    registrationStatus: text("registration_status"),
    registrationUrl: text("registration_url"),
    registrationOpenDate: date("registration_open_date"),
    registrationCloseDate: date("registration_close_date"),
    // Per-field provenance for merge/conflict resolution.
    // Example: { raceDate: { sourceId, sourceType, priority, rank, at }, ... }
    fieldSources: jsonb("field_sources").$type<Record<string, unknown> | null>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    editionUnique: uniqueIndex("marathon_editions_unique").on(
      table.marathonId,
      table.year,
    ),
  }),
);

export const sources = pgTable(
  "sources",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    type: text("type").default("official").notNull(),
    strategy: text("strategy").default("HTML").notNull(),
    baseUrl: text("base_url"),
    priority: integer("priority").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    retryMax: integer("retry_max").default(3).notNull(),
    retryBackoffSeconds: integer("retry_backoff_seconds").default(30).notNull(),
    requestTimeoutMs: integer("request_timeout_ms").default(15000).notNull(),
    minIntervalSeconds: integer("min_interval_seconds").default(0).notNull(),
    notes: text("notes"),
    config: jsonb("config").$type<Record<string, unknown> | null>(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("sources_name_unique").on(table.name),
  }),
);

export const marathonSources = pgTable(
  "marathon_sources",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    marathonId: varchar("marathon_id")
      .references(() => marathons.id)
      .notNull(),
    sourceId: varchar("source_id")
      .references(() => sources.id)
      .notNull(),
    sourceUrl: text("source_url").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastHash: text("last_hash"),
    lastHttpStatus: integer("last_http_status"),
    lastError: text("last_error"),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sourceUnique: uniqueIndex("marathon_sources_unique").on(
      table.marathonId,
      table.sourceId,
    ),
  }),
);

export const marathonSyncRuns = pgTable("marathon_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marathonId: varchar("marathon_id")
    .references(() => marathons.id)
    .notNull(),
  sourceId: varchar("source_id")
    .references(() => sources.id)
    .notNull(),
  status: text("status").notNull(),
  strategyUsed: text("strategy_used"),
  attempt: integer("attempt").default(1).notNull(),
  message: text("message"),
  newCount: integer("new_count").default(0).notNull(),
  updatedCount: integer("updated_count").default(0).notNull(),
  unchangedCount: integer("unchanged_count").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});

export const rawCrawlData = pgTable("raw_crawl_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marathonId: varchar("marathon_id")
    .references(() => marathons.id)
    .notNull(),
  sourceId: varchar("source_id")
    .references(() => sources.id)
    .notNull(),
  sourceUrl: text("source_url").notNull(),
  contentType: text("content_type"),
  httpStatus: integer("http_status"),
  rawContent: text("raw_content"),
  contentHash: text("content_hash"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  status: text("status").default("pending").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const marathonReviews = pgTable("marathon_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marathonId: varchar("marathon_id")
    .references(() => marathons.id)
    .notNull(),
  userId: varchar("user_id").references(() => users.id),
  marathonEditionId: varchar("marathon_edition_id").references(
    () => marathonEditions.id,
  ),
  userDisplayName: text("user_display_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  likesCount: integer("likes_count").default(0).notNull(),
  reportCount: integer("report_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reviewLikes = pgTable(
  "review_likes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    reviewId: varchar("review_id")
      .references(() => marathonReviews.id)
      .notNull(),
    userId: varchar("user_id")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    reviewUserUnique: uniqueIndex("review_likes_unique").on(table.reviewId, table.userId),
  }),
);

export const reviewReports = pgTable(
  "review_reports",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    reviewId: varchar("review_id")
      .references(() => marathonReviews.id)
      .notNull(),
    userId: varchar("user_id")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    reviewUserUnique: uniqueIndex("review_reports_unique").on(table.reviewId, table.userId),
  }),
);

export const userFavoriteMarathons = pgTable(
  "user_favorite_marathons",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .references(() => users.id)
      .notNull(),
    marathonId: varchar("marathon_id")
      .references(() => marathons.id)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userMarathonUnique: uniqueIndex("user_favorite_marathons_unique").on(
      table.userId,
      table.marathonId,
    ),
  }),
);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSourceSchema = createInsertSchema(sources).pick({
  name: true,
  type: true,
  strategy: true,
  baseUrl: true,
  priority: true,
  isActive: true,
  retryMax: true,
  retryBackoffSeconds: true,
  requestTimeoutMs: true,
  minIntervalSeconds: true,
  notes: true,
  config: true,
});

export const insertMarathonSchema = createInsertSchema(marathons).pick({
  name: true,
  canonicalName: true,
  city: true,
  country: true,
  description: true,
  websiteUrl: true,
});

export const insertReviewSchema = createInsertSchema(marathonReviews)
  .pick({
    marathonId: true,
    userId: true,
    marathonEditionId: true,
    userDisplayName: true,
    rating: true,
    comment: true,
  })
  .extend({
    rating: z.number().int().min(1).max(5),
  });

export const insertUserFavoriteMarathonSchema = createInsertSchema(
  userFavoriteMarathons,
).pick({
  userId: true,
  marathonId: true,
});

export const insertMarathonSourceSchema = createInsertSchema(marathonSources).pick({
  marathonId: true,
  sourceId: true,
  sourceUrl: true,
  isPrimary: true,
});

export const insertMarathonSyncRunSchema = createInsertSchema(marathonSyncRuns).pick({
  marathonId: true,
  sourceId: true,
  status: true,
  strategyUsed: true,
  attempt: true,
  message: true,
  newCount: true,
  updatedCount: true,
  unchangedCount: true,
  startedAt: true,
  finishedAt: true,
  errorMessage: true,
});

export const insertRawCrawlDataSchema = createInsertSchema(rawCrawlData).pick({
  marathonId: true,
  sourceId: true,
  sourceUrl: true,
  contentType: true,
  httpStatus: true,
  rawContent: true,
  contentHash: true,
  metadata: true,
  status: true,
  processedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sources.$inferSelect;

export type InsertMarathon = z.infer<typeof insertMarathonSchema>;
export type Marathon = typeof marathons.$inferSelect;

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type MarathonReview = typeof marathonReviews.$inferSelect;

export type InsertUserFavoriteMarathon = z.infer<
  typeof insertUserFavoriteMarathonSchema
>;
export type UserFavoriteMarathon = typeof userFavoriteMarathons.$inferSelect;

export type InsertMarathonSource = z.infer<typeof insertMarathonSourceSchema>;
export type MarathonSource = typeof marathonSources.$inferSelect;

export type InsertMarathonSyncRun = z.infer<typeof insertMarathonSyncRunSchema>;
export type MarathonSyncRun = typeof marathonSyncRuns.$inferSelect;

export type InsertRawCrawlData = z.infer<typeof insertRawCrawlDataSchema>;
export type RawCrawlData = typeof rawCrawlData.$inferSelect;
