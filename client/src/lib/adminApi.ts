type AdminFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

const ADMIN_TOKEN_STORAGE_KEY = "mc_admin_token";

export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(token: string) {
  try {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore
  }
}

async function adminRequest<T>(
  token: string,
  endpoint: string,
  options?: AdminFetchOptions,
): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export type AdminSource = {
  id: string;
  name: string;
  type: string;
  strategy: string;
  baseUrl: string | null;
  priority: number;
  isActive: boolean;
  retryMax: number;
  retryBackoffSeconds: number;
  requestTimeoutMs: number;
  minIntervalSeconds: number;
  notes: string | null;
  config: Record<string, unknown> | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminMarathonSource = {
  id: string;
  marathonId: string;
  sourceId: string;
  sourceUrl: string;
  isPrimary: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  marathonName: string;
  canonicalName: string;
  sourceName: string;
};

export type AdminSyncRun = {
  id: string;
  marathonId: string;
  sourceId: string;
  status: string;
  strategyUsed: string | null;
  attempt: number;
  message: string | null;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type AdminRawCrawl = {
  id: string;
  marathonId: string;
  sourceId: string;
  sourceUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  contentHash: string | null;
  status: string;
  fetchedAt: string;
  processedAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type AdminRawCrawlDetail = AdminRawCrawl & {
  rawContent: string | null;
  rawContentTruncated: boolean;
};

export type AdminMarathon = {
  id: string;
  name: string;
  canonicalName: string;
  city: string | null;
  country: string | null;
  websiteUrl: string | null;
};

export type AdminDiscoveryWebResult = {
  title: string;
  url: string;
  description: string | null;
};

export type AdminStats = {
  now: string;
  since24h: string;
  sources: { total: number; active: number };
  marathonSources: { total: number };
  raw: {
    byStatus: Array<{ status: string; count: number }>;
    last24hByStatus: Array<{ status: string; count: number }>;
  };
  runs: {
    last24hByStatus: Array<{ status: string; count: number }>;
  };
};

export async function listAdminSources(token: string) {
  return adminRequest<{ data: AdminSource[] }>(token, "/admin/sources");
}

export async function getAdminStats(token: string) {
  return adminRequest<{ data: AdminStats }>(token, "/admin/stats");
}

export async function updateAdminSource(
  token: string,
  id: string,
  payload: Partial<
    Pick<
      AdminSource,
      | "name"
      | "type"
      | "strategy"
      | "baseUrl"
      | "priority"
      | "isActive"
      | "retryMax"
      | "retryBackoffSeconds"
      | "requestTimeoutMs"
      | "minIntervalSeconds"
      | "notes"
      | "config"
    >
  >,
) {
  return adminRequest<{ data: AdminSource }>(token, `/admin/sources/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function runAdminSyncAll(token: string) {
  return adminRequest<{ success: boolean }>(token, "/admin/sync/run-all", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function runAdminSyncMarathonSource(token: string, marathonSourceId: string) {
  return adminRequest<{ data: { runId: string; status: string } }>(
    token,
    "/admin/sync/run-marathon-source",
    {
      method: "POST",
      body: JSON.stringify({ marathonSourceId }),
    },
  );
}

export async function lookupAdminMarathonSource(
  token: string,
  params: { marathonId: string; sourceId: string },
) {
  const query = new URLSearchParams({
    marathonId: params.marathonId,
    sourceId: params.sourceId,
  });
  return adminRequest<{
    data: { id: string; marathonId: string; sourceId: string; sourceUrl: string; isPrimary: boolean };
  }>(token, `/admin/marathon-sources/lookup?${query.toString()}`);
}

export async function listAdminSyncRuns(token: string, limit: number = 50) {
  return adminRequest<{ data: AdminSyncRun[] }>(token, `/admin/sync/runs?limit=${limit}`);
}

export async function listAdminRawCrawl(token: string, limit: number = 50) {
  return adminRequest<{ data: AdminRawCrawl[] }>(token, `/admin/raw-crawl?limit=${limit}`);
}

export async function listAdminRawCrawlFiltered(
  token: string,
  params: { limit?: number; status?: string },
) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);
  return adminRequest<{ data: AdminRawCrawl[] }>(token, `/admin/raw-crawl?${query.toString()}`);
}

export async function getAdminRawCrawl(token: string, id: string, full: boolean = false) {
  return adminRequest<{ data: AdminRawCrawlDetail }>(
    token,
    `/admin/raw-crawl/${id}?full=${full ? "true" : "false"}`,
  );
}

export type AdminAiRuleTemplateResponse = {
  template: {
    extract: {
      raceDate?: { selector: string; attr?: string; regex?: string; group?: number };
      registrationStatus?: { selector: string; attr?: string; regex?: string; group?: number };
      registrationUrl?: { selector: string; attr?: string; regex?: string; group?: number };
    };
    notes?: string;
    evidence?: Record<string, string | undefined>;
  };
  preview: {
    raceDateRaw: string | null;
    raceDateNormalized: string | null;
    registrationStatusRaw: string | null;
    registrationUrlRaw: string | null;
  };
  model: string | null;
};

export async function generateAdminAiRuleTemplate(token: string, rawCrawlId: string) {
  return adminRequest<{ data: AdminAiRuleTemplateResponse }>(
    token,
    `/admin/raw-crawl/${rawCrawlId}/ai-rule-template`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function ignoreAdminRawCrawl(token: string, id: string) {
  return adminRequest<{ success: boolean }>(token, `/admin/raw-crawl/${id}/ignore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function resolveAdminRawCrawl(
  token: string,
  id: string,
  payload: {
    year?: number;
    raceDate?: string;
    registrationStatus?: string | null;
    registrationUrl?: string | null;
    note?: string;
    publish?: boolean;
  },
) {
  return adminRequest<{ data: any }>(token, `/admin/raw-crawl/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminMarathonSources(
  token: string,
  params?: { limit?: number; sourceId?: string; search?: string },
) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.sourceId) query.set("sourceId", params.sourceId);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return adminRequest<{ data: AdminMarathonSource[] }>(
    token,
    `/admin/marathon-sources${qs ? `?${qs}` : ""}`,
  );
}

export async function listAdminMarathons(
  token: string,
  params?: { limit?: number; search?: string },
) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return adminRequest<{ data: AdminMarathon[] }>(token, `/admin/marathons${qs ? `?${qs}` : ""}`);
}

export async function upsertAdminMarathonSource(
  token: string,
  payload: { marathonId: string; sourceId: string; sourceUrl: string; isPrimary?: boolean },
) {
  return adminRequest<{ data: any }>(token, "/admin/marathon-sources", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminDiscoveryWebSearch(
  token: string,
  params: { q: string; count?: number },
) {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.count) query.set("count", String(params.count));
  return adminRequest<{ data: AdminDiscoveryWebResult[] }>(
    token,
    `/admin/discovery/web-search?${query.toString()}`,
  );
}
