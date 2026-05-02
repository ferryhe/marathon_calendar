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
- `marathons` — canonical race entity (canonical_name, city, country)
- `marathon_editions` — year-specific data (race_date, registration_status/url, field_sources jsonb for provenance)
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

国内马拉松大量使用 **最酷 zuicool.com** 和 **马拉马拉 mararun.com** 作为报名通道。已对 5 个第三方平台逐一研究并撰写文档（见 `docs/研究报告/`）：

- **最酷 zuicool**（活跃，6 绑）：上海 64264 / 杭州 88174 / 广州 16059 / 深圳 79945 / 太原 21936 / 兰州 49082
- **马拉马拉 mararun**（活跃，6 绑）：北京/广州/深圳/南京/武汉 用 `{city}-registration.mararun.com`；成都用 `chengdu-marathon.mararun.com`
- **数字心动 shuzixindong**（活跃，1 绑）：仅宁波有独立子站 `ningbomarathon.shuzixindong.com`，其余子域 DNS 失败；主站是 SPA 不可爬
- **爱燃烧 iranshao**（活跃，0 绑）：旧 `/races/{id}` URL 全部 404，赛事数据库已下线，仅留新闻
- **田协 runchina**（活跃，0 绑）：详情页 SPA 不可爬，作为通用权威信息源；建议每年 1 月解析一次官方 PDF 赛事目录

详细爬取方案见：
- `docs/研究报告/研究报告-最酷zuicool爬取方案.md`
- `docs/研究报告/研究报告-马拉马拉mararun爬取方案.md`
- `docs/研究报告/研究报告-iranshao与shuzixindong状态评估.md`
- `docs/研究报告/研究报告-runchina田协赛历方案.md`

⚠️ 厦马 2026/01 与宁波 2026/03 在最酷的页面对应已结束的届次，未绑定到 2027 届。
⚠️ 部分顶级赛事自有平台（上马 shang-ma.com、厦马 xmim.org、杭马 hzim.org）不上 mararun，保留官网。

## Known Limitations / Future Work

- Search uses basic `ILIKE` — Chinese fuzzy matching is mediocre
- WeChat binding in Profile is mocked (no real OAuth)
- `routes.ts` (~2900 lines) and `AdminData.tsx` (~2700 lines) are oversized
- `client/src/lib/mockData.ts` legacy file still exists, unused
- Public refresh rate limit is in-memory, resets on restart (acceptable for single instance)
