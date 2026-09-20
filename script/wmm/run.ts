/**
 * 官网数据线（official-sites）**统一入口** —— 所有站点共用这一套流程，加站不改这里。
 *
 *   # 单站
 *   npx tsx script/wmm/run.ts --site=london  [--json=/tmp/london.json] [--html=/tmp/page.html] [--today=YYYY-MM-DD] [--check-db]
 *   # 八站巡检（一条命令看全部；与库不一致会以退出码 2 结束）
 *   npx tsx script/wmm/run.ts --all --check-db
 *   # 列出已注册站点
 *   npx tsx script/wmm/run.ts --list
 *
 * 只读：抓页面 + 解析（可选 --check-db 只做 SELECT），**不写库**。
 */
import { existsSync, readFileSync } from "node:fs";
// DATABASE_URL 所在文件：优先环境变量 → 当前目录 .env → 部署目录 .env
// （源码目录 /data/disk/opt/marathon_calendar-src 没有 .env；部署目录 /data/disk/opt/marathon_calendar 才有，
//   与 systemd 的 EnvironmentFile 一致）
function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    process.env.MARATHON_ENV_FILE,
    ".env",
    "/data/disk/opt/marathon_calendar/.env",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
    if (process.env.DATABASE_URL) return;
  }
}
loadEnv();
import { arg, fetchHtml, fetchWithCurl, pageFromFile, pickRaceDates } from "./lib.js";
import { SITES, bySlug, type SiteDescriptor } from "./sites/index.js";
import type { SiteRunResult } from "./sites/types.js";

const FETCH_STRATEGY: Record<string, string> = {
  curl: "系统 curl（默认）",
  fetch: "Node 内置 fetch",
  browser: "需真实浏览器存页面后 --html= 喂入",
};

export async function runSite(
  site: SiteDescriptor,
  opts: { today: string; htmlFile?: string },
): Promise<SiteRunResult> {
  const htmlFile = opts.htmlFile;
  const pages: SiteRunResult["pages"] = [];
  const texts: string[] = [];

  if (htmlFile) {
    const p = await pageFromFile(htmlFile);
    pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
    if (p.text) texts.push(p.text);
    console.error(`# ${site.slug}: 使用本地页面文件 ${htmlFile}（${p.bytes} bytes）`);
  } else {
    const strategy = site.fetch ?? "curl";
    for (const url of site.pages) {
      const p = strategy === "fetch" ? await fetchHtml(url) : await fetchWithCurl(url);
      pages.push({ url: p.url, status: p.status, bytes: p.bytes, textChars: p.textChars, error: p.error });
      if (p.text) texts.push(p.text);
    }
    if (strategy === "browser") {
      console.error(`# ${site.slug}: 本站对命令行抓取会被挡（见站点描述符 notes），建议用 --html=<浏览器存下的页面>`);
    }
  }

  const picked = pickRaceDates(texts.join(" "), opts.today, {
    mainEventHint: site.mainEventHint,
    twoDayPick: site.twoDayPick,
  });
  const pageText = texts.join(" ");
  const hintMissed = picked.notes.some((n) => n.includes("主赛事关键词"));

  const chosen = picked.chosen
    ? {
        date: picked.chosen.date,
        dateEnd: picked.chosen.dateEnd,
        kind: picked.chosen.kind,
        year: picked.chosen.year,
        evidence: picked.chosen.evidence,
      }
    : null;

  return {
    site: site.slug,
    canonicalName: site.canonicalName,
    officialUrl: site.officialUrl,
    dateSource: site.dateSource,
    fetchStrategy: FETCH_STRATEGY[site.fetch ?? "curl"] ?? String(site.fetch),
    fetchedAt: new Date().toISOString(),
    today: opts.today,
    pages,
    chosen,
    twoDay: picked.twoDay,
    notes: [
      ...picked.notes,
      ...(hintMissed && site.mainEventHint.test(pageText)
        ? [`说明：日期附近未出现主赛事关键词，但整页提到过 ${site.name}`]
        : []),
      ...(site.notes ?? []),
    ],
    allCandidates: picked.allCandidates,
    droppedCandidates: picked.droppedCandidates,
    counts: { all: picked.allCandidates.length, dropped: picked.droppedCandidates.length },
  };
}

