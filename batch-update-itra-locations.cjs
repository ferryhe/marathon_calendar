const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: '/opt/marathon_calendar/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const data = JSON.parse(fs.readFileSync('/tmp/itra-locations.json', 'utf8'));
const valid = data.filter(r => r.startLocation);
console.log('Valid records to update:', valid.length);

if (valid.length === 0) { pool.end(); process.exit(0); }

// Build FieldSourceInfo-compatible provenance (consistent with upsertEditionWithMerge)
const provenance = JSON.stringify({
  sourceId: 'itra-001',
  sourceType: 'itra',
  priority: 90,
  rank: 90, // computeSourceRank('itra', 90) = 90 * 1000 + typeRank
  at: new Date().toISOString(),
  value: 'itra.run',
});

// Parameterized batch update using unnest — safe against SQL injection
// editionIds and locations are passed as separate array parameters (zero-indexed $N)
const BATCH = 100;
for (let i = 0; i < valid.length; i += BATCH) {
  const batch = valid.slice(i, i + BATCH);
  const editionIds = batch.map(r => r.editionId);
  const locations = batch.map(r => r.startLocation);

  const sql = `
    UPDATE marathon_editions AS e
    SET start_location = u.loc,
        field_sources = jsonb_set(COALESCE(e.field_sources, '{}'), '{startLocation}', $1::jsonb),
        updated_at = NOW()
    FROM unnest($2::varchar[], $3::varchar[]) AS u(id, loc)
    WHERE e.id = u.id
  `;

  // Note: provenance ($1) is a JSON literal string — safe since it comes from hardcoded structure
  await pool.query(sql, [provenance, editionIds, locations]);
  console.log(`  Batch ${Math.floor(i / BATCH) + 1}: updated ${batch.length} records`);
}

await pool.end();
console.log('Batch update done!');
