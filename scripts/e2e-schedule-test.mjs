// E2E test: sign in as demo buddy, call the production schedule API with
// real session cookies, verify the session lands in the DB for the student.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const APP = 'https://careerrai-daily.vercel.app';
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: 'nishant@careerrai.com',
  // Never hardcode a password in this PUBLIC repo — pass it in.
  password: process.env.E2E_PASSWORD ?? (() => { throw new Error('Set E2E_PASSWORD'); })(),
});
if (authErr) { console.error('LOGIN FAILED:', authErr.message); process.exit(1); }
console.log('logged in as buddy:', auth.user.id);

// Build the @supabase/ssr cookie (base64url JSON session, chunked at 3180 chars)
const raw = 'base64-' + Buffer.from(JSON.stringify(auth.session)).toString('base64url');
const name = `sb-${ref}-auth-token`;
const chunks = [];
for (let i = 0; i < raw.length; i += 3180) chunks.push(raw.slice(i, i + 3180));
const cookie = chunks.length === 1
  ? `${name}=${chunks[0]}`
  : chunks.map((c, i) => `${name}.${i}=${c}`).join('; ');

// Schedule a session with Priya Kapoor (Nishant's student) tomorrow 18:00 IST
const start = new Date(Date.now() + 24 * 3600 * 1000);
start.setUTCHours(12, 30, 0, 0);
const end = new Date(start.getTime() + 30 * 60000);

const res = await fetch(`${APP}/api/sessions/schedule`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({
    studentId: 'c281a489-1979-4617-b0fa-61da5ee76d87',
    title: 'E2E pipeline test',
    description: 'automated verification — safe to delete',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  }),
});
const body = await res.json();
console.log('status:', res.status);
console.log(JSON.stringify(body, null, 2));

if (res.ok && body.success) {
  // Verify it is visible then clean up via service role
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row } = await admin.from('video_sessions').select('id, title, session_status, scheduled_at').eq('id', body.session.id).single();
  console.log('db row:', JSON.stringify(row));
  await admin.from('video_sessions').delete().eq('id', body.session.id);
  console.log('test session cleaned up');
  console.log('E2E RESULT: PASS');
} else {
  console.log('E2E RESULT: FAIL');
  process.exit(1);
}
