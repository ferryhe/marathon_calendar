# Marathon Calendar

A web app for browsing global marathons (China + Overseas) with auto-updating data, favorites, reviews, and admin tooling.

## Stack

- **Frontend**: React + Vite + TypeScript, wouter (router), TanStack Query, Tailwind, framer-motion, shadcn/ui
- **Backend**: Express + TypeScript, Drizzle ORM, PostgreSQL, express-session
- **Deployment**: Autoscale, build `npm run build`, run `node ./dist/index.cjs`
- **Dev**: `npm run dev` on port 5000

## Project Structure

```
client/src/
  pages/        Home, MarathonDetail, Profile, MyFavorites, MyReviews, AdminData
  components/   MarathonTable, EventDetails, PageShell, ui/*
  hooks/        useAuth, use-toast (auto-dismiss after 1500ms by default)
  lib/          queryClient (apiRequest helper), mockData (legacy, unused)
server/
  index.ts          Express bootstrap, session, scheduler kickoff
  routes.ts         All HTTP routes (very large, ~2900 lines)
  syncScheduler.ts  Crawler engine: fetch HTML, extract via rules/JSON-LD/regex/AI fallback
  aiExtractor.ts    OpenAI-based extraction fallback
  aiRuleTemplate.ts Generate extract rules from HTML samples
  braveSearch.ts    Brave web search for finding race websites
  editionMerge.ts   Merge crawled data into marathon_editions with field provenance
  auth.ts           Password hashing
shared/schema.ts    All Drizzle tables + Zod insert/select schemas
```

## Data Model (key tables)

