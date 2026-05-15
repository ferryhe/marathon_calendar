# Marathon Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the high-priority issues found in the project audit without changing page styling or backend database connection settings.

**Architecture:** Keep changes surgical and aligned with existing Express, Drizzle, React Query, and Vite patterns. Protect state-changing public routes, repair type/schema drift, make crawler config parsing match checked-in YAML, and fix frontend invalidation/input edge cases.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM, PostgreSQL, React 19, TanStack Query, Vite.

---

## File Map

- `server/routes.ts`: Add admin gating to unsafe mutation endpoints, disable direct WeChat mock binding in production, include `imminent` where status enums are accepted, delete review child rows before deleting a review, and avoid logging massive raw crawl responses.
- `server/index.ts`: Trust proxy in production, redact/summarize API response logging.
- `server/syncScheduler.ts`: Support both `selector` and `selectors` extraction-rule shapes.
- `server/editionMerge.ts`: Persist `finishLocation` on inserted editions.
- `shared/schema.ts`: Import `doublePrecision` and add cascade semantics for review child tables where supported by Drizzle schema.
- `client/src/pages/Home.tsx`: Invalidate the actual marathon list query key after sync completes.
- `client/src/hooks/useMarathons.ts`: Export query key helpers already used by the list.
- `client/src/components/MarathonTable.tsx`: Escape search text before constructing a highlight regex.
- `client/src/lib/adminApi.ts`: Add `imminent` to admin edition status payload type.
- `.env.example`: Keep COS credentials blank by default so local upload falls back to `/uploads`.
- `package.json` and `package-lock.json`: Add direct runtime dependency for `nanoid`, which is imported by `server/vite.ts`.
- `README.md`: Update stale status and tech-stack notes that conflict with current code.

---

### Task 1: Server Safety Gates

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/index.ts`

- [x] **Step 1: Add tests or verification notes before implementation**

Because this repository does not currently have a test runner, verify this task by TypeScript check and direct route-code inspection after implementation:

```powershell
npm.cmd run check
rg -n "app.post\(\"/api/marathons\"|app.post\(\"/api/marathons/refresh\"|requireAdmin\(req\)|isProduction" server\routes.ts server\index.ts
```

- [x] **Step 2: Protect unsafe state-changing routes**

In `server/routes.ts`, change `archive-past`, `refresh`, and generic `POST /api/marathons` so they require admin authorization. For route handlers that currently use `_req`, rename to `req` and call `requireAdmin(req)` before mutating.

- [x] **Step 3: Disable client-submitted WeChat mock binding in production**

In `POST /api/users/me/wechat/bind`, reject when `NODE_ENV=production` with a 404 or 403 before parsing and writing user-supplied `openid`.

- [x] **Step 4: Add production proxy trust and safe logging**

In `server/index.ts`, call `app.set("trust proxy", 1)` in production before session middleware. Replace full API response logging with a bounded summary that never emits `rawContent`, `password`, `token`, `secret`, or large payloads.

- [x] **Step 5: Verify**

Run:

```powershell
npm.cmd run check
```

Expected: no TypeScript errors related to modified server files.

---

### Task 2: Schema, Merge, and Status Consistency

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/editionMerge.ts`
- Modify: `server/routes.ts`
- Modify: `client/src/lib/adminApi.ts`

- [x] **Step 1: Add missing schema import**

Add `doublePrecision` to the `drizzle-orm/pg-core` import list in `shared/schema.ts`.

- [x] **Step 2: Preserve finish location on inserted editions**

In `server/editionMerge.ts`, include `finishLocation: params.incoming.finishLocation ?? null` in the insert values.

- [x] **Step 3: Align status enums**

Add `"imminent"` to:

```ts
new Set(["upcoming", "imminent", "open", "closed", "racing", "ended", "cancelled"])
```

and to the admin `status` payload enum in both `server/routes.ts` and `client/src/lib/adminApi.ts`.

- [x] **Step 4: Make review deletion robust**

Before deleting a review in `DELETE /api/reviews/:id`, delete matching rows from `reviewLikes` and `reviewReports`, then delete the review. Keep the owner check unchanged.

- [x] **Step 5: Verify**

Run:

```powershell
npm.cmd run check
rg -n "doublePrecision|finishLocation|imminent|reviewLikes|reviewReports" shared\schema.ts server\editionMerge.ts server\routes.ts client\src\lib\adminApi.ts
```

Expected: status values include `imminent`, finish location is inserted, and review child rows are removed before parent deletion.

---

### Task 3: Crawler Config Compatibility

**Files:**
- Modify: `server/syncScheduler.ts`

- [x] **Step 1: Support `selectors` fallback arrays**

Update `readRule` so it accepts either:

```json
{ "selector": ".race-date", "attr": "text" }
```

or:

```json
{ "selectors": [{ "selector": ".race-date", "attr": "text" }] }
```

For `selectors`, return the first valid rule. Keep existing single-rule behavior unchanged.

- [x] **Step 2: Verify**

Run:

```powershell
npm.cmd run check
rg -n "selectors|readRule" server\syncScheduler.ts config\sources.yaml
```

Expected: YAML rules using `selectors` are no longer ignored by the parser.

---

### Task 4: Frontend Behavior Fixes Without Style Changes

**Files:**
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/components/MarathonTable.tsx`

- [x] **Step 1: Fix React Query invalidation**

Import `marathonKeys` from `@/hooks/useMarathons` in `Home.tsx` and invalidate `marathonKeys.lists()` after sync completes instead of `["/api/marathons"]`.

- [x] **Step 2: Escape search highlight regex**

Add a small local helper in `MarathonTable.tsx`:

```ts
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Use the escaped value when constructing `new RegExp`.

- [x] **Step 3: Verify**

Run:

```powershell
npm.cmd run check
rg -n "marathonKeys|escapeRegExp|new RegExp" client\src\pages\Home.tsx client\src\components\MarathonTable.tsx
```

Expected: sync invalidates real list queries and special search characters cannot crash regex construction.

---

### Task 5: Environment and Documentation Hygiene

**Files:**
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [x] **Step 1: Prevent accidental COS mode in local env**

Set these sample values to blank in `.env.example`:

```env
COS_REGION=
COS_SECRET_ID=
COS_SECRET_KEY=
```

Keep `COS_BUCKET` as a harmless bucket-name example.

- [x] **Step 2: Add direct `nanoid` dependency**

Add `"nanoid": "^3.3.11"` to `dependencies` in `package.json`, and add it to the root package dependency map in `package-lock.json` using the already-present `node_modules/nanoid` lock entry.

- [x] **Step 3: Update stale README claims**

Update README status/date to reflect the current 2026-05 state, remove the outdated Passport/Puppeteer claims, and describe the actual auth/hash and Cheerio/HTML extraction stack.

- [x] **Step 4: Verify**

Run:

```powershell
npm.cmd run check
rg -n "COS_REGION=|nanoid|Passport|Puppeteer|当前版本|最后更新" .env.example package.json package-lock.json README.md
```

Expected: COS placeholders are blank, `nanoid` is a direct dependency, and README no longer advertises stale implementation details.

---

## Final Verification

- [x] Run `npm.cmd install` if `node_modules` is absent.
- [x] Run `npm.cmd run check`.
- [x] Run `npm.cmd run build` if dependencies are available.
- [x] Review `git diff --stat` and `git diff --check`.
- [x] Ensure no visual CSS/class changes were introduced except none expected.
- [x] Ensure no database connection strings or backend database connection logic were changed.

## Review Follow-up

- [x] Rewired the public Home refresh button to refresh React Query caches instead of calling the now admin-only `/api/marathons/refresh` route.
