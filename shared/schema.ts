import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const sourceStrategies = ["RSS", "HTML", "API"] as const;
export const syncStatuses = ["running", "retrying", "success", "failed"] as const;

export const sources = pgTable("sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  strategy: text("strategy").notNull(),
  retryMax: integer("retry_max").notNull().default(3),
  retryBackoffSeconds: integer("retry_backoff_seconds").notNull().default(30),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});

export const marathonSyncRuns = pgTable("marathon_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").notNull(),
  status: text("status").notNull(),
  strategyUsed: text("strategy_used").notNull(),
  attempt: integer("attempt").notNull().default(1),
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSourceSchema = createInsertSchema(sources);
export const insertMarathonSyncRunSchema = createInsertSchema(marathonSyncRuns);

export type SourceStrategy = (typeof sourceStrategies)[number];
export type SyncStatus = (typeof syncStatuses)[number];

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sources.$inferSelect;
export type InsertMarathonSyncRun = z.infer<typeof insertMarathonSyncRunSchema>;
export type MarathonSyncRun = typeof marathonSyncRuns.$inferSelect;