- `users` — auth + profile (display_name, avatar_url, wechat fields)
- `marathons` — canonical race entity (canonical_name, city, country, `race_kind` text default 'marathon' added 2026-05-02 — values `marathon` | `trail`. All public list/search/upcoming/hot endpoints filter by `?kind=marathon|trail` (default marathon). Admin endpoint accepts optional `?kind` to view both kinds. Trail rows are ingested by `script/import-zuicool-trail.ts` from zuicool.com — see `.local/skills/crawler-zuicool/SKILL.md`. Trail rows use `canonical_name = zuicool-{id}` so they never collide with road-marathon rows; the importer also rejects display-name clashes against existing non-zuicool canonicals to prevent flipping a road row's `race_kind` to trail.)
- `marathon_editions` — year-specific data (race_date, registration_status/url, field_sources jsonb for provenance, `status` enum + `is_lottery` flag added 2026-05-02)
  - `status` taxonomy (nowrun-aligned, defined in `shared/status.ts`): `upcoming` 待开始 / `open` 报名中 / `closed` 待比赛 / `racing` 比赛中 / `ended` 已结束 / `cancelled` 已取消. Frontend renders via `<StatusBadge>` (open badge gets `.status-open-glow` shimmer). When `status` is null, `resolveEditionStatus` falls back to legacy Chinese `registration_status` then date-derived computation. Legacy `registration_status` kept for one cycle.
- `sources` — crawler config (strategy: HTML/API, priority, rules in config jsonb)
- `marathon_sources` — links a marathon to one or more source URLs
- `raw_crawl_data` — fetched HTML with status (pending/needs_review/processed/failed)
- `marathon_sync_runs` — log of every crawler execution
- `marathon_reviews`, `user_favorite_marathons` — engagement

## Sync Architecture

The crawler runs via `syncNowOnce()` in `server/syncScheduler.ts`. A PostgreSQL advisory lock prevents concurrent runs. For each `marathon_sources` link due to be checked (`next_check_at <= now`), it:

1. Fetches the URL with timeout
2. Hashes content (skips if unchanged)
3. Extracts edition data using source rules → JSON-LD → regex → AI fallback (if `AI_MODEL` env set)
4. Inserts into `raw_crawl_data` with `needs_review` status (manual gating)
5. Admin reviews in `/admin/data` and publishes to `marathon_editions`
6. Past races are auto-skipped with `已完赛` message

The scheduler auto-runs in production or when `SYNC_SCHEDULER_ENABLED=true`. In dev, sync is triggered manually via UI or admin endpoints.

## Public Sync Endpoints (added 2026-05)

- `POST /api/marathons/refresh` — public, rate-limited (60s global), kicks `syncNowOnce()` in background
- `GET /api/marathons/sync-status` — returns `{ lastFinishedAt, lastStatus, isRunning, last24h }`

The Home header refresh button calls these and shows "X 分钟前更新" / "正在更新…" subtitle.

## Admin

- All `/api/admin/*` routes require `x-admin-token` header matching `ADMIN_API_TOKEN` env var (returns 404 if env unset)
- AdminData page (`/admin/data`) handles: source CRUD, marathon-source bindings, raw crawl review, AI rule generation, web search, manual edition publish

## UI Conventions

- Apple-style design: `glass-header`/`glass-effect` classes (NOT `glass`), dark mode via `prefers-color-scheme`
- Page wrapper: `max-w-2xl mx-auto px-4`, sticky glass header with h-12
- All interactive elements need `data-testid` attributes
- React rule: ALL hooks must be called BEFORE any early return
- Avoid Chinese curly quotes inside JS string literals
- Past events (race_date < today) are filtered out client-side in MarathonTable

## Marathon Coverage (as of 2026-05)

- **海外 (9)**: 8 World Marathon Majors (Boston, London, Berlin, Chicago, NYC, Tokyo, Sydney, Cape Town) + Paris. All bound to crawler with official URLs.
- **国内 (28)**: 8 seeded花海/区域赛 + 20 主流大型马拉松 (北京、上海、广州、厦门、杭州、深圳、武汉、成都、南京、重庆、兰州、太原、西安、大连、青岛、宁波、苏州、无锡、衡水湖、东营黄河口) — all bound to crawler with official URLs.
- Past races (e.g. Boston/London/Tokyo/Paris 2026) have 2027 editions added so they remain in the upcoming list.
- Some Chinese race sites may fail (DNS/timeout) from Replit's network — these auto-retry on schedule.

### 2026-05-02 manual data fill (web search)

Used `webSearch` to find authoritative race dates / registration windows / official URLs and ran a single transactional UPDATE on `marathon_editions`. Results tagged `field_sources.raceDate.source = 'web_search'`. Key fixes:

- Confirmed dates: 上海 12-06 (报名中 4/29-5/29), 兰州 05-24 (已截止), 杭州 11-01, 太原 09-27, 衡水湖 09-17, 深圳 12-06, 北京 11-01.
- WMM: 波士顿 2027-04-19, 伦敦 2027-04-25 (已截止), 东京 2027-03-07, 巴黎 2027-04-11 (报名中), 柏林 2026-09-27 (已截止), 芝加哥 2026-10-11 (已截止), 纽约 2026-11-01.
- Reseasoned (real 2026 race already happened, moved to 2027 prediction): 大连, 宁波, 苏州.
- Fixed wrong months: 东营黄河口 → October not April.
- Fixed wrong URLs: 西安 (xian.marathon.org.cn), 青岛 (qd-mls.com), 无锡 (wuxi.marathon.org.cn), 宁波 (shuzixindong).

### 2026-05-02 third-party aggregator binding

国内外马拉松大量使用第三方报名/聚合平台。已对 9 个平台完成研究，按角色分层：

**第一档（priority 88-92）核心数据源 — 5 个**

- **最酷 zuicool**（priority 90，6 绑）：上海 64264 / 杭州 88174 / 广州 16059 / 深圳 79945 / 太原 21936 / 兰州 49082
- **马拉马拉 mararun**（priority 88，6 绑）：北京/广州/深圳/南京/武汉 用 `{city}-registration.mararun.com`；成都用 `chengdu-marathon.mararun.com`
- **百马汇 marathonbm**（priority 89，批次绑定）：田协官方合作伙伴聚合，398 页约 4000 条赛事候选池
- **CHINARUN 玩比赛**（priority 92，10 绑）：**海外/六大满贯独家** —— 澳门/新加坡/首尔/大阪/维也纳/布拉格/皇后镇/吴哥/黄金海岸/阳光海岸
- **跑IN中国 runninginchina**（priority 85）：RESTful 友好分页，详情页含独家「官方网址」字段，可补全 `marathons.website_url`

**第二档（priority 87）对标参考 — 1 个**

- **NowRun 闹跑**（priority 87，0 绑）：本项目最直接的对标产品，Next.js SSR，主页含 ~490 个 2026 race。**仅作发现源 + 对标参考，绝不做主源**；`min_interval_seconds=86400`（每天 1 次）以体现竞品边界

**辅助/已废 — 4 个（详见 iranshao 与 shuzixindong 状态评估报告）**

- **数字心动 shuzixindong**（活跃，1 绑）：仅宁波有独立子站；主 SPA 不可爬
- **田协 runchina**（活跃，0 绑）：详情页 SPA 不可爬，靠官方 PDF 赛历
- **爱燃烧 iranshao**（活跃占位，0 绑）：旧 URL 全 404，赛事库已下线
- **悦跑圈 thejoyrun**（不活跃）：所有赛事数据封闭在 APP 内，web 端只有占位页
- **42travel**（不活跃）：域名已停运（504/连接超时）

详细爬取方案见 `docs/研究报告/`（共 11 篇研究报告）：
- `研究报告-最酷zuicool爬取方案.md` · `研究报告-马拉马拉mararun爬取方案.md` · `研究报告-百马汇marathonbm爬取方案.md`
- `研究报告-chinarun玩比赛爬取方案.md` · `研究报告-NowRun-nowrun爬取方案.md` · `研究报告-runninginchina跑IN中国爬取方案.md`
- `研究报告-iranshao与shuzixindong状态评估.md`（含 joyrun + 42travel 不可爬评估）
- `研究报告-runchina田协赛历方案.md`

⚠️ 厦马 2026/01 与宁波 2026/03 在最酷的页面对应已结束的届次，未绑定到 2027 届。
⚠️ 部分顶级赛事自有平台（上马 shang-ma.com、厦马 xmim.org、杭马 hzim.org）不上 mararun，保留官网。
⚠️ CHINARUN 即使作为海外赛事独家渠道，**默认 `is_primary=false`**，让 `marathons.website_url`（官方主域）由 `official` 主源持有；仅当官网完全失效才升为 primary。

### 2026-05-02 NowRun 候选去重入库（59 → 403 总 marathons）

从 NowRun 主页 490 个 2026 race 链接出发，按 city/name 模糊匹配剔除 DB 已存在的，得到 447 个新候选，分两批入库：

**批次 h — 春季已完赛 57 个**（2026-05-02h-nowrun-cn-batch-58.sql）：精选 60 个抓 nowrun 详情页（2 个 404），最终 57 个 race_date < 今天的国内中型/特色赛事（30 全马 + 27 半马），用人类可读 canonical_name（如 `shijiazhuang-marathon-2026`）。覆盖石家庄/雄安/保定/芜湖/蚌埠/阜阳/荆州/十堰/咸宁等 30 个全马城市 + 北京/天津/上海/苏州/扬州等 27 个半马。**注意**：当前 `client/src/components/MarathonTable.tsx` line 153-157 无条件隐藏 race_date<today 的赛事，故批次 h 在前端不可见，仅作历史档案 + 2027 届回归基准。如需可见，要加 `showPast` toggle（见 Known Limitations）。

**批次 i — 上半年后段未结束 277 个**（2026-05-02i-nowrun-cn-upcoming-277.sql）：抓全部剩余 389 候选详情页，筛 race_date >= 2026-05-02 得 277 个未来赛事（5 月 24 / 6 月 13 / 7 月 6 / 8 月 20 / 9 月 35 / 10 月 53 / 11 月 92 / 12 月 34），全部 status=待公布，立即在主页可见。canonical_name 用机械约定 `nowrun-{race_id}-2026`（277 条不可能逐一手工取 pinyin），可后续按需重命名为 SEO slug。

两批均绑定 `nowrun-001-cn-2026` 为非主源（`is_primary=false`），field_sources 用正确的 `{raceDate: {source, updatedAt, value}}` 形态。

**最终库存**：403 marathons（378 China + 25 海外），2026 editions 状态分布：待公布 301 / 已完赛 72 / 报名中 10 / 已截止 8 / 即将开始 2。

### 2026-05-02 NowRun 数据丰富化（PR-1）

从 NowRun 详情页解析出每个 race 的富数据，写入 `marathons` + `marathon_editions` 新增字段，并在详情页渲染。

**Schema 新增**：
- `marathons.{certification_grade, organizer, official_wechat_account}`
- `marathon_editions.{distance_options(jsonb), highlights, start_location, finish_location, packet_pickup_location, medal_image_urls(text[]), registration_channels(text[]), official_documents(jsonb)}`

**回填脚本**：`script/backfill-nowrun-rich.ts`
- 对所有 NowRun 绑定的 2026 届次（共 334 条）执行 fetch + 轻量 HTML→md 解析；fetch 带 8s AbortController 超时。
- CLI: `--offset=N --limit=N --dry --url=...`，分块跑避免单次进程超长。
- Dev + Prod 各 5 批跑完，extracted=334/334 0 失败。
- 覆盖率（prod）：cert/organizer 334、wechat 295、distance_options 334、highlights 51、medal 30、channels 50、official_documents 158。

**前端**：`MarathonDetail.tsx` 用 IIFE 包裹 `latest = data.editions[0]`，新增 4 张卡片（赛事亮点 / 赛事信息含设项+起终点+领物 / 赛事奖牌 / 报名与官方信息含文档按钮+渠道Pills+公众号），头部加 A/B/C 类认证 badge 和主办方。`apiClient.ts` 加 `DistanceOption`/`OfficialDocuments`/扩展 `MarathonEditionDTO`。

PR-1 已完成。Tier B/C 字段（city_guide / weather / lottery_history / race_start_time）留待后续 PR。

### 2026-05-02 NowRun 缺源回填（PR-1.5）

针对原本没有 NowRun 源的 69 个赛事（44 国内 + 25 海外），补绑+回填。

**绑定脚本**：`script/bind-nowrun-extra.ts`
- 抓 NowRun 主页 492 个赛事链接（仅国内），写入 `/tmp/nowrun-races-unique.tsv`。
- `score(candidate, entry)` 多因子打分：距离类型必须一致 / 年份一致 / 城市命中 OR 名称词干命中（`nameStem` 去掉年份/届次/标点/距离后缀），加上长度相似性微调。阈值 80。
- `classify()` 拒绝非马拉松（如 10公里精英赛、嘉年华、越野）。
- CLI: `--apply` 实际写入；默认 dry-run。
- 44 国内候选中匹配 31 个，剩 13 个跳过原因：1 个 10K 赛、1 个嘉年华、2 个 NowRun 没收录（秦皇岛/长白山）、9 个 2027 届（NowRun 主页只有 2026）。
- 25 海外候选全跳过（NowRun 主页是国内列表，柏林/东京/纽约都没有）。

**增量回填**：`backfill-nowrun-rich.ts` 加 `--only-new` 标志（过滤 `certification_grade IS NULL AND distance_options IS NULL`），dev/prod 各跑 31 条全成功。

**最终库存**：365/378 国内赛事有 NowRun 源（96.6%），365 条 2026 届次 distance_options 全覆盖。

### 2026-05-02 Race Roster 海外全马批量导入

把 raceroster.com 上 ~200 场全程马拉松全部接入日历，海外覆盖从 25 暴增到 ~190。

**抓取脚本**：`script/fetch-raceroster-events.ts`
- 入口：`https://sitemap.raceroster.com/sitemaps/events_2026.xml`（17,425 URLs）→ 筛 466 含 "marathon" → 人工保留 203 个看似全马 URL → `/tmp/rr-marathon-clean.txt`。
- 8 路并发 + 12s 超时 + 1 次重试，从每页 `<script type=ld+json>` 提取 Event JSON-LD（name / locality / addressCountry / startDate / image / description）+ best-effort 外链官网。203/203 成功 → `/tmp/rr-events.tsv`。
- `ISO_TO_NAME` 把 ISO-2 国家码映射成项目命名（DE→Germany / GB→UK / US→USA / KR→South Korea 等）。

**导入脚本**：`script/import-raceroster.ts`（`--apply` 才写库）
- HTML 实体解码（`&#039;` → `'` 等）。
- **噪音过滤**（24 条）：charity portal / volunteer / expo / vendors / shakeout / workout / pacer team / first-timer program / corporate challenge / kick-off run / mini marathon / XC / 5 miler 等。
- **半马过滤**（9 条）：`\bdemi[\s-]?marathon\b`（魁北克 Demi-Marathon 系列）。
- **国家覆写**（37 条 regex）：raceroster JSON-LD 里 `addressCountry` 反映"卖票方"而非赛事所在地，导致旅游打包赛事错误归类（阿根廷代理卖巴拉圭/秘鲁/玻利维亚 → 全标 AR；南非代理卖整个非洲 → 全标 ZA）。按赛事名 regex 强制覆写城市+国家。
- **去重**：`dedupeStem(name) | locality_loose | date` 三元组，剥离 "Run for a Reason" / "International" / "(Canada site)" / "Weekend" / "Leg" 等干扰词。
- **既有匹配表**：`EXISTING_MATCH_BY_NAME` 把 7 个 rr_id 映射到现有海外赛事（柏林/开普敦/巴黎/悉尼/纽约/芝加哥/波尔多）的 Chinese name；运行时按 name 查 UUID（dev/prod 通用）。已存在的赛事只补 `marathon_sources` 绑定（`is_primary=false`），不重插。
- **新增赛事**：在事务内一次性插 `marathons` + `marathon_editions` (publish_status=published) + `marathon_sources` (is_primary=true)，避免部分写入留孤儿 marathon 行。
- **幂等**：`nameAvailable()` 严格按 name/canonical_name 唯一约束去查重；命中已存在直接 skip（不再加 `(RR1)` 后缀避免重跑产生鬼影）。

**新建 source 行**：`raceroster-001-international-2026`，name "Race Roster"，type=platform。

**最终库存**：dev 564 / prod 563 marathons，168 / 167 RR 绑定，54 国家（原 25 → 53 海外国家覆盖，新增 38 国如布隆迪、卢旺达、圣马丁、安提瓜、北马里亚纳群岛等）。

**已知 trade-off**：新增 161 个赛事保留英文/原文名（如 "BMW BERLIN-MARATHON 2026"），未译中文。批量翻译留作后续增强工作（可考虑 alias 表）。

**Prod 事故记录**：首次跑 prod 时 `EXISTING_MATCH` 硬编码 dev UUIDs，Bordeaux UUID 在 prod 不同导致 FK 失败崩溃；重跑时旧版 `nameAvailable` 用 `(RR1)` 后缀重试逻辑生成 87 条重复"鬼影"，已通过 SQL 一次清理（删除依赖 marathon_sources / marathon_editions 后删 marathons），并把脚本改为 name 查表 + 严格 skip。

### 2026-05-02 Race Roster 官网回填（深挖事件页）

raceroster.com 事件页 JSON-LD 不暴露官网，需从描述块 `event-description__overflow-protector` 抓 `<a href>`。

**抓取改进**（`script/fetch-raceroster-events.ts`）：把旧 `Click here|Website` 锚文本规则（命中率 9% = 18/203）换成"描述块内首个根路径外链 + 黑名单（社媒/CDN/maps/protecht/amazonaws）"，命中率拉到 64% = 130/203。

**回填脚本**（`script/update-raceroster-websites.ts`，新建）：仅给 RR 已绑定但 `website_url IS NULL` 的赛事补官网。**质量过滤**：要求 host 与赛事 slug/`canonical_name` 至少 1 个 ≥4 字符 token 重合，否则视作赞助商/酒店/PDF/慈善噪音并 skip（实际把 90 条候选过滤到 43 条高质量）。dev/prod 各 +43 →（ 18 + 43 = 61）/168 ≈ 36% RR 赛事现在有官网。

**已知遗留**：仍有 47 个赛事被质量过滤误杀（如 "Prince Edward Island Marathon" → peimarathon.ca 因 `peimarathon` 未拆词而落空），admin UI 可手工补。

**完整使用文档** → `.local/skills/raceroster/SKILL.md`

### 2026-05-03 越野赛事数据质量审查（链接 / 状态 / 配色）

**链接核查（结论：所有 1213 条越野赛事都有可点击外链）**：itra 886 + zuicool 997 + raceroster 323 + 杂项 4 = 1213 条全部填了 `marathons.website_url`（HEAD 抽样均 200）。`marathon_editions.registration_url` 是 0 — 三个越野源都不暴露报名页直链，前端 EventDetails / MarathonTable / MarathonDetail 都已在没有 reg url 时回退到 website_url，无需改。

**状态来源（结论：越野状态只能从 race_date 推，因为没有报名期）**：itra/zuicool/raceroster 三个 importer 抓不到 registration_open/close_date，所以 `computeStatus(raceDate)` 只输出 `upcoming`/`ended`，永远不会出现 `open`/`closed`。这是数据本身的限制，不是 bug。马拉松类（nowrun + 手工）有报名期，所以保留 419 upcoming / 11 open / 8 closed / 8 racing / 118 ended 的全状态分布。

**状态刷新脚本** `script/refresh-edition-statuses.ts`（dev + prod 已跑）：扫所有 published edition，调用 `recomputeStatus()`（私有版 `resolveEditionStatus`，区别是不会因为 stored=upcoming 就短路返回，让 race-day 能正确翻成 racing、过去日期翻成 ended）。本次跑出 dev=45 / prod=44 处变更（绝大多数 upcoming → racing 36 个 / racing → ended 8 个）。建议每天 cron 一次，或在每次 importer 跑完后顺带跑。`import-itra-trail.ts` / `import-zuicool-trail.ts` 的 `computeStatus` 也改成调 shared `computeEditionStatus`，新导入的赛事就能正确处理 race day。

**配色冲突（白底白字感）**：`STATUS_COLOR_CLASSES` 之前用 `bg-amber-50/blue-50/...` 这些 50 色阶，hex 几乎是纯白（amber-50=#fffbeb），落在 bg-card=#ffffff 的卡片上几乎看不到边界，给人"白底白字"的视错觉。已统一上调到 `bg-{color}-100` + `border-{color}-400` + `text-{color}-700`（暗色模式同步加深到 -700/-30），徽章在白卡片上有明显色块边界。

### 2026-05-03 首页加国家筛选

海外越野上千条事件后，月份/状态筛选不够用。新增 `/api/marathons/countries?region=&kind=` 端点（按 region+kind 分组返回 `[{country,count}]`，按 count desc 排序），`apiClient.getMarathonCountries()` 包装。`Home.tsx` 加 `countryFilter` 状态 + Select（仅在 `region!==China && countries.length>1` 时显示，避免大陆 1 个国家时占位），切换 region/kind 时自动重置为 "all"。`MarathonTable` props 与 `useMarathons` 透传 `country`。`filters.country` / `filters.allCountries` 已加入 zh/en i18n。后端 `/api/marathons` 已支持 country=eq 早就具备，无需改动。

## Known Limitations / Future Work

- `MarathonTable.tsx` line 153-157 无条件过滤 race_date<today 的赛事，导致批次 h 的 57 个春季历史赛事在前端不可见。如需让用户能搜索到 "石家庄马拉松" 等历史赛事，应在 Home.tsx 加 `showPast` 状态 + 状态筛选器加上 `已完赛` 选项 + 把 prop 传给 MarathonTable 让 line 156 条件化。
- Batch i 的 277 个赛事用机械 canonical_name `nowrun-{id}-2026`，URL 不够 SEO 友好。可在用户点开时按 city pinyin 重命名（保留 alias 表）。
- Search uses basic `ILIKE` — Chinese fuzzy matching is mediocre
- WeChat binding in Profile is mocked (no real OAuth)
- `routes.ts` (~2900 lines) and `AdminData.tsx` (~2700 lines) are oversized
- `client/src/lib/mockData.ts` legacy file still exists, unused
- Public refresh rate limit is in-memory, resets on restart (acceptable for single instance)
