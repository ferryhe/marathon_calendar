const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: '/opt/marathon_calendar/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const data = JSON.parse(fs.readFileSync('/tmp/itra-locations.json', 'utf8'));
const valid = data.filter(r => r.startLocation);
console.log('Valid records to update:', valid.length);

if (valid.length === 0) { pool.end(); process.exit(0); }

const timestamp = new Date().toISOString();
const values = valid.map((r) => {
  const loc = r.startLocation.replace(/'/g, "''");
  return `('${r.editionId}', '${loc}')`;
}).join(', ');

const sql = `
  UPDATE marathon_editions AS e
  SET start_location = v.loc,
      field_sources = jsonb_set(COALESCE(e.field_sources, '{}'), '{startLocation}', '{"source":"itra.run","at":"${timestamp}"}'),
      updated_at = NOW()
  FROM (VALUES ${values}) AS v(id, loc)
  WHERE e.id = v.id
`;

pool.query(sql)
  .then(() => {
    console.log('Batch update done!');
    return pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    return pool.end();
  });
