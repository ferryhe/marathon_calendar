// One-shot migration: backfill marathon_editions.status from
// (legacy registration_status, race_date, registration_open/close_date).
//
// Usage:
//   tsx script/migrate-edition-status.ts            # dev (DATABASE_URL)
//   tsx script/migrate-edition-status.ts --prod     # prod (PROD_DATABASE_URL)

import { Pool } from "pg";
import { mapLegacyStatus, computeEditionStatus, type EditionStatus } from "../shared/status";

const useProd = process.argv.includes("--prod");
const url = useProd ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(`Missing ${useProd ? "PROD_DATABASE_URL" : "DATABASE_URL"}`);
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{
      id: string;
      registration_status: string | null;
      race_date: string | null;
      registration_open_date: string | null;
      registration_close_date: string | null;
      status: string | null;
    }>(
      `SELECT id, registration_status, race_date, registration_open_date, registration_close_date, status
         FROM marathon_editions
        WHERE status IS NULL`,
    );

    const counts: Record<EditionStatus, number> = {
      upcoming: 0, open: 0, closed: 0, racing: 0, ended: 0, cancelled: 0,
    };

    let updated = 0;
    for (const row of rows) {
      const legacy = mapLegacyStatus(row.registration_status);
      let next: EditionStatus;

      // Trust legacy "ended" / "cancelled" outright.
      if (legacy === "ended" || legacy === "cancelled") {
        next = legacy;
      } else {
        // Otherwise compute from dates; if computation says "upcoming" but legacy
        // gave us a more specific signal (open/closed), keep the legacy hint.
        const computed = computeEditionStatus({
          raceDate: row.race_date,
          registrationStart: row.registration_open_date,
          registrationEnd: row.registration_close_date,
        });
        if (computed === "upcoming" && (legacy === "open" || legacy === "closed")) {
          next = legacy;
        } else {
          next = computed;
        }
      }

      await pool.query(
        `UPDATE marathon_editions SET status = $1, updated_at = NOW() WHERE id = $2`,
        [next, row.id],
      );
      counts[next]++;
      updated++;
    }

    console.log(`[${useProd ? "PROD" : "DEV"}] Backfilled ${updated} editions:`);
    console.log(JSON.stringify(counts, null, 2));

    const remaining = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM marathon_editions WHERE status IS NULL`,
    );
    console.log(`Remaining NULL status: ${remaining.rows[0].count}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
