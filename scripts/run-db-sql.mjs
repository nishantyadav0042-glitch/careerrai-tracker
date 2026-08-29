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

// ── TLS VERIFICATION IS NOT OPTIONAL ON THIS CONNECTION ─────────────────────
//
// 29 Aug 2026, Semgrep `bypass-tls-verification` on main.
//
// This script opens the PRODUCTION database as the postgres superuser with the
// password in the environment. It used to disable certificate verification
// outright, accepting ANY certificate from ANY host that answers — so the most
// privileged credential the company has, and every row it returns, travelled
// one hostile network away from being read by whoever answered first.
//
// Supabase's pooler presents a publicly-trusted certificate, so verification
// works against the system CA store with no extra configuration. If a
// handshake ever fails with a certificate error, the fix is to supply
// Supabase's own CA — download it from the dashboard (Project Settings →
// Database → SSL configuration) and set SUPABASE_CA_CERT to that file's path.
// It is never to turn verification off again.
const caPath = process.env.SUPABASE_CA_CERT;

const client = new pg.Client({
  host: process.env.SUPABASE_POOLER_HOST || 'aws-1-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.pobhpszlsozeonejtzqy',
  password,
  ssl: {
    rejectUnauthorized: true,
    ...(caPath ? { ca: fs.readFileSync(caPath, 'utf-8') } : {}),
  },
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
  // Name the one failure whose fix is not obvious from the message, so nobody
  // reaches for the old verification bypass again to make it go away.
  if (/certificate|self.signed|unable to verify|CERT_/i.test(err.message ?? '')) {
    console.error(
      '\nThis is a TLS certificate failure, not a credential failure.\n'
      + 'Download the CA from Supabase (Project Settings -> Database -> SSL configuration)\n'
      + 'and re-run with SUPABASE_CA_CERT=/path/to/prod-ca.crt',
    );
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
