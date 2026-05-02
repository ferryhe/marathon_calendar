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

国内马拉松大量使用 **最酷 zuicool.com** 和 **马拉马拉 mararun.com** 作为唯一报名通道。已启用这两个 source 并绑定：

- 最酷直链 (`zuicool.com/event/{id}`): 上海 64264, 杭州 88174, 广州 16059, 深圳 79945, 太原 21936, 兰州 49082。
- mararun 子域名: 成都 `chengdu-marathon.mararun.com`, 深圳 `shenzhen-registration.mararun.com`。
- 这些 URL 已写入对应 edition 的 `registration_url`，用户点击"报名"即跳转最酷/马拉马拉的一键报名页。
- 官方网站仍保留在 `marathons.website_url`（信息源），第三方在 `marathon_sources`（备份/对比源 + 报名链接源）。
- ⚠️ 厦马 2026/01 与宁波 2026/03 在最酷的页面对应已结束的届次，未绑定到 2027 届。同步任务下次拉取最酷时若发现 2027 新页面会自动追加。

## Known Limitations / Future Work

- Search uses basic `ILIKE` — Chinese fuzzy matching is mediocre
- WeChat binding in Profile is mocked (no real OAuth)
- `routes.ts` (~2900 lines) and `AdminData.tsx` (~2700 lines) are oversized
- `client/src/lib/mockData.ts` legacy file still exists, unused
- Public refresh rate limit is in-memory, resets on restart (acceptable for single instance)
