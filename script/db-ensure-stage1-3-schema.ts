import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function columnExists(pool: pg.Pool, table: string, column: string) {
  const result = await pool.query(
    `
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
      and column_name = $2
    limit 1
  `,
    [table, column],
  );
  return result.rowCount > 0;
}

async function ensureSourcesColumns(pool: pg.Pool) {
  // sources table exists already in this repo; we extend it in-place.
  const table = "sources";
  const columns = [
    { name: "type", ddl: "text not null default 'official'" },
    { name: "strategy", ddl: "text not null default 'HTML'" },
    { name: "is_active", ddl: "boolean not null default true" },
    { name: "retry_max", ddl: "integer not null default 3" },
    { name: "retry_backoff_seconds", ddl: "integer not null default 30" },
    { name: "request_timeout_ms", ddl: "integer not null default 15000" },
    { name: "min_interval_seconds", ddl: "integer not null default 0" },
    { name: "config", ddl: "jsonb" },
    { name: "last_run_at", ddl: "timestamptz" },
    { name: "updated_at", ddl: "timestamptz not null default now()" },
  ];

  for (const col of columns) {
    if (!(await columnExists(pool, table, col.name))) {
      await pool.query(`alter table ${table} add column ${col.name} ${col.ddl}`);
    }
  }
}

async function ensureMarathonSourcesColumns(pool: pg.Pool) {
  const table = "marathon_sources";
  const columns = [
    { name: "last_hash", ddl: "text" },
    { name: "last_http_status", ddl: "integer" },
    { name: "last_error", ddl: "text" },
    { name: "next_check_at", ddl: "timestamptz" },
  ];

  for (const col of columns) {
    if (!(await columnExists(pool, table, col.name))) {
      await pool.query(`alter table ${table} add column ${col.name} ${col.ddl}`);
    }
  }
}

async function ensureMarathonSyncRunsColumns(pool: pg.Pool) {
  const table = "marathon_sync_runs";
  const columns = [
    { name: "strategy_used", ddl: "text" },
    { name: "attempt", ddl: "integer not null default 1" },
    { name: "message", ddl: "text" },
    { name: "new_count", ddl: "integer not null default 0" },
    { name: "updated_count", ddl: "integer not null default 0" },
    { name: "unchanged_count", ddl: "integer not null default 0" },
  ];

  for (const col of columns) {
    if (!(await columnExists(pool, table, col.name))) {
      await pool.query(`alter table ${table} add column ${col.name} ${col.ddl}`);
    }
  }

  // Best-effort: only set NOT NULL if safe.
  if (await columnExists(pool, table, "source_id")) {
    const nulls = await pool.query(
      "select count(*)::int as c from marathon_sync_runs where source_id is null",
    );
    if ((nulls.rows?.[0]?.c ?? 0) === 0) {
      await pool.query("alter table marathon_sync_runs alter column source_id set not null");
    }
  }
}

async function ensureRawCrawlDataTable(pool: pg.Pool) {
  await pool.query(`
    create table if not exists raw_crawl_data (
      id varchar primary key default gen_random_uuid(),
      marathon_id varchar not null references marathons(id),
      source_id varchar not null references sources(id),
      source_url text not null,
      content_type text,
      http_status integer,
      raw_content text,
      content_hash text,
      metadata jsonb,
      status text not null default 'pending',
      fetched_at timestamptz not null default now(),
      processed_at timestamptz
    );
  `);

  await pool.query(
    "create index if not exists raw_crawl_data_source_idx on raw_crawl_data (source_id)",
  );
  await pool.query(
    "create index if not exists raw_crawl_data_marathon_idx on raw_crawl_data (marathon_id)",
  );
  await pool.query(
    "create index if not exists raw_crawl_data_hash_idx on raw_crawl_data (content_hash)",
  );
  await pool.query(
    "create index if not exists raw_crawl_data_fetched_idx on raw_crawl_data (fetched_at desc)",
  );
  await pool.query(
    "create index if not exists raw_crawl_data_status_idx on raw_crawl_data (status)",
  );
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("begin");
    await ensureSourcesColumns(pool);
    await ensureMarathonSourcesColumns(pool);
    await ensureMarathonSyncRunsColumns(pool);
    await ensureRawCrawlDataTable(pool);
    await pool.query("commit");
    console.log("OK: ensured Stage 1.3 schema prerequisites");
  } catch (error) {
    try {
      await pool.query("rollback");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
