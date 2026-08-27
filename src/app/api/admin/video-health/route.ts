import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { decideBookability } from '@/lib/session-assignment';
import { createAdminClient } from '@/lib/supabase/admin';
import { googleConfigured } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// One-tap video-system health check (admin only).
//
// Rewritten 5 Aug when sessions moved to Google Meet. The old version created
// a Daily room and called that "healthy" — and Incident #21 proved that check
// answered the wrong question. A room existing tells you nothing about whether
// the two people were sent to the SAME one. So this now reports the things
// that actually break a session:
//
//   1. Is Google configured on the server at all?
//   2. Which mentors have connected their calendar — an unconnected mentor
//      cannot book, and finding that out at 9pm is too late.
//   3. Are there any pairs holding MORE THAN ONE live session? That is the
//      exact shape of Incident #21 and must always read zero.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: buddies }, { data: tokens }, { data: liveSessions }, { data: availRows }] = await Promise.all([
    admin.from('profiles').select('id, full_name, buddy_meet_url').eq('role', 'buddy'),
    admin.from('google_oauth_tokens').select('user_id, google_email'),
    // 'active' included: a LIVE session with a broken room is the worst case
    // this health check exists to catch, not one to filter out.
    admin.from('video_sessions').select('buddy_id, student_id').in('session_status', ['scheduled', 'active']),
    // Availability is HALF the canonical rule. Reading only tokens and rooms
    // is what made this file's verdict disagree with the booking API.
    admin.from('buddy_availability').select('buddy_id, active, timezone'),
  ]);

  const connected = new Map((tokens ?? []).map((t) => [t.user_id, t.google_email]));
  const availByBuddy = new Map(
    (availRows ?? []).map((a) => [a.buddy_id, { active: a.active as boolean | null, timezone: a.timezone as string | null }]),
  );
  const mentors = (buddies ?? []).map((b) => ({
    name: b.full_name,
    googleConnected: connected.has(b.id),
    googleEmail: connected.get(b.id) ?? null,
    // THE CANONICAL RULE, not a local re-derivation. This comment used to
    // claim these were "the same two conditions buddyBookingReadiness
    // enforces" — that stopped being true when the Google requirement was
    // removed as a design mistake, and this file never followed. It then
    // reported mentors as unable to book, blaming Google, while the API was
    // refusing them for a completely different reason.
    hasRoom: !!b.buddy_meet_url,
    canSchedule: decideBookability({
      availability: availByBuddy.get(b.id) ?? null,
      hasRoom: !!b.buddy_meet_url,
      googleConnected: connected.has(b.id),
    }).bookable,
  }));

  // Incident #21 guard: a pair must never hold two live sessions at once.
  const perPair = new Map<string, number>();
  for (const s of liveSessions ?? []) perPair.set(`${s.buddy_id}|${s.student_id}`, (perPair.get(`${s.buddy_id}|${s.student_id}`) ?? 0) + 1);
  const duplicatePairs = [...perPair.entries()].filter(([, n]) => n > 1).length;

  const blockedMentors = mentors.filter((m) => !m.canSchedule).map((m) => m.name);
  const ok = googleConfigured() && blockedMentors.length === 0 && duplicatePairs === 0;

  return NextResponse.json({
    ok,
    googleConfigured: googleConfigured(),
    mentors,
    duplicateLivePairs: duplicatePairs,
    message: ok
      ? 'Every mentor can schedule, and no pair holds two live sessions.'
      : [
          !googleConfigured() && 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the server.',
          blockedMentors.length > 0 && `These mentors cannot schedule until they connect Google: ${blockedMentors.join(', ')}.`,
          duplicatePairs > 0 && `${duplicatePairs} pair(s) hold more than one live session — this is the Incident #21 shape.`,
        ].filter(Boolean).join(' '),
  }, { status: ok ? 200 : 503 });
}
