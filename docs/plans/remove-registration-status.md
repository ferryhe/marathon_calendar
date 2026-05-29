# Plan: Remove `registration_status` — Migrate to `status` Enum

**Branch**: `refactor/remove-registration-status`  
**Status**: Planning

---

## Background

`marathon_editions` currently has two overlapping status fields:

| Field | Type | Content |
|-------|------|---------|
| `registration_status` | `text` (nullable) | Chinese strings written by crawlers (`报名中`, `已完赛`, …) |
| `status` | `text` (nullable) | New enum: `upcoming \| open \| closed \| imminent \| racing \| ended \| cancelled` |

As of 2026-05-29 the `status` column has been fully backfilled:

| status | count |
|--------|-------|
| ended | 839 |
| upcoming | 684 |
| open | 412 |
| closed | 37 |
| racing | 3 |

Goal: drop `registration_status` entirely; every status signal goes through the `status` enum.

---

## Final EditionStatus Semantics

| Value | ZH | EN | Rule |
|-------|----|----|------|
| `upcoming` | 敬请期待 | Upcoming | Default; no confirmed info |
| `open` | 报名中 | Open | Crawler confirms registration open |
| `closed` | 报名已截止 | Reg Closed | `registrationCloseDate < today` AND `raceDate > today + 14d` |
| `imminent` | 即将开始 | Imminent | `raceDate ≤ today + 14d` (and not yet racing) |
| `racing` | 比赛中 | Racing | `raceDate = today` |
| `ended` | 已完赛 | Ended | `raceDate < today` |
| `cancelled` | 已取消 | Cancelled | `cancelled = true` |

---

## Step-by-Step Implementation

> Steps must be done **in order**. Steps 1–7 are safe (additive/server-side only).  
> Step 8 (ALTER TABLE) is **irreversible** — only run after confirming Steps 1–7 are deployed and verified.

### Step 1 ✅ — Backfill `status` column (already done)

```sql
SELECT COUNT(*) FROM marathon_editions WHERE status IS NULL;
-- Expected: 0
```

---

### Step 2 — Rewrite `archivePastEditions()` and `flagImminentEditions()` in `server/syncScheduler.ts`

**Current** (writes to `registration_status` with Chinese strings):
```sql
UPDATE marathon_editions SET registration_status = '已完赛' WHERE ...
UPDATE marathon_editions SET registration_status = '即将开始' WHERE ...
```

**New** (write to `status` with enum values):
```sql
UPDATE marathon_editions SET status = 'ended' WHERE ...
UPDATE marathon_editions SET status = 'imminent' WHERE ...
```

Also update `field_sources` metadata key from `registrationStatus` → `status`.

The WHERE clause for `flagImminentEditions` must also change from  
`AND e.registration_status = '待公布'` → `AND e.status IN ('upcoming', 'open')`.

---

### Step 3 — Remove the legacy fallback branch in `server/routes.ts` (status filter)

**Current** (~line 1032):
```ts
if (NEW_ENUM.has(params.status)) {
  editionConditions.push(eq(marathonEditions.status, params.status));
} else {
  editionConditions.push(eq(marathonEditions.registrationStatus, params.status)); // ← remove
}
```

**New**: Drop the `else` branch entirely. Callers passing unknown/legacy status strings get no results (or a 400 — pick one).

---

### Step 4 — Update Admin PATCH endpoint in `server/routes.ts`

Remove `registrationStatus` from the Zod schema and from the `UPDATE` payload:
```ts
// Remove:
registrationStatus: z.string().trim().min(1).max(200).nullable().optional(),

// Keep / add (if not already there):
status: z.enum(["upcoming","open","closed","imminent","racing","ended","cancelled"]).nullable().optional(),
```

---

### Step 5 — Clean up `server/editionMerge.ts`

Remove `registrationStatus` from:
- `EditionIncomingFields` type definition
- conflict-tracking array (`{ key: "registrationStatus", … }`)
- any merge assignment that writes to `registrationStatus`

