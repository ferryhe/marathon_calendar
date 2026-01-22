import {
  type InsertMarathonSyncRun,
  type InsertSource,
  type InsertUser,
  type MarathonSyncRun,
  type Source,
  type SyncStatus,
  type User,
} from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listActiveSourcesByPriority(): Promise<Source[]>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: string, updates: Partial<Source>): Promise<Source | undefined>;
  createSyncRun(run: InsertMarathonSyncRun): Promise<MarathonSyncRun>;
  updateSyncRun(
    id: string,
    updates: Partial<MarathonSyncRun>,
  ): Promise<MarathonSyncRun | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private sources: Map<string, Source>;
  private syncRuns: Map<string, MarathonSyncRun>;

  constructor() {
    this.users = new Map();
    this.sources = new Map();
    this.syncRuns = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async listActiveSourcesByPriority(): Promise<Source[]> {
    return Array.from(this.sources.values())
      .filter((source) => source.isActive)
      .sort((a, b) => b.priority - a.priority);
  }

  async createSource(insertSource: InsertSource): Promise<Source> {
    const id = randomUUID();
    const source: Source = {
      id,
      name: insertSource.name,
      priority: insertSource.priority ?? 0,
      strategy: insertSource.strategy,
      retryMax: insertSource.retryMax ?? 3,
      retryBackoffSeconds: insertSource.retryBackoffSeconds ?? 30,
      isActive: insertSource.isActive ?? true,
      lastRunAt: insertSource.lastRunAt ?? null,
      createdAt: insertSource.createdAt ?? new Date(),
    };
    this.sources.set(id, source);
    return source;
  }

  async updateSource(id: string, updates: Partial<Source>): Promise<Source | undefined> {
    const existing = this.sources.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = { ...existing, ...updates };
    this.sources.set(id, updated);
    return updated;
  }

  async createSyncRun(insertRun: InsertMarathonSyncRun): Promise<MarathonSyncRun> {
    const id = randomUUID();
    const run: MarathonSyncRun = {
      id,
      sourceId: insertRun.sourceId,
      status: insertRun.status as SyncStatus,
      strategyUsed: insertRun.strategyUsed,
      attempt: insertRun.attempt ?? 1,
      message: insertRun.message ?? null,
      startedAt: insertRun.startedAt ?? new Date(),
      finishedAt: insertRun.finishedAt ?? null,
    };
    this.syncRuns.set(id, run);
    return run;
  }

  async updateSyncRun(
    id: string,
    updates: Partial<MarathonSyncRun>,
  ): Promise<MarathonSyncRun | undefined> {
    const existing = this.syncRuns.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = { ...existing, ...updates };
    this.syncRuns.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
