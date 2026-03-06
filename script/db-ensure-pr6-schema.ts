import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function hasUniqueIndexOnColumn(
  pool: pg.Pool,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await pool.query(
    `
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = $1
      and indexdef ilike '%unique%'
      and indexdef ilike '%' || '(' || $2 || ')' || '%'
    limit 1
  `,
    [table, column],
  );
  return result.rowCount > 0;
}

async function ensureUsersWechatUniqueConstraints(pool: pg.Pool) {
  const constraints = [
    {
      column: "wechat_openid",
      constraint: "users_wechat_openid_unique",
      dupQuery:
        "select wechat_openid as value, count(*)::int as count from users where wechat_openid is not null group by 1 having count(*) > 1",
    },
    {
      column: "wechat_unionid",
      constraint: "users_wechat_unionid_unique",
      dupQuery:
        "select wechat_unionid as value, count(*)::int as count from users where wechat_unionid is not null group by 1 having count(*) > 1",
    },
  ];

  for (const item of constraints) {
    const exists = await hasUniqueIndexOnColumn(pool, "users", item.column);
    if (exists) continue;

    const dup = await pool.query(item.dupQuery);
    if (dup.rowCount > 0) {
      const values = dup.rows
        .slice(0, 5)
        .map((r) => `${String(r.value)} (${r.count})`)
        .join(", ");
      throw new Error(
        `Cannot add UNIQUE constraint on users.${item.column}; duplicates found: ${values}`,
      );
    }

    await pool.query(
      `alter table users add constraint ${item.constraint} unique (${item.column})`,
    );
  }
}

async function ensureReviewLikeReportTables(pool: pg.Pool) {
  // Keep this DDL minimal and aligned with shared/schema.ts.
  await pool.query(`
    create table if not exists review_likes (
      id varchar primary key default gen_random_uuid(),
      review_id varchar not null references marathon_reviews(id),
      user_id varchar not null references users(id),
      created_at timestamptz not null default now()
    );
  `);
  await pool.query(`
    create unique index if not exists review_likes_unique
      on review_likes (review_id, user_id);
  `);

  await pool.query(`
    create table if not exists review_reports (
      id varchar primary key default gen_random_uuid(),
      review_id varchar not null references marathon_reviews(id),
      user_id varchar not null references users(id),
      created_at timestamptz not null default now()
    );
  `);
  await pool.query(`
    create unique index if not exists review_reports_unique
      on review_reports (review_id, user_id);
  `);
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("begin");
    await ensureUsersWechatUniqueConstraints(pool);
    await ensureReviewLikeReportTables(pool);
    await pool.query("commit");
    console.log("OK: ensured PR6 schema prerequisites");
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

