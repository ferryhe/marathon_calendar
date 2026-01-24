export interface RawEvent {
  name: string;
  city: string;
  date: string | Date;
  registrationUrl?: string;
  status?: string;
  [key: string]: any;
}

export interface ParsedEvent {
  canonicalName: string;
  name: string;
  city: string;
  date: Date;
  registrationUrl: string;
  registrationStatus: 'open' | 'closed' | 'sold-out' | 'unknown';
  country?: string;
  description?: string;
  websiteUrl?: string;
  metadata: Record<string, any>;
}

export interface ChangeDetection {
  hasChanges: boolean;
  changes: Record<string, { old: any; new: any }>;
  requiresUpdate: boolean;
  changesSummary?: string;
}

export interface CrawlerSource {
  sourceId: string;
  name: string;
  baseUrl: string;
  strategy: 'RSS' | 'HTML' | 'API';
  priority: number;
  fetchEvents(): Promise<RawEvent[]>;
  parseEvent(raw: RawEvent): ParsedEvent;
}

export interface SyncRunLog {
  sourceId: string;
  status: 'running' | 'success' | 'failed' | 'retrying';
  totalEvents: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorMessage?: string;
  startedAt: Date;
  finishedAt?: Date;
}