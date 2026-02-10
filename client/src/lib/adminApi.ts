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
};

export type AdminDiscoveryWebResult = {
  title: string;
  url: string;
  description: string | null;
};

export async function listAdminSources(token: string) {
  return adminRequest<{ data: AdminSource[] }>(token, "/admin/sources");
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

export async function listAdminSyncRuns(token: string, limit: number = 50) {
  return adminRequest<{ data: AdminSyncRun[] }>(token, `/admin/sync/runs?limit=${limit}`);
}

export async function listAdminRawCrawl(token: string, limit: number = 50) {
  return adminRequest<{ data: AdminRawCrawl[] }>(token, `/admin/raw-crawl?limit=${limit}`);
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
