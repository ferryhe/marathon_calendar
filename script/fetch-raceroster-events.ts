import * as fs from "fs";

const INPUT = "/tmp/rr-marathon-clean.txt";
const OUTPUT = "/tmp/rr-events.tsv";
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 12000;

const ISO_TO_NAME: Record<string, string> = {
  AR: "Argentina", AT: "Austria", AU: "Australia",
  BO: "Bolivia", BR: "Brazil",
  CA: "Canada", CH: "Switzerland", CL: "Chile", CN: "China",
  CO: "Colombia", CR: "Costa Rica", CY: "Cyprus", CZ: "Czech Republic",
  DE: "Germany", DK: "Denmark", DO: "Dominican Republic",
  EC: "Ecuador", ES: "Spain",
  FI: "Finland", FR: "France",
  GB: "UK", GT: "Guatemala",
  HK: "Hong Kong", HU: "Hungary",
  ID: "Indonesia", IE: "Ireland", IN: "India", IT: "Italy",
  JP: "Japan",
  KE: "Kenya", KH: "Cambodia", KR: "South Korea",
  LK: "Sri Lanka",
  MO: "Macau", MX: "Mexico", MY: "Malaysia", MR: "Mauritania",
  NL: "Netherlands", NO: "Norway", NZ: "New Zealand",
  PA: "Panama", PE: "Peru", PH: "Philippines", PL: "Poland",
  PT: "Portugal", PY: "Paraguay",
  RO: "Romania", RW: "Rwanda",
  SE: "Sweden", SG: "Singapore",
  TH: "Thailand", TR: "Turkey", TW: "Taiwan",
  US: "USA",
  VN: "Vietnam",
  ZA: "South Africa",
};

interface Extracted {
  rrId: string;
  rrUrl: string;
  name: string;
  locality: string;
  country: string;
  countryCode: string;
  startDate: string;
  image: string;
  externalWebsite: string;
  description: string;
}

function parseEvent(html: string, url: string): Extracted | null {
  const ldMatch = html.match(
    /<script type="application\/ld\+json">([\s\S]+?)<\/script>/,
  );
  if (!ldMatch) return null;
  let ld: any;
  try {
    ld = JSON.parse(ldMatch[1].trim());
  } catch {
    return null;
  }
  if (ld["@type"] !== "Event") return null;

  const idMatch = url.match(/\/events\/\d+\/(\d+)\//);
  const rrId = idMatch ? idMatch[1] : "";

  const addr = ld.location?.address ?? {};
  const countryCode = (addr.addressCountry ?? "").toUpperCase();
  const country = ISO_TO_NAME[countryCode] ?? countryCode;
  const locality = addr.addressLocality ?? "";

  let externalWebsite = "";
  for (const m of html.matchAll(
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>(?:[^<]*Click here[^<]*|[^<]*Website[^<]*|\s*)<\/a>/gi,
  )) {
    const href = m[1];
    if (
      href.includes("raceroster.com") ||
      href.includes("cdn.raceroster.com") ||
      href.includes("google.com/maps") ||
      href.includes("twitter.com") ||
      href.includes("facebook.com") ||
      href.includes("instagram.com") ||
      href.includes("youtube.com") ||
      href.includes("strava.com") ||
      href.includes("mailto:") ||
      href.length > 250
    )
      continue;
    externalWebsite = href;
    break;
  }

  return {
    rrId,
    rrUrl: url,
    name: (ld.name ?? "").trim(),
    locality: locality.trim(),
    country,
    countryCode,
    startDate: ld.startDate ?? "",
    image: ld.image ?? "",
    externalWebsite,
    description: (ld.description ?? "").trim().replace(/[\t\n\r]+/g, " "),
  };
}

async function fetchWithTimeout(url: string, ms: number): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 marathoncalendar-bot" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function processOne(url: string): Promise<Extracted | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const html = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!html) {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    return parseEvent(html, url);
  }
  return null;
}

async function main() {
  const urls = fs
    .readFileSync(INPUT, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("<loc>"))
    .map((l) => l.replace(/^<loc>|<\/loc>$/g, ""));

  console.log(`Fetching ${urls.length} Race Roster event pages…`);

  const out: (Extracted | null)[] = new Array(urls.length).fill(null);
  let done = 0;
  let okCount = 0;

  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= urls.length) return;
      const ev = await processOne(urls[i]);
      out[i] = ev;
      done++;
      if (ev) okCount++;
      if (done % 25 === 0 || done === urls.length) {
        console.log(`  [${done}/${urls.length}] ok=${okCount}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const cols = [
    "rrId",
    "rrUrl",
    "name",
    "locality",
    "country",
    "countryCode",
    "startDate",
    "image",
    "externalWebsite",
    "description",
  ];
  const lines = [cols.join("\t")];
  for (const ev of out) {
    if (!ev) continue;
    lines.push(
      cols
        .map((c) => String((ev as any)[c]).replace(/[\t\n\r]/g, " "))
        .join("\t"),
    );
  }
  fs.writeFileSync(OUTPUT, lines.join("\n"));
  console.log(`\nDone. Saved ${lines.length - 1} events → ${OUTPUT}`);

  const codes = new Map<string, number>();
  for (const ev of out)
    if (ev) codes.set(ev.country, (codes.get(ev.country) ?? 0) + 1);
  console.log(
    "\nCountry distribution:",
    [...codes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
