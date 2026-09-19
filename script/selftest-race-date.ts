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
console.log("\n## 10. zuicool: weak (unanchored) year matches must not win — real dry-run regressions");
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
  check("10a. history year (2020) ignored → 2026-05-31", r1.date === "2026-05-31", show(r1));

  // zuicool-52970: age bounds inside parentheses are not the race date.
  const r2 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026泰兰尼斯见山青少年跑山赛VK",
      desc: "2026泰兰尼斯见山青少年跑山赛VK定于4月26日（周日）上午10:00-12:00举办，赛道距离5.2公里，7-15周岁儿童（2010年4月26日-2019年4月25日期间出生）独立报名参赛。",
      startDatetimeLoc: "2026.04.26",
    }),
  );
  console.log(`  → zuicool-52970 ${show(r2)}`);
  check("10b. birth-date range (2010年…) ignored → 2026-04-26", r2.date === "2026-04-26", show(r2));

  // 峨眉山: "2025年12月19日9:30开启报名" is the registration window.
  const r3 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026 THE NORTH FACE 100 峨眉山越野挑战赛",
      desc: "2026 THE NORTH FACE 100 峨眉山越野挑战赛定于4月18日-19日、4月25日-26日连续两周举办，2025年12月19日9:30开启报名，额满即止！",
      startDatetimeLoc: "2026.04.18",
    }),
  );
  console.log(`  → TN100 ${show(r3)}`);
  check("10c. registration-opening year ignored → 2026-04-18", r3.date === "2026-04-18", show(r3));

  // zuicool-88139: birth-date bounds in the group detail paragraphs.
  const r4 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "开野2025CURVA杭州青少年越野赛",
      desc: "开野2025CURVA杭州青少年越野赛定于10月18日10:00-16:00举办，即日起-9月18日开放报名！\n\n（一）CURVA MINI酷娃迷你组（3-6岁）（2018年10月17日后出生——2022年10月17日前出生）",
      startDatetimeLoc: "2025.10.18",
    }),
  );
  console.log(`  → zuicool-88139 ${show(r4)}`);
  check("10d. group birth bounds ignored → 2025-10-18", r4.date === "2025-10-18", show(r4));

  // 11e. Still accepts the legitimate unanchored forms (no 定于).
  const r5 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某某马拉松",
      desc: "2026年12月6日，某某马拉松在外滩金牛广场起跑，设全程马拉松一个项目，赛事规模30000人。",
      startDatetimeLoc: "2026.12.06",
    }),
  );
  check("10e. year-first race sentence still parsed as desc_year", r5.date === "2026-12-06" && r5.source === "desc_year", show(r5));

  // zuicool-38342: age bands in the group breakdown ("2017年4月26日-2018年4月26日出生").
  const r6 = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026原力挑战齐天小勇士",
      desc: "2026原力挑战齐天小勇士定于4月26日在青岛百果山森林公园开跑，活动规模500人、设乘风组（6KM）CFZ（300人）、破浪组（3KM）PLZ（200人）两个项目。\n\n乘风组（6KM）CFZ U8-14组别：\nU8-U9：8-9岁儿童   2017年4月26日-2018年4月26日出生；\nU12-U14：12-14岁儿童   2012年4月26日-2014年4月26日出生；",
      startDatetimeLoc: "2026.04.26",
    }),
  );
  console.log(`  → zuicool-38342 ${show(r6)}`);
  check("10f. age-band years (2017年…) ignored → 2026-04-26", r6.date === "2026-04-26", show(r6));

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
  check("10g. check-in/start/cut-off times ignored → 2026-11-04", r7.date === "2026-11-04", show(r7));
}

// ---------------------------------------------------------------------------
console.log("\n## 11. zuicool page field extraction / guards");
{
  const meta = extractZuicoolStartDatetime(
    zuicoolPage({ title: "x", desc: "y", startDatetimeLoc: "2026.01.02" }),
  );
  check("11. start_datetime-loc parses YYYY.MM.DD", meta?.full === "2026-01-02", JSON.stringify(meta));
  check(
    "11b. missing field → null",
    extractZuicoolStartDatetime(zuicoolPage({ title: "x", desc: "定于10月1日" })) === null,
  );
  const html = zuicoolPage({
    title: "空页",
    desc: "本赛事信息待更新，请关注后续公告。",
  });
  const r = resolveZuicoolRaceDate(html);
  check("11c. no date anywhere → no_year", r.date === null && r.reason === "no_year", show(r));
  check("11d. impossible day rejected", calendarDay("2025-02-30", 0) === null);
}

