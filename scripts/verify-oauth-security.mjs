// Verifies that Google OAuth tokens are not readable by other users' clients.
// Signs in as a buddy (nishant@careerrai.com) with the public anon key and
// attempts to read students' OAuth tokens, plus probes the migration-014
// "USING (true)" profile-update hole. Run after applying migration 016.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf-8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => l.split('=', 2).map((s) => s.trim()))
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'CareerRai2026!';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// --- Buddy session ---
const buddy = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: buddyAuth, error: buddyErr } = await buddy.auth.signInWithPassword({
  email: 'nishant@careerrai.com',
  password: PASSWORD,
});
if (buddyErr) {
  console.error('Could not sign in as buddy:', buddyErr.message);
  process.exit(2);
}

// Buddy can still see their students' basic profiles (intended behavior)
const { data: students, error: stuErr } = await buddy
  .from('profiles')
  .select('id, full_name, college, google_calendar_connected')
  .eq('buddy_id', buddyAuth.user.id);
check('buddy can read students basic profiles', !stuErr && students?.length > 0,
  stuErr?.message ?? `${students?.length ?? 0} students`);

// 1. Token columns must be gone from profiles
const { error: colErr } = await buddy
  .from('profiles')
  .select('google_oauth_refresh_token')
  .eq('buddy_id', buddyAuth.user.id);
check('google_oauth_refresh_token no longer selectable on profiles', !!colErr,
  colErr ? colErr.message : 'column still exists and is readable!');

// 2. Buddy must read 0 rows from google_oauth_tokens (RLS owner-only)
const { data: tokRows, error: tokErr, status } = await buddy
  .from('google_oauth_tokens')
  .select('user_id, refresh_token');
const tokenTableSafe = (tokRows?.length ?? 0) === 0;
check('buddy reads 0 rows from google_oauth_tokens', tokenTableSafe,
  tokErr ? `${status}: ${tokErr.message}` : `${tokRows?.length ?? 0} rows`);

// 3. Migration-014 hole: buddy must NOT be able to update an arbitrary profile.
//    UPDATE with RLS silently affects 0 rows when no policy matches; use
//    .select() to observe the affected rows.
const victim = students?.[0];
if (victim) {
  const { data: updated } = await buddy
    .from('profiles')
    .update({ college: victim.college ?? null })  // no-op value, same column back
    .eq('id', victim.id)
    .select('id');
  check('buddy cannot UPDATE a student profile (014 hole closed)',
    (updated?.length ?? 0) === 0, `${updated?.length ?? 0} rows updated`);
} else {
  check('buddy cannot UPDATE a student profile (014 hole closed)', false, 'no student to test with');
}

// Owner can still read their own connection status (buddy reading own row)
const { error: ownErr } = await buddy
  .from('profiles')
  .select('google_calendar_connected')
  .eq('id', buddyAuth.user.id)
  .single();
check('user reads own google_calendar_connected', !ownErr, ownErr?.message);

await buddy.auth.signOut();

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