/** 与库里对照（只 SELECT）：返回 [库里该赛事各届文本, 结论] */
export async function dbCompare(
  site: SiteDescriptor,
  chosen: SiteRunResult["chosen"],
): Promise<{ db: string; verdict: string; ok: boolean }> {
  const url = process.env.DATABASE_URL;
  if (!url) return { db: "", verdict: "未做库对照（未设置 DATABASE_URL）", ok: true };
  const { Client } = await import("pg");
  const c = new Client({ connectionString: url });
  try {
    await c.connect();
    const r = await c.query(
      // 用 to_char 直接拿文本：DATE 经 pg 驱动会变成 JS Date，
      // 再 toISOString() 在东八区会**退一天**（实测：2027-04-24 → 2027-04-23）
      `select e.year, to_char(e.race_date, 'YYYY-MM-DD') as race_date,
              to_char(e.race_end_date, 'YYYY-MM-DD') as race_end_date
         from marathon_editions e join marathons m on m.id = e.marathon_id
        where m.canonical_name = $1 order by e.year`,
      [site.canonicalName],
    );
    const fmt = (v: any): string => (v == null ? "" : String(v).slice(0, 10));
    const db = r.rows
      .map((x: any) => `${x.year}:${fmt(x.race_date)}${x.race_end_date ? "/" + fmt(x.race_end_date) : ""}`)
      .join(" ");
    if (!chosen) return { db, verdict: "读取器没取到日期（见 notes）", ok: false };
    const hit = r.rows.find((x: any) => fmt(x.race_date) === chosen.date);
    if (!hit) return { db, verdict: `库里没有 ${chosen.date} 这一日期 → 需人工确认是否新增/修正`, ok: false };
    const dbEnd = hit.race_end_date ? fmt(hit.race_end_date) : undefined;
    if ((chosen.dateEnd ?? undefined) !== dbEnd) {
      return { db, verdict: `日期一致但末日不同（读取器 ${chosen.dateEnd ?? "无"} / 库 ${dbEnd ?? "无"}）`, ok: false };
    }
    return { db, verdict: "一致" + (chosen.dateEnd ? "（含末日）" : ""), ok: true };
  } catch (e) {
    return { db: "", verdict: `库对照失败：${e instanceof Error ? e.message : String(e)}`, ok: true };
  } finally {
    await c.end().catch(() => {});
  }
}

export async function runSiteCli(site: SiteDescriptor): Promise<void> {
  const today = arg("today") ?? new Date().toISOString().slice(0, 10);
  const res = await runSite(site, { today, htmlFile: arg("html") });
  let ok = Boolean(res.chosen);
  if (process.argv.includes("--check-db")) {
    const cmp = await dbCompare(site, res.chosen);
    res.notes.push(`库对照：${cmp.verdict}${cmp.db ? `　（库中：${cmp.db}）` : ""}`);
    ok = ok && cmp.ok;
  }
  console.log(JSON.stringify(res, null, 1));
  const out = arg("json");
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
    console.error(`# 已写入 ${out}`);
  }
  if (!ok) process.exitCode = 2;
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const only = arg("site");
  if (process.argv.includes("--list")) {
    for (const s of SITES) console.log(`${s.index}  ${s.slug.padEnd(10)} ${s.name}　[${s.canonicalName}]　取页: ${FETCH_STRATEGY[s.fetch ?? "curl"]}`);
    return;
  }
  const today = arg("today") ?? new Date().toISOString().slice(0, 10);
  const htmlDir = arg("html-dir");
  const targets = all ? SITES : only ? [bySlug(only)].filter(Boolean) as SiteDescriptor[] : [];
  if (targets.length === 0) {
    console.error("用法：--site=<slug> | --all | --list　（可加 --check-db / --json= / --html= / --today=）");
    process.exitCode = 3;
    return;
  }
  if (!all) {
    await runSiteCli(targets[0]);
    return;
  }
  // 八站巡检
  const rows: string[][] = [];
  let bad = 0;
  for (const site of targets) {
    const page = htmlDir && existsSync(`${htmlDir}/${site.slug}.html`) ? `${htmlDir}/${site.slug}.html` : undefined;
    const res = await runSite(site, { today, htmlFile: page });
    let verdict = res.chosen ? `${res.chosen.date}${res.chosen.dateEnd ? "/" + res.chosen.dateEnd : ""}` : "读不到";
    if (process.argv.includes("--check-db")) {
      const cmp = await dbCompare(site, res.chosen);
      verdict += `  ${cmp.ok ? "✓" : "⚠"} ${cmp.verdict}　[库: ${cmp.db || "-"}]`;
      if (!cmp.ok) bad++;
    } else if (!res.chosen) bad++;
    rows.push([site.slug, `${res.chosen?.date ?? "-"}${res.chosen?.dateEnd ? "/" + res.chosen.dateEnd : ""}`, verdict]);
    const js = arg("json");
    if (js) {
      const fs = await import("node:fs");
      fs.writeFileSync(js.replace(/\.json$/, "") + `-${site.slug}.json`, JSON.stringify(res, null, 1));
    }
  }
  const w = [14, 24, 10];
  console.log("站点".padEnd(w[0]) + "官网读到的".padEnd(w[1]) + "结果");
  console.log("-".repeat(70));
  for (const r of rows) console.log(r[0].padEnd(w[0]) + r[1].padEnd(w[1]) + r[2]);
  if (bad > 0) {
    console.log(`\n⚠ ${bad} 个站点需要人工确认（详见上面每行的说明，或加 --json= 输出全量候选）`);
    process.exitCode = 2;
  }
}

const invoked = process.argv[1] ?? "";
if (invoked.endsWith("run.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
