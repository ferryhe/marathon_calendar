import crypto from "crypto";
import { z } from "zod";
import { load } from "cheerio";

type HtmlExtractRule = {
  selector: string;
  attr?: string;
  regex?: string;
  group?: number;
};

const ruleSchema = z.object({
  selector: z.string().min(1),
  attr: z.string().min(1).optional(),
  regex: z.string().min(1).optional(),
  group: z.number().int().min(0).max(20).optional(),
});

const templateSchema = z.object({
  extract: z
    .object({
      raceDate: ruleSchema.optional(),
      registrationStatus: ruleSchema.optional(),
      registrationUrl: ruleSchema.optional(),
    })
    .strict(),
  notes: z.string().optional(),
  evidence: z
    .object({
      raceDate: z.string().optional(),
      registrationStatus: z.string().optional(),
      registrationUrl: z.string().optional(),
    })
    .optional(),
});

function contentFingerprint(text: string) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

function normalizeDetectedMimeAttr(attr?: string) {
  if (!attr) return undefined;
  return attr;
}

function applyRuleToFirstMatch(html: string, pageUrl: string, rule: HtmlExtractRule): string | null {
  const $ = load(html);
  const el = $(rule.selector).first();
  if (!el || el.length === 0) return null;
  const attr = normalizeDetectedMimeAttr(rule.attr);
  const rawValue =
    !attr || attr === "text"
      ? el.text()
      : attr === "html"
        ? el.html() ?? ""
        : el.attr(attr) ?? "";
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return null;

  if (!rule.regex) {
    return trimmed;
  }

  try {
    const re = new RegExp(rule.regex, "i");
    const match = trimmed.match(re);
    if (!match) return null;
    const index = rule.group ?? 1;
    return (match[index] ?? "").trim() || null;
  } catch {
    return null;
  }
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const yyyy = Number(iso[1]);
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (date.getUTCFullYear() === yyyy && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd) {
      return `${String(yyyy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  const cn = trimmed.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cn) {
    const yyyy = Number(cn[1]);
    const mm = Number(cn[2]);
    const dd = Number(cn[3]);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (date.getUTCFullYear() === yyyy && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd) {
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

export function isAiRuleGenEnabled() {
  return process.env.AI_ENABLE_RULE_GEN === "true";
}

export async function aiGenerateExtractTemplateFromHtml(params: {
  pageUrl: string;
  html: string;
}): Promise<z.infer<typeof templateSchema>> {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) {
    throw new Error("AI is not configured (AI_API_KEY/AI_MODEL)");
  }
  if (!isAiRuleGenEnabled()) {
    throw new Error("AI rule generation is disabled (AI_ENABLE_RULE_GEN=false)");
  }

  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const maxChars = 80_000;
  const snippet = params.html.length > maxChars ? params.html.slice(0, maxChars) : params.html;

  const prompt = [
    "You generate a CSS selector + attr + optional regex extraction template for a marathon event page.",
    "Return JSON ONLY with keys: extract, notes, evidence.",
    "extract keys may include: raceDate, registrationStatus, registrationUrl.",
    "Each rule is: { selector, attr?, regex?, group? }.",
    "attr is one of: text, html, href, content, value, or any HTML attribute name.",
    "Prefer stable selectors (meta tags, semantic attributes, rel, microdata, IDs) over long class chains.",
    "If the extracted value contains extra text, include regex/group to capture only the target portion.",
    "Do NOT invent values. The selectors must exist in the HTML snippet.",
    "evidence should include a short snippet you used (<=200 chars) for each field you attempted.",
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
        { role: "system", content: "You output JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI response missing content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI response is not valid JSON");
  }

  return templateSchema.parse(parsed);
}

export function previewExtractTemplate(params: {
  pageUrl: string;
  html: string;
  template: z.infer<typeof templateSchema>;
}) {
  const raceDateRaw = params.template.extract.raceDate
    ? applyRuleToFirstMatch(params.html, params.pageUrl, params.template.extract.raceDate)
    : null;
  const registrationStatusRaw = params.template.extract.registrationStatus
    ? applyRuleToFirstMatch(params.html, params.pageUrl, params.template.extract.registrationStatus)
    : null;
  const registrationUrlRaw = params.template.extract.registrationUrl
    ? applyRuleToFirstMatch(params.html, params.pageUrl, params.template.extract.registrationUrl)
    : null;

  return {
    raceDateRaw,
    raceDateNormalized: raceDateRaw ? normalizeDate(raceDateRaw) : null,
    registrationStatusRaw,
    registrationUrlRaw,
  };
}

