import crypto from "crypto";

type AiExtractResult = {
  raceDate: string | null;
  registrationStatus: string | null;
  registrationUrl: string | null;
  raw: unknown;
};

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const yyyy = Number(iso[1]);
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      date.getUTCFullYear() === yyyy &&
      date.getUTCMonth() === mm - 1 &&
      date.getUTCDate() === dd
    ) {
      return `${String(yyyy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  const cn = trimmed.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cn) {
    const yyyy = Number(cn[1]);
    const mm = Number(cn[2]);
    const dd = Number(cn[3]);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      date.getUTCFullYear() === yyyy &&
      date.getUTCMonth() === mm - 1 &&
      date.getUTCDate() === dd
    ) {
      return `${String(yyyy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function contentFingerprint(text: string) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

export function isAiFallbackEnabled() {
  return process.env.AI_ENABLE_FALLBACK === "true";
}

export async function aiExtractFromHtml(params: {
  pageUrl: string;
  html: string;
}): Promise<AiExtractResult | null> {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) return null;
  if (!isAiFallbackEnabled()) return null;

  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const maxChars = 80_000;
  const snippet = params.html.length > maxChars ? params.html.slice(0, maxChars) : params.html;

  const prompt = [
    "You are extracting structured marathon event info from an HTML page.",
    "Return JSON ONLY with keys: raceDate, registrationStatus, registrationUrl.",
    "raceDate must be YYYY-MM-DD or null.",
    "registrationStatus should be a short string (e.g. open/closed/not-open/sold-out/unknown) or null.",
    "registrationUrl must be an absolute URL or null.",
    `pageUrl: ${params.pageUrl}`,
    `htmlFingerprint: ${contentFingerprint(snippet)}`,
    "html:",
    snippet,
  ].join("\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You output JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const raceDateRaw = typeof parsed?.raceDate === "string" ? parsed.raceDate : null;
  const raceDate = raceDateRaw ? normalizeDate(raceDateRaw) : null;
  const registrationStatus =
    typeof parsed?.registrationStatus === "string" && parsed.registrationStatus.trim()
      ? parsed.registrationStatus.trim()
      : null;
  const registrationUrl =
    typeof parsed?.registrationUrl === "string" && parsed.registrationUrl.trim()
      ? parsed.registrationUrl.trim()
      : null;

  return {
    raceDate,
    registrationStatus,
    registrationUrl,
    raw: parsed,
  };
}
