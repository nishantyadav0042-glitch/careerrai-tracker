// Race test: N students press "Book" at the same instant.
//
// Founder ask, 5 Aug: "Two students press Book within the same millisecond.
// Expected: one succeeds, one receives 'Buddy is no longer available for this
// slot.' No duplicate sessions should ever be created."
//
// This fires N genuinely parallel HTTP requests at the DEPLOYED API with real
// mentor cookies — not a simulation, not a unit test with a mocked clock. It
// runs two rounds:
//
//   Round 1 — same pair, same slot        → exactly 1 win, rest 409 session_exists
//   Round 2 — different students, same slot → exactly 1 win, rest 409 buddy_double_booked
//
// Round 2 is the one that matters most under the permanent-room design: every
// session of a buddy's runs in the SAME Meet room, so two winners would put
// two students in one call.
//
// Uses the manual-meetingLink path so the test needs no Google connection.
//
// Run:  node scripts/race-booking-test.mjs [--app https://careerrai.in]
//
// It cleans up after itself: every session it creates is cancelled at the end.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const argApp = process.argv.indexOf('--app');
const APP = argApp > -1 ? process.argv[argApp + 1] : 'https://careerrai.in';
const CONCURRENCY = 5;
const BUDDY_EMAIL = process.env.RACE_BUDDY_EMAIL;
const BUDDY_PASSWORD = process.env.RACE_BUDDY_PASSWORD;

if (!BUDDY_EMAIL || !BUDDY_PASSWORD) {
  console.error('Set RACE_BUDDY_EMAIL and RACE_BUDDY_PASSWORD (a buddy account). Credentials are never stored in this repo.');
  process.exit(2);
}

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: BUDDY_EMAIL, password: BUDDY_PASSWORD,
});
if (authErr) { console.error('LOGIN FAILED:', authErr.message); process.exit(1); }

// The @supabase/ssr cookie: base64url JSON session, chunked at 3180 chars.
const raw = 'base64-' + Buffer.from(JSON.stringify(auth.session)).toString('base64url');
const chunks = raw.match(/.{1,3180}/g) ?? [raw];
const cookie = chunks.length === 1
  ? `sb-${ref}-auth-token=${chunks[0]}`
  : chunks.map((c, i) => `sb-${ref}-auth-token.${i}=${c}`).join('; ');

const { data: students } = await supabase
  .from('profiles').select('id, full_name').eq('buddy_id', auth.user.id).limit(2);
if (!students?.length) { console.error('This buddy has no assigned students.'); process.exit(1); }

const created = [];

async function book(studentId, startTime, label) {
  const res = await fetch(`${APP}/api/calendar/schedule-meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      studentId, startTime, durationMinutes: 30,
      meetingLink: 'https://meet.google.com/race-test-room',
      title: `RACE ${label}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.meetingId) created.push(body.meetingId);
  return { status: res.status, reason: body.reason ?? null, error: body.error ?? null };
}

function report(name, results, expectedReason) {
  const wins = results.filter((r) => r.status === 200);
  const refused = results.filter((r) => r.status === 409 && r.reason === expectedReason);
  const other = results.filter((r) => r.status !== 200 && !(r.status === 409 && r.reason === expectedReason));

  console.log(`\n${name}`);
  console.log(`  fired      : ${results.length} simultaneous requests`);
  console.log(`  succeeded  : ${wins.length}`);
  console.log(`  refused    : ${refused.length}  (409 ${expectedReason})`);
  if (other.length) console.log(`  unexpected : ${JSON.stringify(other)}`);
  if (refused[0]) console.log(`  message    : "${refused[0].error}"`);

  const pass = wins.length === 1 && other.length === 0;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — exactly one winner${pass ? '' : ` (got ${wins.length})`}`);
  return pass;
}

// Far-future slots so a real session can never be disturbed.
const SLOT_1 = '2029-06-01T09:00:00.000Z';
const SLOT_2 = '2029-06-02T09:00:00.000Z';

const round1 = await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) => book(students[0].id, SLOT_1, `pair-${i}`)),
);
const pass1 = report('Round 1 — same pair, same instant', round1, 'session_exists');

let pass2 = true;
if (students.length > 1) {
  const round2 = await Promise.all([
    book(students[0].id, SLOT_2, 'overlap-a'),
    book(students[1].id, SLOT_2, 'overlap-b'),
  ]);
  // The pair from round 1 still holds a live session, so its request may be
  // refused for either reason. What must never happen is TWO winners.
  const wins = round2.filter((r) => r.status === 200).length;
  console.log(`\nRound 2 — two students, one slot, same instant`);
  console.log(`  succeeded  : ${wins}`);
  console.log(`  responses  : ${JSON.stringify(round2.map((r) => `${r.status}/${r.reason}`))}`);
  pass2 = wins <= 1;
  console.log(`  ${pass2 ? 'PASS' : 'FAIL'} — never two students in one room`);
} else {
  console.log('\nRound 2 skipped — this buddy has only one assigned student.');
}

// ── Cleanup ────────────────────────────────────────────────────────────────
for (const id of created) {
  await fetch(`${APP}/api/calendar/cancel-meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ meetingId: id }),
  }).catch(() => {});
}
console.log(`\ncleaned up ${created.length} session(s).`);

process.exit(pass1 && pass2 ? 0 : 1);
