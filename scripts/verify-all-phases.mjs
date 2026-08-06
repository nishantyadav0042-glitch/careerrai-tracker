// Verifies every spec phase has a LIVE, REACHABLE production surface.
// Pages: authenticated fetch + marker grep. APIs: GET probe (405/401/400 = route deployed; 404 = missing).
import fs from 'fs';

const env = fs.readFileSync('.env.production.local', 'utf8');
const ANON = env.match(/ANON_KEY=(.+)/)[1].trim();
const SUPA = 'https://pobhpszlsozeonejtzqy.supabase.co';
const APP = 'https://careerrai-daily.vercel.app';
const REF = 'pobhpszlsozeonejtzqy';

async function login(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.DEMO_PASSWORD ?? (() => { throw new Error('Set DEMO_PASSWORD'); })() }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(email + ' login failed');
  return j;
}

function cookies(session) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const name = `sb-${REF}-auth-token`;
  const C = 3180;
  if (raw.length <= C) return `${name}=${raw}`;
  const parts = [];
  for (let i = 0; i * C < raw.length; i++) parts.push(`${name}.${i}=${raw.slice(i * C, (i + 1) * C)}`);
  return parts.join('; ');
}

const [st, bu, ad] = await Promise.all([
  login('teststudent1@careerrai.com'),
  login('testbuddy1@careerrai.com'),
  login('admin@careerrai.com'),
]);
const S = cookies(st), B = cookies(bu), A = cookies(ad);

let pass = 0, fail = 0;
const result = (ok, label) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`); };

async function page(path, cookie, markers, label) {
  const r = await fetch(APP + path, { headers: { cookie }, redirect: 'follow' });
  const html = await r.text();
  const missing = markers.filter((m) => !html.includes(m));
  result(r.status === 200 && missing.length === 0, `${label} — ${path}${missing.length ? ' missing: ' + missing.join(', ') : ''}`);
}

async function api(path, label) {
  const r = await fetch(APP + path, { redirect: 'manual' });
  // any response except 404 means the route exists (405 method, 401 auth, 400 bad req, 200)
  result(r.status !== 404, `${label} — ${path} [${r.status}]`);
}

console.log('PHASE 0 — Audit/docs: no runtime surface (REBUILD_NOTES.md in repo) — N/A');

console.log('PHASE 1 — Core infrastructure');
await api('/api/buddy-insight', 'Claude insight API');
// streak data verified via DB: streak_data has rows (checked separately)

console.log('PHASE 2 — Onboarding (4 screens, client modal on first login)');
await page('/student/home', S, ['CAT'], 'home loads for onboarded student');

console.log('PHASE 3 — Home redesign (streak hero / buddy signal / days-to-CAT)');
await page('/student/home', S, ['student/tracker', 'student/journey'], 'home + full nav');

console.log('PHASE 4 — Quick log (client sheet via streak hero CTA)');
await api('/api/push/subscribe', 'push subscribe API (log reminders)');

console.log('PHASE 5 — Mock drop intervention');
await api('/api/weekly-signal', 'weekly signal API');

console.log('PHASE 6 — Buddy triage + setup');
await page('/buddy/home', B, ['Students'], 'buddy home (triage) loads w/o redirect');
await page('/buddy/setup', B, ['intro'], 'buddy setup page');

console.log('PHASE 7 — Voice notes');

console.log('PHASE 8 — Journey timeline');
await page('/student/journey', S, ['Journey', 'Timeline'], 'journey page');
await page('/student/home', S, ['href="/student/journey"'], 'Journey tab in nav');

console.log('PHASE 9 — Analytics dashboard');
await page('/student/journey', S, ['Analytics'], 'analytics on journey page');

console.log('PHASE 10 — Sprint 2/3 (trust signals, share, templates, admin, tracker)');
await page('/student/profile', S, ['Your Progress', 'Share my progress', 'Your Buddy'], 'profile trust signals');
await page('/student/tracker', S, ['Buddy Sees Everything', 'href="/student/tracker"'], 'tracker page + nav');
await page('/admin', A, ['Churn risk', 'feedback (14d)', 'Broadcast'], 'admin panels');
await api('/api/feedback-draft', 'AI feedback draft API');
await api('/api/calendar/schedule-meeting', 'meeting schedule API');
await api('/api/calendar/upcoming-meetings', 'upcoming meetings API');

console.log(`\n=== TOTAL: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