---

### Step 6 — Stop returning `registrationStatus` from API responses in `server/routes.ts`

Remove `registrationStatus: marathonEditions.registrationStatus` from all `select({…})` calls (marathon list, detail, edition history, etc.).

Update the corresponding TypeScript types in `lib/apiClient.ts` (client-side) — remove `registrationStatus` from `MarathonListItem`, `MarathonEdition`, etc.

---

### Step 7 — Remove `legacyStatus` from frontend

**StatusBadge.tsx**:
- Remove `legacyStatus` from `StatusBadgeProps`
- Remove it from the `resolveEditionStatus(…)` call

**resolveEditionStatus in `shared/status.ts`**:
- Remove `legacyStatus` parameter
- Remove the `mapLegacyStatus(legacy)` call and steps 3–4 of the priority chain
- Keep: explicit `status` wins → date-derived result

**All callers of `<StatusBadge>`** (`MarathonTable.tsx` ×3, `MarathonDetail.tsx` ×2):
- Remove `legacyStatus={…}` prop

**`client/src/pages/Home.tsx`**:
- Replace the `STATUS_KEY` Chinese-string map with a direct new-enum map, or remove it if unused after this change.

---

### Step 8 — ALTER TABLE (irreversible — run only after Steps 1–7 are deployed)

```sql
-- Verify no writes since Step 2 was deployed:
SELECT DISTINCT registration_status
FROM marathon_editions
WHERE registration_status IS NOT NULL
  AND updated_at > '<step-2-deploy-time>';
-- Expected: 0 rows

-- Then drop:
ALTER TABLE marathon_editions DROP COLUMN registration_status;
```

---

### Step 9 — Delete dead code

- Delete `mapLegacyStatus()` from `shared/status.ts`
- Delete `registrationStatus` field from `marathonEditions` in `shared/schema.ts`
- Delete migration scripts that referenced `registrationStatus` if no longer needed

---

## Verification Checklist

After each step, before merging:

```sql
-- No nulls remain
SELECT COUNT(*) FROM marathon_editions WHERE status IS NULL;

-- No new writes to legacy column (run after Step 2 deploy)
SELECT COUNT(*) FROM marathon_editions
WHERE registration_status IS NOT NULL AND updated_at > NOW() - INTERVAL '1 hour';

-- Status distribution looks sane
SELECT status, COUNT(*) FROM marathon_editions GROUP BY status ORDER BY count DESC;
```

Frontend smoke test:
- [ ] List page shows correct badges (open / closed / upcoming / imminent)
- [ ] Detail page shows correct status on latest and historical editions
- [ ] Status filter dropdown still works
- [ ] Admin manual-status update works with new `status` field

---

## Files Touched

| File | Change |
|------|--------|
| `server/syncScheduler.ts` | Rewrite archive/imminent functions (Step 2) |
| `server/routes.ts` | Remove legacy filter fallback, update admin API, stop returning registrationStatus (Steps 3, 4, 6) |
| `server/editionMerge.ts` | Remove registrationStatus from types and merge logic (Step 5) |
| `client/src/lib/apiClient.ts` | Remove registrationStatus from client types (Step 6) |
| `client/src/components/StatusBadge.tsx` | Remove legacyStatus prop (Step 7) |
| `shared/status.ts` | Simplify resolveEditionStatus, delete mapLegacyStatus (Steps 7, 9) |
| `client/src/components/MarathonTable.tsx` | Remove legacyStatus prop (Step 7) |
| `client/src/pages/MarathonDetail.tsx` | Remove legacyStatus prop (Step 7) |
| `client/src/pages/Home.tsx` | Update STATUS_KEY (Step 7) |
| `shared/schema.ts` | Remove registrationStatus field (Step 9) |
| DB migration | `ALTER TABLE marathon_editions DROP COLUMN registration_status` (Step 8) |
