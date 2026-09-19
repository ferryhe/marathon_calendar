/**
 * Offline self-test for `shared/race-date.ts` (the per-source race-date adapter).
 *
 * Fully offline — the fixtures below are the real page shapes the bugs were
 * measured on (see the header of shared/race-date.ts). No DB, no network.
 *
 *   npx tsx script/selftest-race-date.ts
 *
 * Exits 1 on the first failed assertion group summary (all groups are reported).
 */

import {
  calendarDay,
  findReschedule,
  extractZuicoolStartDatetime,
  resolveNowrunStartDate,
  resolveRunsignupStartDate,
  resolveWorldsmarathonsStartDate,
  resolveZuicoolRaceDate,
  type PageDateResult,
} from "../shared/race-date.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

function show(r: PageDateResult): string {
  return `{year:${r.year}, date:${r.date}, source:${r.source}, reason:${r.reason ?? "-"}}`;
}

/** Real zuicool page shell: `start_datetime-loc` div + og: meta tags. */
function zuicoolPage(opts: {
  title: string;
  desc: string;
  /** e.g. "2025.10.01" — omit to model a page without the meta field. */
  startDatetimeLoc?: string;
  locSuffix?: string;
}): string {
  const div = opts.startDatetimeLoc
    ? `            <div class="start_datetime-loc">
            ${opts.startDatetimeLoc}            &middot;
            ${opts.locSuffix ?? "西藏 日喀则市 萨嘎县 塔尔钦"}        </div>`
    : "";
  return `<!doctype html><html><head>
<meta name="og:title" content="${opts.title}" />
<meta property="og:description" content="${opts.desc}" />
<title>${opts.title}</title>
</head><body>
    <div class="name" style="margin-bottom: 4px"><h1><a href="https://zuicool.com/event/79166">${opts.title}</a></h1></div>
${div}
</body></html>`;
}

function nowrunPage(startDate: string, name: string): string {
  return `<!doctype html><html><head><title>${name}</title></head><body>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"SportsEvent","name":"${name}","startDate":"${startDate}","location":{"@type":"Place","name":"上海"}}
</script>
</body></html>`;
}

console.log("# race-date adapter self-test (offline)\n");

