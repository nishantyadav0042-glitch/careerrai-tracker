// Runs SQL against the live Supabase project via the Management API.
// Usage: node scripts/run-mgmt-sql.mjs <sql-file-or-inline-sql>
// Reads the access token from the SUPABASE_ACCESS_TOKEN env var or %TEMP%\sbp_token.txt
import fs from 'fs';
import path from 'path';
import os from 'os';

const PROJECT_REF = 'pobhpszlsozeonejtzqy';

let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  const tokenFile = path.join(os.tmpdir(), 'sbp_token.txt');
  token = fs.readFileSync(tokenFile, 'utf-8').trim();
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/run-mgmt-sql.mjs <sql-file-or-inline-sql>');
  process.exit(1);
}
const sql = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf-8') : arg;

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
console.log(`HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
process.exit(res.ok ? 0 : 1);
