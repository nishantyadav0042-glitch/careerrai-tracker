// Runs SQL against the live Supabase Postgres via the session pooler.
// Usage: node scripts/run-db-sql.mjs <sql-file-or-inline-sql>
// Password comes from SUPABASE_DB_PASSWORD env var.
import fs from 'fs';
import pg from 'pg';

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD');
  process.exit(1);
}

const arg = process.argv[2];
const sql = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf-8') : arg;

const client = new pg.Client({
  host: process.env.SUPABASE_POOLER_HOST || 'aws-1-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.pobhpszlsozeonejtzqy',
  password,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const r of results) {
    console.log(`-- ${r.command} (${r.rowCount ?? 0} rows)`);
    if (r.rows?.length) console.log(JSON.stringify(r.rows, null, 2));
  }
  console.log('OK');
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
