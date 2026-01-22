import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
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
    baseUrl: text("base_url"),
    priority: integer("priority").default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
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
  sourceId: varchar("source_id").references(() => sources.id),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});

export const marathonReviews = pgTable("marathon_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marathonId: varchar("marathon_id")
    .references(() => marathons.id)
    .notNull(),
  marathonEditionId: varchar("marathon_edition_id").references(
    () => marathonEditions.id,
  ),
  userDisplayName: text("user_display_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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
    marathonEditionId: true,
    userDisplayName: true,
    rating: true,
    comment: true,
  })
  .extend({
    rating: z.number().int().min(1).max(5),
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMarathon = z.infer<typeof insertMarathonSchema>;
export type Marathon = typeof marathons.$inferSelect;

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type MarathonReview = typeof marathonReviews.$inferSelect;