// ---------------------------------------------------------------------------
console.log("\n## 12. review round 1 counter-examples: anchors, ambiguity, siblings, wording");
{
  // --- 12a–12c: an anchored `定于/将于` clause is NOT automatically the race ---
  // Regression class: the guards used to apply only to the unanchored form, so
  // "定于2026年9月1日9:30开启报名" was stored as the race date.
  const reg1 = resolveZuicoolRaceDate(
    zuicoolPage({ title: "某马拉松", desc: "某某马拉松将于2026年9月1日开始报名，11月8日举办。" }),
  );
  console.log(`  → 将于…开始报名 ${show(reg1)}`);
  check(
    "12a. 报名启用日不当作比赛日（无年份可依 → 明确拒答，而非猜一个）",
    reg1.date === null && reg1.reason === "no_year",
    show(reg1),
  );
  // Same sentence with the page field present — the shape 120/120 live rows have.
  const reg1b = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某马拉松",
      desc: "某某马拉松将于2026年9月1日开始报名，11月8日举办。",
      startDatetimeLoc: "2026.11.08",
    }),
  );
  console.log(`  → 将于…开始报名 + 页面字段 ${show(reg1b)}`);
  check("12a'. 有页面字段时必须取真正的比赛日 2026-11-08", reg1b.date === "2026-11-08", show(reg1b));

  const reg2 = resolveZuicoolRaceDate(
    zuicoolPage({ title: "某越野赛", desc: "某某越野赛定于2026年9月1日9:30开启报名。" }),
  );
  check(
    "12b. 定于…开启报名不当作比赛日（无年份可依 → 明确拒答）",
    reg2.date === null && reg2.reason === "no_year",
    show(reg2),
  );

  const pickup = resolveZuicoolRaceDate(
    zuicoolPage({ title: "某赛", desc: "某某赛领物定于2026年11月6日，比赛11月8日举行。" }),
  );
  check(
    "12c. 领物定于…不当作比赛日（无年份可依 → 明确拒答）",
    pickup.date === null && pickup.reason === "no_year",
    show(pickup),
  );
  // With the page field: the *race* day 11月8日 must win over the pick-up day.
  const pickupField = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某赛",
      desc: "某某赛领物定于2026年11月6日，比赛11月8日举行。",
      startDatetimeLoc: "2026.11.08",
    }),
  );
  console.log(`  → 领物 + 页面字段 ${show(pickupField)}`);
  check(
    "12c'. 有页面字段时取比赛日 2026-11-08 而不是领物日 11月6日",
    pickupField.date === "2026-11-08",
    show(pickupField),
  );

  // …but the anchored form stays trusted when it really is the race.
  const ok = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某越野赛",
      desc: "某越野赛定于10月18日10:00-16:00举办，即日起-9月18日开放报名！",
      startDatetimeLoc: "2026.10.18",
    }),
  );
  console.log(`  → 定于…举办（后接开放报名）${show(ok)}`);
  check("12d. legit 定于…举办 is still accepted", ok.date === "2026-10-18", show(ok));

  // --- 12e: every reschedule wording the sources use --------------------------
  const wordings: Array<[string, string]> = [
    ["延期", "原定于11月9日举办，现延期至11月23日举行"],
    ["改期", "原定于11月9日举办，现改期至11月23日举行"],
    ["推迟", "原定于11月9日举办，现推迟到11月23日举行"],
    ["顺延", "原定于11月9日举办，现顺延至11月23日举行"],
    ["延后", "原定于11月9日举办，现延后至11月23日举行"],
    ["调整为", "原定于11月9日举办，现调整为11月23日举行"],
    ["改为", "原定于11月9日举办，现改为11月23日举行"],
    ["更改为", "原定于11月9日举办，现更改为11月23日举行"],
  ];
  for (const [kw, desc] of wordings) {
    const r = resolveZuicoolRaceDate(zuicoolPage({ title: "某赛", desc, startDatetimeLoc: "2026.11.23" }));
    console.log(`  → ${kw} ${show(r)}`);
    check(`12e. 「${kw}」takes the new date 2026-11-23`, r.date === "2026-11-23", show(r));
    check(`12e. 「${kw}」reason = rescheduled`, r.reason === "rescheduled", show(r));
  }

  // --- 12f: a reschedule whose new date cannot be read ------------------------
  const unparsed = resolveZuicoolRaceDate(
    zuicoolPage({ title: "某赛", desc: "原定于11月9日举办，因故延期。", startDatetimeLoc: "2026.11.09" }),
  );
  console.log(`  → 延期但无新日期 ${show(unparsed)}`);
  check("12f. never falls back to the cancelled date", unparsed.date !== "2026-11-09", show(unparsed));
  check("12f. reason = rescheduled_unparsed", unparsed.reason === "rescheduled_unparsed", show(unparsed));

  // --- 12g: a registration deadline is not a reschedule -----------------------
  const regDeadline = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某赛",
      desc: "第81期定于5月31日7:00开跑；报名延期至10月10日23:59。",
      startDatetimeLoc: "2026.05.31",
    }),
  );
  check("12g. 报名延期至… leaves the race date alone", regDeadline.date === "2026-05-31", show(regDeadline));

  // --- 12h/12i: a race verb after the date beats a later 报名 mention --------
  const verb = resolveZuicoolRaceDate(
    zuicoolPage({ title: "某赛", desc: "某某马拉松2026年12月6日在上海开跑，报名截止11月20日。" }),
  );
  console.log(`  → 开跑+报名截止 ${show(verb)}`);
  check("12h. race day kept when a deadline follows in the same window", verb.date === "2026-12-06", show(verb));

  const staleField = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某赛",
      desc: "某某赛2026年12月6日举办，报名截止12月1日。",
      startDatetimeLoc: "2025.12.20", // stale page field must not silently win
    }),
  );
  check("12i. explicit copy year beats a stale page field", staleField.date === "2026-12-06", show(staleField));

  // --- 12j: impossible date in the copy is reported, not silently patched -----
  const impossible = resolveZuicoolRaceDate(
    zuicoolPage({ title: "某赛", desc: "某某赛定于2026年2月30日举办。", startDatetimeLoc: "2027.03.15" }),
  );
  console.log(`  → 2月30日 ${show(impossible)}`);
  check("12j. impossible day is not replaced by the page field", impossible.date !== "2027-03-15", show(impossible));
  check("12j. reason = unparsable_date", impossible.reason === "unparsable_date", show(impossible));

  // --- 12k: series siblings (5K / Relay) are different races ------------------
  const ld = (name: string, startDate: string, url = "https://runsignup.com/Race/Sibling") =>
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name,
      startDate,
      url,
    })}</script>`;
  const sibling5k = resolveRunsignupStartDate(
    `<html><body>${ld("Boston Marathon 5K", "2026-04-18")}${ld("Boston Marathon 2026", "2026-04-20")}</body></html>`,
    { trackedName: "Boston Marathon" },
  );
  console.log(`  → 5K sibling ${show(sibling5k)}`);
  check("12k. 5K sibling is not the tracked edition", sibling5k.date === "2026-04-20", show(sibling5k));

  const siblingRelay = resolveRunsignupStartDate(
    `<html><body>${ld("Big Sur Marathon Relay", "2026-04-25")}${ld("Big Sur Marathon 2026", "2026-04-26")}</body></html>`,
    { trackedName: "Big Sur Marathon" },
  );
  check("12k. Relay sibling is not the tracked edition", siblingRelay.date === "2026-04-26", show(siblingRelay));

  // --- 12l: matched editions that disagree must be refused --------------------
  const ambiguous = resolveRunsignupStartDate(
    `<html><body>${ld("Boston Marathon 2026", "2026-04-20")}${ld("Boston Marathon 2026", "2026-05-03")}</body></html>`,
    { trackedName: "Boston Marathon" },
  );
  console.log(`  → 同名不同日 ${show(ambiguous)}  evidence="${ambiguous.evidence}"`);
  check("12l. disagreeing editions → date: null", ambiguous.date === null, show(ambiguous));
  check("12l. reason = ambiguous_multi_edition", ambiguous.reason === "ambiguous_multi_edition", show(ambiguous));

  // --- 12m: calendarDay accepts a lowercase `z` and shifts once ---------------
  check("12m. lowercase z is shifted into CST", calendarDay("2025-12-31T23:30:00.000z", 480) === "2026-01-01");
  check("12m. explicit +08:00 is not shifted twice", calendarDay("2026-01-01T07:00:00+08:00", 480) === "2026-01-01");
}

// ---------------------------------------------------------------------------
console.log("\n## 13. real rows: sub-event wording must not be mistaken for a reschedule");
{
  // These five descriptions are copied from the live DB (2026-09-20). The first
  // three contain the reschedule vocabulary while describing something else
  // (group distance / start time), and the last two really are postponements
  // announced without a new date — those must NOT keep the cancelled day.
  const groupEdit = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026中岳嵩山越野赛",
      desc:
        "***调整提醒：因近期持续降雨影响赛道，原100公里组别调整为70公里。相关改退方案详见组委会调整公告说明。" +
        "2026中岳嵩山越野赛定于10月31日-11月1日在河南·登封·嵩山景区少林新游客中心开赛；先报先得，额满即止！",
      startDatetimeLoc: "2026.10.31",
    }),
  );
  console.log(`  → zuicool-10497 ${show(groupEdit)}`);
  check("13a. 组别调整为70公里 is not a date change", groupEdit.date === "2026-10-31", show(groupEdit));

  const startTimeEdit = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026思凯乐瓢虫越野训练赛（夏季）模式口站",
      desc:
        "***提示：起跑时间从上午7:30调整为8:30。6月14日早上7:10-8:10在起点凭身份证领取参赛物资。" +
        "2026思凯乐瓢虫越野训练赛（夏季）模式口站定于6月14日（周日）上午8:30在北京石景山区模式口公园小广场开跑。",
      startDatetimeLoc: "2026.06.14",
    }),
  );
  console.log(`  → zuicool-70821 ${show(startTimeEdit)}`);
  check("13b. 起跑时间调整为8:30 is not a date change", startTimeEdit.date === "2026-06-14", show(startTimeEdit));

  const gunTimeEdit = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026中国山地越野公开赛（秦皇岛抚宁站）",
      desc:
        "***起跑时间调整提示：2026中国山地越野公开赛（秦皇岛抚宁站）暨冰塘峪长城越野赛 15公里体验组，" +
        "发枪时间将调整为 2026年4月26日上午9:00",
      startDatetimeLoc: "2026.04.26",
    }),
  );
  check("13c. 发枪时间将调整为… keeps the race day", gunTimeEdit.date === "2026-04-26", show(gunTimeEdit));
  // …and it must be the ordinary path, not "a reschedule clause that happened to
  // point at the same day" (the previous fixture passed by coincidence).
  check("13c'. 发枪时间句不得被当成改期（reason = ok）", gunTimeEdit.reason === "ok", show(gunTimeEdit));

  const postponedNoDate = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "太平洋保险·2026仙岛湖·天空之城越野赛",
      desc:
        "***因赛事整体安排调整，经组委会审慎研究与综合评估，原定于4月19日举办的太平洋保险·2026第二届仙岛湖天空之城越野赛，将延期举行",
      startDatetimeLoc: "2026.04.19",
    }),
  );
  console.log(`  → zuicool-84534 ${show(postponedNoDate)}`);
  check("13d. postponed-without-a-date must not keep the cancelled day", postponedNoDate.date !== "2026-04-19", show(postponedNoDate));
  check("13d. reason = rescheduled_unparsed", postponedNoDate.reason === "rescheduled_unparsed", show(postponedNoDate));

  const postponedElsewhere = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026户外特工“山顶见”环大湾区山径系列赛肇庆站",
      desc:
        "***组委会5月11日发布延期公告：原定于2026年5月17日主办户外特工“山顶见”环大湾区山径系列赛肇庆站，" +
        "因持续降雨影响，经组委会审慎研究决定：赛事延期主办，具体主办时间另行通知！",
      startDatetimeLoc: "2026.05.17",
    }),
  );
  check("13e. 延期主办，另行通知 must not keep the cancelled day", postponedElsewhere.date !== "2026-05-17", show(postponedElsewhere));
  check("13e. reason = rescheduled_unparsed", postponedElsewhere.reason === "rescheduled_unparsed", show(postponedElsewhere));

  // --- 13f–13g: fixtures that ACTUALLY exercise the sub-event guard ------------
  // (13a/13b only contained "调整为70公里"/"调整为8:30" — no date at all, so the
  //  guard was never reached and a broken guard would still pass. Round-2 review.)
  const groupWithDate = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026中岳嵩山越野赛",
      desc:
        "***调整提醒：因近期持续降雨影响赛道，组别调整为11月20日举行，相关改退方案详见组委会公告。" +
        "2026中岳嵩山越野赛定于10月31日-11月1日举行，先报先得，额满即止！",
      startDatetimeLoc: "2026.10.31",
    }),
  );
  console.log(`  → 组别调整为11月20日举行 ${show(groupWithDate)}`);
  check(
    "13f. 组别调整为<日期> 不得顶掉比赛日（守卫必须真的生效）",
    groupWithDate.date === "2026-10-31",
    show(groupWithDate),
  );

  const gunOtherDay = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "2026中国山地越野公开赛（秦皇岛抚宁站）",
      desc:
        "***起跑时间调整提示：15公里体验组、5公里亲子休闲组，发枪时间将调整为 2026年4月25日上午9:00。" +
        "2026中国山地越野公开赛（秦皇岛抚宁站）定于4月26日举办。",
      startDatetimeLoc: "2026.04.26",
    }),
  );
  console.log(`  → 发枪时间将调整为前一天 ${show(gunOtherDay)}`);
  check(
    "13g. 发枪日≠比赛日时必须取比赛日（助词不得击穿守卫）",
    gunOtherDay.date === "2026-04-26" && gunOtherDay.reason === "ok",
    show(gunOtherDay),
  );

  // --- 13h–13k: regressions reproduced in review round 2 ----------------------
  const raceTimeResched = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某赛",
      desc: "原定于11月9日举办，后因故比赛时间延期至11月23日举行。",
      startDatetimeLoc: "2026.11.23",
    }),
  );
  console.log(`  → 比赛时间延期至11月23日 ${show(raceTimeResched)}`);
  check(
    "13h. 「比赛时间延期至…」是比赛改期（不得被子事件守卫误杀）",
    raceTimeResched.date === "2026-11-23" && raceTimeResched.reason === "rescheduled",
    show(raceTimeResched),
  );

  const laterParagraph = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "环四姑娘山超级越野跑",
      desc:
        "“云端约会”2026凯乐石第十一届环四姑娘山超级越野跑定于11月4日-11月7日举办，设快乐牛仔35、梦想东壁100等组别；" +
        "报到截止时间2026年11月6日20:00，出发时间2026年11月7日07:30。7日19:30，颁奖仪式调整为11月18日举行。",
      startDatetimeLoc: "2026.11.04",
    }),
  );
  console.log(`  → 后段颁奖仪式调整为11月18日 ${show(laterParagraph)}`);
  check(
    "13i. 后段句子的「调整为<日期>」不得顶掉首句比赛日",
    laterParagraph.date === "2026-11-04",
    show(laterParagraph),
  );

  const historyResched = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某赛",
      desc: "本赛事2020年因故延期举行，现定于2026年12月6日举办，报名另行通知。",
      startDatetimeLoc: "2026.12.06",
    }),
  );
  console.log(`  → 历史延期 + 现定于2026年12月6日 ${show(historyResched)}`);
  check(
    "13j. 正文已写明新日期时不得拒答（读得出来就不是猜测）",
    historyResched.date === "2026-12-06",
    show(historyResched),
  );

  const launchCeremony = resolveZuicoolRaceDate(
    zuicoolPage({
      title: "某赛",
      desc: "某某赛定于2026年9月1日举行报名启动仪式，具体比赛日期待定。",
    }),
  );
  console.log(`  → 定于2026年9月1日举行报名启动仪式 ${show(launchCeremony)}`);
  check(
    "13k. 「举行报名启动仪式」不是比赛日（被锚点否决后不得从普通回退复活）",
    launchCeremony.date !== "2026-09-01",
    show(launchCeremony),
  );
}


// ---------------------------------------------------------------------------
console.log(`\n# ${passed} assertion(s) passed, ${failures.length} failed`);
if (failures.length) {
  console.log("# failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("# OK");
