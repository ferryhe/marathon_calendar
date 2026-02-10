type BraveWebSearchResult = {
  title: string;
  url: string;
  description: string | null;
};

export async function braveWebSearch(params: {
  query: string;
  count?: number;
}): Promise<BraveWebSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_API_KEY is not configured");
  }

  const q = params.query.trim();
  if (!q) return [];
  const count = Math.max(1, Math.min(params.count ?? 10, 20));

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", q);
  url.searchParams.set("count", String(count));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Brave search failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  const payload = (await response.json().catch(() => null)) as any;
  const results = payload?.web?.results;
  if (!Array.isArray(results)) return [];

  return results
    .map((r: any) => ({
      title: typeof r?.title === "string" ? r.title : "",
      url: typeof r?.url === "string" ? r.url : "",
      description: typeof r?.description === "string" ? r.description : null,
    }))
    .filter((r: BraveWebSearchResult) => r.title && r.url);
}

