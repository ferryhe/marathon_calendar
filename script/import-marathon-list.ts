import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { marathonEditions, marathonSources, marathons, sources } from "@shared/schema";

function requireDb() {
  if (!db) {
    console.error("Database not configured. Please set DATABASE_URL environment variable.");
    process.exit(1);
  }
  return db;
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCjk(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function extractUrl(text: string): string | null {
  // Markdown link: [https://...](https://...)
  const md = text.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (md?.[1]) return md[1].trim();
  const raw = text.match(/https?:\/\/[^\s)]+/i);
  if (raw?.[0]) return raw[0].trim().replace(/[.,;]$/, "");
  return null;
}

function normalizeNameForSlug(name: string) {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(TCS|BMW|BMO|Sanlam)\b/gi, " ")
    .replace(/\b(Bank of America)\b/gi, " ")
    .replace(/[⭐🌍🏅🇨🇳🇺🇸🇨🇦🔜]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  const cleaned = normalizeNameForSlug(value).toLowerCase();
  const slug = cleaned
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
  if (slug) return slug;
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function isHexLikeSlug(value: string) {
  return /^[a-f0-9]{10,}$/i.test(value);
}

function urlHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function guessCityFromCnName(name: string) {
  const trimmed = name.trim();
  const suffixes = [
    "马拉松",
    "半程马拉松",
    "全程马拉松",
    "滨水马拉松",
    "越野赛",
    "半马",
  ];
  for (const s of suffixes) {
    if (trimmed.endsWith(s)) {
      const base = trimmed.slice(0, -s.length).trim();
      if (base.length >= 2 && base.length <= 6) return base;
      break;
    }
  }
  return null;
}

type ParsedMarathon = {
  name: string;
  nameEn: string | null;
  websiteUrl: string;
  country: string | null;
  canonicalName: string;
  city: string | null;
};

function parseMarathonListMarkdown(markdown: string): ParsedMarathon[] {
  const lines = markdown.split(/\r?\n/);
  let currentCountry: string | null = null;
  const results: ParsedMarathon[] = [];
  const seenCanonical = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("##") && line.includes("中国")) {
      currentCountry = "China";
      continue;
    }
    if (line.startsWith("##") && !line.includes("中国")) {
      currentCountry = null;
      continue;
    }

    if (!line.startsWith("|")) continue;
    if (!line.includes("http")) continue;
    if (line.includes(":---")) continue;

    const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;

    const urlCell = cells.find((c) => c.includes("http"));
    const websiteUrl = urlCell ? extractUrl(urlCell) : null;
    if (!websiteUrl) continue;

    const nameCell = cells[0] ?? "";
    const normalizedNameCell = stripMarkdown(nameCell);
    const parts = normalizedNameCell
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    const first = parts[0] ?? "";
    const second = parts.length >= 2 ? parts[1] : "";

    const nameCnCandidate = hasCjk(first) ? first : hasCjk(second) ? second : "";
    const nameEnCandidate = !hasCjk(first) ? first : !hasCjk(second) ? second : "";

    const name = (nameCnCandidate || first || second || websiteUrl).trim();
    const nameEn = nameEnCandidate ? nameEnCandidate.trim() : null;

    let canonicalBase = slugify(nameEn ?? name);
    if (isHexLikeSlug(canonicalBase)) {
      const host = urlHostname(websiteUrl);
      if (host) {
        canonicalBase = slugify(host);
      }
    }
    // Keep consistent with current seed pattern: append "-2026".
    let canonicalName = `${canonicalBase}-2026`;
    if (seenCanonical.has(canonicalName)) {
      const h = crypto
        .createHash("sha1")
        .update(`${canonicalName}|${websiteUrl}`)
        .digest("hex")
        .slice(0, 6);
      canonicalName = `${canonicalBase}-2026-${h}`;
    }
    seenCanonical.add(canonicalName);

    results.push({
      name,
      nameEn,
      websiteUrl,
      country: currentCountry,
      canonicalName,
      city: hasCjk(name) ? guessCityFromCnName(name) : null,
    });
  }

  return results;
}

async function main() {
  const database = requireDb();

  const fileArg = process.argv[2] ?? "docs/marathon list.txt";
  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`Input file not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const parsed = parseMarathonListMarkdown(content);
  if (parsed.length === 0) {
    console.error("No marathons parsed. Check the markdown format.");
    process.exit(1);
  }

  const [officialSource] = await database
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.name, "赛事官方网站（直采）"))
    .limit(1);
  const officialSourceId = officialSource?.id ?? null;

  const now = new Date();
  let upserted = 0;
  let linked = 0;

  for (const item of parsed) {
    const [row] = await database
      .insert(marathons)
      .values({
        name: item.name,
        canonicalName: item.canonicalName,
        city: item.city,
        country: item.country,
        description: item.nameEn ? `EN: ${item.nameEn}` : null,
        websiteUrl: item.websiteUrl,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marathons.canonicalName,
        set: {
          name: item.name,
          city: item.city,
          country: item.country,
          description: item.nameEn ? `EN: ${item.nameEn}` : null,
          websiteUrl: item.websiteUrl,
          updatedAt: now,
        },
      })
      .returning({ id: marathons.id, canonicalName: marathons.canonicalName });

    upserted += 1;

    // Ensure a placeholder edition for the year 2026, so it shows up consistently in the UI.
    await database
      .insert(marathonEditions)
      .values({
        marathonId: row.id,
        year: 2026,
        raceDate: null,
        registrationStatus: null,
        registrationUrl: null,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [marathonEditions.marathonId, marathonEditions.year],
      });

    if (officialSourceId) {
      await database
        .insert(marathonSources)
        .values({
          marathonId: row.id,
          sourceId: officialSourceId,
          sourceUrl: item.websiteUrl,
          isPrimary: true,
          lastCheckedAt: null,
        })
        .onConflictDoUpdate({
          target: [marathonSources.marathonId, marathonSources.sourceId],
          set: {
            sourceUrl: item.websiteUrl,
            isPrimary: true,
          },
        });
      linked += 1;
    }
  }

  console.log(
    `Done. parsed=${parsed.length} upserted=${upserted} linkedToOfficialSource=${linked} officialSourceId=${officialSourceId ?? "null"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
