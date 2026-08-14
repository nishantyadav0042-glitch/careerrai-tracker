import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_SPECIALITIES, type Speciality } from '@/lib/session-credit';

// POST /api/buddy/profile — the specialist fields a mentor declares once.
//
// These decide which students reach them, so every one of them is validated
// server-side rather than trusted from the form. The speciality cap in
// particular is enforced here AND at a DB constraint: a cap that lives only in
// the UI is a cap until the first other writer.

const SPECIALITIES: Speciality[] = ['mock_analysis', 'strategy', 'consistency', 'second_attempt', 'section_depth'];
const SECTIONS = ['QA', 'VARC', 'DILR'];
const LANGUAGES = ['English', 'Hindi'];
/** What we can honestly promise a student at checkout. */
const NOTICE_HOURS = [24, 72, 168];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'buddy') return NextResponse.json({ error: 'Buddies only' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const specialities = Array.isArray(body.specialities)
    ? [...new Set(body.specialities.filter((s): s is Speciality => SPECIALITIES.includes(s as Speciality)))]
    : [];
  if (specialities.length > MAX_SPECIALITIES) {
    return NextResponse.json(
      { error: `Pick at most ${MAX_SPECIALITIES} — we match students to specialists, not to everyone.` },
      { status: 400 },
    );
  }

  const section = (v: unknown) => (typeof v === 'string' && SECTIONS.includes(v) ? v : null);
  const languages = Array.isArray(body.languages)
    ? body.languages.filter((l): l is string => typeof l === 'string' && LANGUAGES.includes(l))
    : [];

  const attemptRaw = Number(body.attempt_number);
  const attempt = Number.isFinite(attemptRaw) && attemptRaw >= 1 && attemptRaw <= 5 ? Math.floor(attemptRaw) : null;

  const prevRaw = Number(body.previous_percentile);
  const previous = Number.isFinite(prevRaw) && prevRaw >= 0 && prevRaw <= 100 ? prevRaw : null;

  const capRaw = Number(body.weekly_session_cap);
  // Zero is a valid, honest answer — "not this week". It is not the same as
  // "unset", and it must be storable, because a mentor who cannot take
  // sessions this week needs a way to say so without deleting their profile.
  const cap = Number.isFinite(capRaw) && capRaw >= 0 && capRaw <= 20 ? Math.floor(capRaw) : null;

  const noticeRaw = Number(body.notice_hours);
  const notice = NOTICE_HOURS.includes(noticeRaw) ? noticeRaw : null;

  const story = typeof body.buddy_story === 'string' ? body.buddy_story.trim().slice(0, 400) : null;

  // Complete enough to be MATCHED: we need what they're best at, how much
  // they can take, and something human. Everything else improves the match
  // without gating it.
  const complete = specialities.length > 0 && cap != null && !!story;

  const { error } = await admin
    .from('profiles')
    .update({
      specialities,
      strongest_section: section(body.strongest_section),
      own_weakest_section: section(body.own_weakest_section),
      attempt_number: attempt,
      previous_percentile: previous,
      languages,
      weekly_session_cap: cap,
      notice_hours: notice,
      buddy_story: story || null,
      profile_completed_at: complete ? new Date().toISOString() : null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[buddy-profile] save failed', error.message);
    return NextResponse.json({ error: 'Could not save — try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, complete });
}