// ---------------------------------------------------------------------------
console.log("## 1. zuicool: no year in copy + start_datetime-loc 2025.10.01 (real 冈仁波齐52 row)");
{
  const html = zuicoolPage({
    title: "天上阿里・极境征途—冈仁波齐52",
    desc: "「天上阿里·极境征途-冈仁波齐52」定于10月1日-8日举办，活动起终点西藏日喀则市萨嘎县塔尔钦，实际距离52公里，赛道海拔区间4652米~5654米，设冈仁波齐52（KK52）1日组（50人）…",
    startDatetimeLoc: "2025.10.01",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}  evidence="${r.evidence}"`);
  check("1. date = 2025-10-01", r.date === "2025-10-01", show(r));
  check("1. year = 2025 (not 2026 / current year)", r.year === 2025, show(r));
  check("1. source = start_datetime_loc", r.source === "start_datetime_loc", show(r));
  check("1. multiDay flag set (10月1日-8日)", r.multiDay === true, show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 2. zuicool: explicit year in copy (上海马拉松)");
{
  const html = zuicoolPage({
    title: "2026上海马拉松",
    desc: "2026上海马拉松定于2026年12月6日（周日）上午7:00在外滩金牛广场起跑，设马拉松（42.195公里）一个项目；报名时间另行通知。",
    startDatetimeLoc: "2026.12.06",
    locSuffix: "上海 黄浦区 外滩金牛广场",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}`);
  check("2. date = 2026-12-06", r.date === "2026-12-06", show(r));
  check("2. source = desc_year", r.source === "desc_year", show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 3. zuicool: multi-day window, first day wins (定于11月4日-11月7日)");
{
  const html = zuicoolPage({
    title: "2026某某越野赛",
    desc: "2026某某越野赛定于11月4日-11月7日在云南举办，设100公里、50公里两个组别；额满即止。",
    startDatetimeLoc: "2026.11.04",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}`);
  check("3. date = 2026-11-04 (first day)", r.date === "2026-11-04", show(r));
  check("3. multiDay = true", r.multiDay === true, show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 4. zuicool: 延期至11月23日 wins over 原定于11月9日");
{
  const html = zuicoolPage({
    title: "某某山地马拉松",
    desc: "某某山地马拉松原定于11月9日举办，因故延期至11月23日举行，报名通道继续开放。",
    startDatetimeLoc: "2025.11.23",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}  evidence="${r.evidence}"`);
  check("4. date = 2025-11-23", r.date === "2025-11-23", show(r));
  check("4. reason = rescheduled", r.reason === "rescheduled", show(r));
  check("4. year = 2025 from page field", r.year === 2025, show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 5. zuicool: 改期至9月7日");
{
  const html = zuicoolPage({
    title: "某某半程马拉松",
    desc: "某某半程马拉松改期至9月7日在滨江公园举行，请选手留意通知。",
    startDatetimeLoc: "2025.09.07",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}  evidence="${r.evidence}"`);
  check("5. date = 2025-09-07", r.date === "2025-09-07", show(r));
  check("5. reason = rescheduled", r.reason === "rescheduled", show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 6. zuicool: copy has month/day, page has NO year → must refuse (no current-year guess)");
{
  const html = zuicoolPage({
    title: "某某越野挑战赛",
    desc: "某某越野挑战赛定于10月1日在山谷开跑，设30公里组。",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}`);
  const currentYear = new Date().getFullYear();
  check("6. date = null", r.date === null, show(r));
  check("6. year = null", r.year === null, show(r));
  check("6. reason = no_year", r.reason === "no_year", show(r));
  check(`6. year is NOT the current year (${currentYear})`, r.year !== currentYear, show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 6b. zuicool: registration deadline in copy must not become the race date");
{
  const html = zuicoolPage({
    title: "某某城市马拉松",
    desc: "某某城市马拉松报名2026年9月1日截止，比赛定于10月5日举办。",
    startDatetimeLoc: "2026.10.05",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}  evidence="${r.evidence}"`);
  check("6b. date = 2026-10-05 (not the 报名截止 date)", r.date === "2026-10-05", show(r));
}

// ---------------------------------------------------------------------------
console.log("\n## 6c. zuicool: 报名延期至… is a deadline change, not a race reschedule");
{
  const html = zuicoolPage({
    title: "某某越野赛",
    desc: "某某越野赛定于10月18日举办；报名延期至10月10日23:59。",
    startDatetimeLoc: "2025.10.18",
  });
  const r = resolveZuicoolRaceDate(html);
  console.log(`  → ${show(r)}`);
  check("6c. date = 2025-10-18", r.date === "2025-10-18", show(r));
  check("6c. reason != rescheduled", r.reason !== "rescheduled", show(r));
  check(
    "6c. findReschedule rejects the 报名 clause",
    findReschedule("报名延期至10月10日23:59") === null,
  );
}

// ---------------------------------------------------------------------------
console.log("\n## 7. nowrun: JSON-LD startDate is UTC → CST day (2030 → 2031 boundary is decoupled from today)");
{
  const html = nowrunPage("2025-12-31T23:30:00.000Z", "上海元旦迎新跑");
  const r = resolveNowrunStartDate(html);
  console.log(`  → ${show(r)}`);
  check("7. date = 2026-01-01 (UTC 2025-12-31T23:30Z +08:00)", r.date === "2026-01-01", show(r));
  check("7. year = 2026", r.year === 2026, show(r));
  check("7. source = jsonld", r.source === "jsonld", show(r));
  check(
    "7. raw UTC date part is NOT used",
    calendarDay("2025-12-31T23:30:00.000Z", 0) === "2025-12-31",
  );
  // A naive / offset-carrying timestamp must not be shifted twice.
  check(
    "7b. naive local timestamp not shifted",
    calendarDay("2026-01-01T07:30:00+08:00", 480) === "2026-01-01",
  );
}

// ---------------------------------------------------------------------------
console.log("\n## 8. runsignup: 21 startDates on one page → match the tracked edition (no first/min)");
{
  // Real shape: a race page that lists a series + siblings + a UTC variant of
  // the tracked edition. The tracked race is at index 15, and 2026-01-17 is the
  // minimum — both wrong answers the old "first/min" parse would have returned.
  const series: Array<{ name: string; startDate: string; url: string }> = [];
  for (let i = 1; i <= 13; i++) {
    series.push({
      name: `Hudson Valley Trail Series Race ${i}`,
      startDate: `2026-0${i <= 9 ? i : 9}-1${i % 10}T09:00:00-05:00`,
      url: `https://runsignup.com/Race/NY/Hudson/SeriesRace${i}`,
    });
  }
  series.push({
    name: "Boston Marathon Training Program",
    startDate: "2026-01-17T09:00:00-05:00",
    url: "https://runsignup.com/Race/MA/Boston/TrainingProgram", // the minimum date
  });
  // index 15 (not first, not min) — the tracked edition:
  series.push({
    name: "Boston Marathon",
    startDate: "2026-04-20T07:00:00-04:00",
    url: "https://runsignup.com/Race/MA/Boston/BostonMarathon",
  });
  // …plus a UTC variant of the same event (same calendar day):
  series.push({
    name: "Boston Marathon",
    startDate: "2026-04-20T11:00:00.000Z",
    url: "https://runsignup.com/Race/MA/Boston/BostonMarathon",
  });
  for (let i = 1; i <= 5; i++) {
    series.push({
      name: `Boston 5K Series Leg ${i}`,
      startDate: `2026-06-0${i}T08:00:00-04:00`,
      url: `https://runsignup.com/Race/MA/Boston/Leg${i}`,
    });
  }
  const html = `<!doctype html><html><head><title>Boston Marathon</title></head><body>
${series
  .map(
    (e) =>
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: e.name,
        startDate: e.startDate,
        url: e.url,
      })}</script>`,
  )
  .join("\n")}
</body></html>`;
  const allDates = series.map((s) => s.startDate);
  const minDay = allDates
    .map((d) => calendarDay(d, 0)!)
    .sort()[0];
  console.log(`  page carries ${series.length} startDate values; min day = ${minDay}`);
  check("8. fixture carries exactly 21 startDate values (real page range 1–21)", series.length === 21, String(series.length));

  const r = resolveRunsignupStartDate(html, { trackedName: "Boston Marathon" });
  console.log(`  → ${show(r)}  evidence="${r.evidence}"`);
  check("8. date = 2026-04-20 (matched edition)", r.date === "2026-04-20", show(r));
  check("8. NOT the first startDate", r.date !== calendarDay(series[0].startDate, 0), show(r));
  check("8. NOT the minimum startDate", r.date !== minDay, show(r));
  check("8. NOT the decoy training program (2026-01-17)", r.date !== "2026-01-17", show(r));
  check("8. source = jsonld", r.source === "jsonld", show(r));

  const byUrl = resolveRunsignupStartDate(html, {
    eventUrl: "https://runsignup.com/Race/MA/Boston/BostonMarathon",
  });
  check("8b. url match resolves the same edition", byUrl.date === "2026-04-20", show(byUrl));

  const noMatch = resolveRunsignupStartDate(html, { trackedName: "Chicago Marathon" });
  check("8c. unknown tracked edition → refuse (no_tracked_match)", noMatch.date === null, show(noMatch));
  check("8c. reason = no_tracked_match", noMatch.reason === "no_tracked_match", show(noMatch));
}

// ---------------------------------------------------------------------------
console.log("\n## 9. worldsmarathons / wmm-official: nothing parseable → TBA (never a guessed date)");
{
  const html = `<!doctype html><html><head><title>TCS New York City Marathon</title></head><body>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"TCS New York City Marathon","location":{"@type":"Place","name":"New York"}}
</script>
<p>Held on Sunday 1 March 2026 in New York.</p>
</body></html>`;
  const r = resolveWorldsmarathonsStartDate(html);
  console.log(`  → ${show(r)}`);
  check("9. date = null", r.date === null, show(r));
  check("9. source = tba", r.source === "tba", show(r));
  check("9. reason = no_parseable_start_date", r.reason === "no_parseable_start_date", show(r));

  const good = `<!doctype html><html><body><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"Berlin Marathon","startDate":"2026-09-27T09:00:00+02:00"}
</script></body></html>`;
  const g = resolveWorldsmarathonsStartDate(good);
  console.log(`  → (reliable page) ${show(g)}`);
  check("9b. parseable Event JSON-LD is used", g.date === "2026-09-27", show(g));
  check("9b. source = jsonld", g.source === "jsonld", show(g));
}

// ---------------------------------------------------------------------------
console.log("\n## 11. zuicool: weak (unanchored) year matches must not win — real dry-run regressions");
{
  // zuicool-37212: history mention "从2020年5月24日首次开展" is not this edition.
  const r1 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026第七季武汉喻家五攀山径训练赛第81期",
      desc: "2026第七季武汉喻家五攀山径训练赛第81期定于5月31日7:00在武汉市洪山区鲁磨路南望山公交站（鲁磨路七山步道牌坊）开跑，设五攀组（23公里）等组别；先报先得。\n\n武汉喻家五攀山径训练赛从2020年5月24日首次开展，至今已成功举办六季共80期。",
      startDatetimeLoc: "2026.05.31",
    }),
  );
  console.log(`  → zuicool-37212 ${show(r1)}`);
  check("11a. history year (2020) ignored → 2026-05-31", r1.date === "2026-05-31", show(r1));

  // zuicool-52970: age bounds inside parentheses are not the race date.
  const r2 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026泰兰尼斯见山青少年跑山赛VK",
      desc: "2026泰兰尼斯见山青少年跑山赛VK定于4月26日（周日）上午10:00-12:00举办，赛道距离5.2公里，7-15周岁儿童（2010年4月26日-2019年4月25日期间出生）独立报名参赛。",
      startDatetimeLoc: "2026.04.26",
    }),
  );
  console.log(`  → zuicool-52970 ${show(r2)}`);
  check("11b. birth-date range (2010年…) ignored → 2026-04-26", r2.date === "2026-04-26", show(r2));

  // 峨眉山: "2025年12月19日9:30开启报名" is the registration window.
  const r3 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026 THE NORTH FACE 100 峨眉山越野挑战赛",
      desc: "2026 THE NORTH FACE 100 峨眉山越野挑战赛定于4月18日-19日、4月25日-26日连续两周举办，2025年12月19日9:30开启报名，额满即止！",
      startDatetimeLoc: "2026.04.18",
    }),
  );
  console.log(`  → TN100 ${show(r3)}`);
  check("11c. registration-opening year ignored → 2026-04-18", r3.date === "2026-04-18", show(r3));

  // zuicool-88139: birth-date bounds in the group detail paragraphs.
  const r4 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "开野2025CURVA杭州青少年越野赛",
      desc: "开野2025CURVA杭州青少年越野赛定于10月18日10:00-16:00举办，即日起-9月18日开放报名！\n\n（一）CURVA MINI酷娃迷你组（3-6岁）（2018年10月17日后出生——2022年10月17日前出生）",
      startDatetimeLoc: "2025.10.18",
    }),
  );
  console.log(`  → zuicool-88139 ${show(r4)}`);
  check("11d. group birth bounds ignored → 2025-10-18", r4.date === "2025-10-18", show(r4));

  // 11e. Still accepts the legitimate unanchored forms (no 定于).
  const r5 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某某马拉松",
      desc: "2026年12月6日，某某马拉松在外滩金牛广场起跑，设全程马拉松一个项目，赛事规模30000人。",
      startDatetimeLoc: "2026.12.06",
    }),
  );
  check("11e. year-first race sentence still parsed as desc_year", r5.date === "2026-12-06" && r5.source === "desc_year", show(r5));

  // zuicool-38342: age bands in the group breakdown ("2017年4月26日-2018年4月26日出生").
  const r6 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026原力挑战齐天小勇士",
      desc: "2026原力挑战齐天小勇士定于4月26日在青岛百果山森林公园开跑，活动规模500人、设乘风组（6KM）CFZ（300人）、破浪组（3KM）PLZ（200人）两个项目。\n\n乘风组（6KM）CFZ U8-14组别：\nU8-U9：8-9岁儿童   2017年4月26日-2018年4月26日出生；\nU12-U14：12-14岁儿童   2012年4月26日-2014年4月26日出生；",
      startDatetimeLoc: "2026.04.26",
    }),
  );
  console.log(`  → zuicool-38342 ${show(r6)}`);
  check("11f. age-band years (2017年…) ignored → 2026-04-26", r6.date === "2026-04-26", show(r6));

  // zuicool-48442: sub-event timestamps in the later paragraphs
  // ("报到截止时间2026年11月6日20:00") must not beat the lead sentence's first day.
  const r7 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "“云端约会”2026凯乐石第十一届环四姑娘山超级越野跑",
      desc: "“云端约会”2026凯乐石第十一届环四姑娘山超级越野跑定于11月4日-11月7日在四川省阿坝州小金县四姑娘山双桥沟、长坪沟、海子沟景区举办；4月15日10点开启报名，额满即止！\n\n快乐牛仔35：赛道距离32.2公里，报到截止时间2026年11月6日20:00，出发时间2026年11月7日07:30，关门时间2026年11月7日19:30",
      startDatetimeLoc: "2026.11.04",
    }),
  );
  console.log(`  → zuicool-48442 ${show(r7)}`);
  check("11g. check-in/start/cut-off times ignored → 2026-11-04", r7.date === "2026-11-04", show(r7));
}

// ---------------------------------------------------------------------------
console.log("\n## 12. zuicool page field extraction / guards");
{
  const meta = extractZuicoolStartDatetime(
    zuicoolPage({ title: "x", desc: "y", startDatetimeLoc: "2026.01.02" }),
  );
  check("12. start_datetime-loc parses YYYY.MM.DD", meta?.full === "2026-01-02", JSON.stringify(meta));
  check(
    "12b. missing field → null",
    extractZuicoolStartDatetime(zuicoolPage({ title: "x", desc: "定于10月1日" })) === null,
  );
  const html = zuicoolPage({
    title: "空页",
    desc: "本赛事信息待更新，请关注后续公告。",
  });
  const r = resolveZuicoolRaceDate(html);
  check("12c. no date anywhere → no_year", r.date === null && r.reason === "no_year", show(r));
  check("12d. impossible day rejected", calendarDay("2025-02-30", 0) === null);
}

// ---------------------------------------------------------------------------
console.log(`\n# ${passed} assertion(s) passed, ${failures.length} failed`);
if (failures.length) {
  console.log("# failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("# OK");
