// Live feature verification: logs in via Supabase REST, builds @supabase/ssr
// cookies, fetches production pages, and greps rendered HTML for feature markers.
import fs from 'fs';

const env = fs.readFileSync('.env.production.local', 'utf8');
const ANON = env.match(/ANON_KEY=(.+)/)[1].trim();
const SUPA = 'https://pobhpszlsozeonejtzqy.supabase.co';
const APP = 'https://careerrai-daily.vercel.app';
const REF = 'pobhpszlsozeonejtzqy';

async function login(email, password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed: ' + JSON.stringify(j).slice(0, 200));
  return j;
}

function buildCookies(session) {
  // @supabase/ssr stores base64url-encoded JSON session, chunked at ~3180 chars
  const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const name = `sb-${REF}-auth-token`;
  const CHUNK = 3180;
  if (raw.length <= CHUNK) return `${name}=${raw}`;
  const parts = [];
  for (let i = 0; i * CHUNK < raw.length; i++) {
    parts.push(`${name}.${i}=${raw.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  return parts.join('; ');
}

async function fetchPage(path, cookies) {
  const r = await fetch(APP + path, {
    headers: { cookie: cookies, 'user-agent': 'Mozilla/5.0 verify-script' },
    redirect: 'follow',
  });
  const html = await r.text();
  return { status: r.status, url: r.url, html };
}

function check(html, markers) {
  return markers.map((m) => `${html.includes(m) ? 'OK ' : 'MISS'} ${m}`);
}

const [studentSession, buddySession, adminSession] = await Promise.all([
  login('teststudent1@careerrai.com', process.env.DEMO_PASSWORD ?? (() => { throw new Error('Set DEMO_PASSWORD'); })()),
  login('testbuddy1@careerrai.com', process.env.DEMO_PASSWORD ?? (() => { throw new Error('Set DEMO_PASSWORD'); })()),
  login('admin@careerrai.com', process.env.DEMO_PASSWORD ?? (() => { throw new Error('Set DEMO_PASSWORD'); })()),
]);
const sc = buildCookies(studentSession);
const bc = buildCookies(buddySession);
const ac = buildCookies(adminSession);

const tests = [
  ['/student/home', sc, ['CAT', 'buddy']],
  ['/student/tracker', sc, ['Daily', 'puzzle', 'Buddy Sees Everything']],
  ['/student/journey', sc, ['Journey', 'Analytics']],
  ['/student/profile', sc, ['Your Progress', 'Days logged', 'Best streak', 'Share my progress', 'Your Buddy']],
  ['/student/exams', sc, ['Test', 'CAT']],
  ['/buddy/students', bc, ['Student']],
  ['/admin', ac, ['Churn risk', 'feedback (14d)', 'Broadcast', 'CareerRai Overview']],
];

for (const [path, cookies, markers] of tests) {
  try {
    const { status, url, html } = await fetchPage(path, cookies);
    const redirected = !url.endsWith(path) ? ` REDIRECTED->${url.replace(APP, '')}` : '';
    console.log(`\n=== ${path} [${status}]${redirected} len=${html.length}`);
    for (const line of check(html, markers)) console.log('  ' + line);
  } catch (e) {
    console.log(`\n=== ${path} ERROR: ${e.message}`);
  }
}
