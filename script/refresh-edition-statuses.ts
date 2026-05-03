/**
 * Refresh `marathon_editions.status` for all published rows by re-deriving
 * via the shared resolver. Handles:
 *   - upcoming → racing on race day
 *   - upcoming → ended after race day
 *   - keeps explicit "open"/"closed"/"cancelled" values intact when reg dates
 *     don't override them via computeEditionStatus
 *
 * Usage:
 *   tsx script/refresh-edition-statuses.ts                 # dev DB ($DATABASE_URL)
 *   tsx script/refresh-edition-statuses.ts --prod          # prod DB ($PROD_DATABASE_URL)
 *   tsx script/refresh-edition-statuses.ts --dry           # preview only
 */
import { Pool } from "pg";
import { computeEditionStatus, mapLegacyStatus, isEditionStatus } from "../shared/status.js";

// Re-derive a status, but unlike resolveEditionStatus we do *not* short-circuit
// on the stored value — that's the whole point of a refresh. Priority:
//   1. cancelled wins (from stored or legacy)
//   2. date-derived terminal states (ended/racing) trump everything else
//   3. date-derived open/closed (only when reg dates exist)
//   4. otherwise prefer stored explicit status, then legacy mapping, then upcoming
function recomputeStatus(row: {
  status: string | null;
  registration_status: string | null;
  race_date: string | null;
  registration_open_date: string | null;
  registration_close_date: string | null;
}): string {
  const stored = isEditionStatus(row.status) ? row.status : null;
  const legacy = mapLegacyStatus(row.registration_status);
  if (stored === "cancelled" || legacy === "cancelled") return "cancelled";
  const computed = computeEditionStatus({
    raceDate: row.race_date,
    registrationStart: row.registration_open_date,
    registrationEnd: row.registration_close_date,
  });
  if (computed === "ended" || computed === "racing") return computed;
  if (row.registration_open_date || row.registration_close_date) {
    if (computed === "open" || computed === "closed") return computed;
  }
  if (stored) return stored;
  if (legacy) return legacy;
  return computed;
}

const PROD = process.argv.includes("--prod");
const DRY = process.argv.includes("--dry");
const url = PROD ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(`Missing ${PROD ? "PROD_DATABASE_URL" : "DATABASE_URL"}`);
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

async function main() {
  const { rows } = await pool.query<{
    id: string;
    status: string | null;
    registration_status: string | null;
    race_date: string | null;
    registration_open_date: string | null;
    registration_close_date: string | null;
  }>(
    `SELECT e.id, e.status, e.registration_status, e.race_date,
            e.registration_open_date, e.registration_close_date
     FROM marathon_editions e
     WHERE e.publish_status='published'`,
  );

  const changes = new Map<string, number>();
  let updated = 0;

  for (const r of rows) {
    const newStatus = recomputeStatus(r);
    if (newStatus !== r.status) {
      const key = `${r.status ?? "null"} → ${newStatus}`;
      changes.set(key, (changes.get(key) ?? 0) + 1);
      if (!DRY) {
        await pool.query(
          `UPDATE marathon_editions SET status=$1, updated_at=now() WHERE id=$2`,
          [newStatus, r.id],
        );
      }
      updated++;
    }
  }

  console.log(`scanned=${rows.length} ${DRY ? "would-update" : "updated"}=${updated}`);
  for (const [k, v] of [...changes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
