import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { studyDayStart } from '@/lib/study-day';
import { loadPeerRows } from '@/lib/os/peer-cohort-data';
import { peerPulse, cohortInsights, populationProofAllowed } from '@/lib/os/peer-cohort';
import { mirrorForDay } from '@/lib/os/mirror';
import {
  pickKindForDay, reflectionForDay, KIND_LABEL, type PickAvailability, type PickKind,
} from '@/lib/os/daily-pick-rotation';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// GET /api/community/daily-slot — which ONE thing Daily Pick offers today.
//
// The rotation's decision lives in lib/os/daily-pick-rotation.ts. This route's
// job is the half the engine cannot do: work out what can HONESTLY be filled
// today, then fill it.
//
// Availability is computed before the pick, never after. That ordering is the
// whole safety property: the engine chooses only among slots we have already
// proved we can fill, so there is no path where it picks a kind and we then
// have to invent content to satisfy it (Trust OS §2.1, Incident #7).
//
// ONE daily surface, and as of 31 Aug it serves ONE kind of thing: the day's
// hint. The founder removed questions from Daily Pick entirely, so the
// daily-challenge probe that used to run here is gone with them — this route no
// longer reads daily_challenges at all.
//
// The 'community' slot IS the hint: the tip that promoteDailyPick stamped with
// today's featured_on, rendered by CommunityVoteCard.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const day = getLogDateString(now);

  // ── What can we actually fill today? ──────────────────────────────────────
  let rows: Awaited<ReturnType<typeof loadPeerRows>> = [];
  try {
    rows = await loadPeerRows(admin, now);
  } catch (e) {
    console.error('[daily-slot] peer load failed', e);
  }
  const me = rows.find((r) => r.studentId === user.id) ?? null;

  const mirror = me ? mirrorForDay(me, day) : null;
  const insights = me ? cohortInsights(me, rows, now.getUTCFullYear()) : [];
  const pulse = me ? peerPulse(me, rows) : null;

  // The community slot is only fillable if there is something open that this
  // student did not write and has not already judged. Counted, not assumed —
  // the 12 Aug investigation showed an "obviously fine" pool is worth checking.
  // Hardening sprint (21 Aug): these reads sat inside a try/catch that could
  // never fire — supabase-js RETURNS {data,error}, it does not throw — so a
  // failed read silently dropped the community kind from the rotation, the
  // exact bug the comment below says was already fixed once. Errors are now
  // read where they actually arrive, and an unreadable availability is a
  // retryable 503, never a silently smaller rotation.
  //
  // FIXED 31 Aug, and this one would have broken the whole change silently.
  // The old rule asked "is there a live item this student did not write, has
  // not voted on, AND that is NOT featured today?" — ballot semantics, from
  // when this slot handed over four things to vote on. But the card now renders
  // exactly ONE item: today's featured tip. So the old rule excluded the very
  // item it was gating, and on a day whose only unseen content was the hint
  // itself the hero would have fallen through to a reflection prompt.
  //
  // Availability now asks the question the card actually answers: is there a
  // live TIP stamped for today? Voting is not a precondition — a hint a student
  // has already voted on is still today's hint, and re-showing it is correct.
  let communityOpen = false;
  {
    const { data: featR, error: availErr } = await admin
      .from('student_submissions')
      .select('id, kind')
      .eq('status', 'live')
      .eq('kind', 'tip')
      .eq('featured_on', day);
    if (availErr) {
      console.error('[daily-slot] hint availability failed', availErr.message);
      return NextResponse.json({ error: 'Could not load today’s pick — try again.', code: 'SLOT_UNAVAILABLE', retryable: true }, { status: 503 });
    }
    communityOpen = (featR ?? []).length > 0;
  }

  // The 'peer' slot is population proof, so it obeys the same density gate as
  // the Home card (peer-cohort.ts). Below the threshold it is not "unavailable
  // because we lack data" — we have the data — it is unavailable because
  // saying it out loud at this size makes CareerRai look empty rather than
  // alive. 'mirror' and 'reflection' carry the rotation until then, and both
  // are built from the student alone.
  const densityOk = pulse != null && populationProofAllowed(pulse.studiedToday);

  const available: PickAvailability = {
    community: communityOpen,
    mirror: mirror != null,
    peer: densityOk && insights.length > 0,
    reflection: true, // the floor: needs nothing but the student
  };

  // What they were served the last two days, so the rotation can avoid a
  // three-peat. Best-effort: if this read fails the pick is still valid.
  let recent: PickKind[] = [];
  {
    // FIXED 21 Aug: this used to read the last two serves with no day filter,
    // and the card logs a serve on EVERY mount — so a student's third open of
    // the same day saw today's kind twice, tripped the three-peat guard, and
    // was handed a DIFFERENT pick for the same day. "Recent" means previous
    // study days only; today's own serves are not history. Still best-effort:
    // an unreadable history yields no exclusions, which is a stable pick, not
    // a wrong one.
    const { data, error: recentErr } = await admin
      .from('student_events')
      .select('props, created_at')
      .eq('user_id', user.id)
      .eq('event', 'daily_slot_served')
      .lt('created_at', studyDayStart(now).toISOString())
      .order('created_at', { ascending: false })
      .limit(2);
    if (recentErr) console.error('[daily-slot] recent-serves read failed (pick proceeds unexcluded)', recentErr.message);
    recent = (data ?? [])
      .map((r: { props: { kind?: string } | null }) => r.props?.kind)
      .filter((k: unknown): k is PickKind => typeof k === 'string')
      .reverse();
  }

  // THE HINT IS THE HERO, every day it exists (founder, 13 Aug: "this mix of
  // screen should not exist"; 31 Aug: "just keep daily hint only in daily pick
  // — remove all the questions"). A student must know what they are opening
  // before they open it; that predictability is what makes a daily habit daily.
  // The question used to hold this slot and no longer exists as a kind at all.
  //
  // The rotation still runs underneath: on a day the hint shelf could not be
  // filled, pickKindForDay chooses among mirror/peer/reflection exactly as
  // before, so that engine and its tests are untouched.
  const kind: PickKind | null = available.community
    ? 'community'
    : pickKindForDay(user.id, day, available, recent);
  if (!kind) return NextResponse.json({ kind: null });

  const body: Record<string, unknown> = { kind, label: KIND_LABEL[kind], day };

  if (kind === 'reflection') body.text = reflectionForDay(user.id, day);
  if (kind === 'mirror') body.text = mirror?.line ?? null;
  if (kind === 'peer') {
    body.text = insights[0]?.line ?? null;
    body.basis = insights[0]?.basis ?? null;
    body.pulse = pulse;
  }
  // 'community' carries no payload — the existing vote card fetches its own.

  return NextResponse.json(body);
}
