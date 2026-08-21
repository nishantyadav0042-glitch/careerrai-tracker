import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { studyDayStart } from '@/lib/study-day';
import { activeChallengeDate } from '@/lib/challenge';
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
// ONE daily surface, not two (founder, 12 Aug: do not build a duplicate of
// Daily Pick, and do not run both). The `question` slot therefore delegates to
// the daily-challenge system that already exists — its own table, its own
// active-date rule, its own attempt capture — rather than a second engine that
// would drift from it. Daily Pick owns the surface; challenge owns the question
// engine; the rotation only decides which day each one gets.
//
// `question` becomes available the moment a challenge is actually scheduled
// live for today. It carries the largest weight in the rotation, so seeding the
// bank rebalances the surface on its own with no code change at all.

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
  let communityOpen = false;
  {
    const [openR, mineR, featR] = await Promise.all([
      admin.from('student_submissions')
        .select('id, student_id')
        .eq('status', 'live'),
      admin.from('submission_votes').select('submission_id').eq('student_id', user.id),
      // The ballot excludes today's featured items, so availability must too —
      // otherwise the rotation can promise a ballot that renders empty.
      admin.from('student_submissions')
        .select('id')
        .eq('status', 'live')
        .eq('featured_on', day),
    ]);
    const availErr = openR.error ?? mineR.error ?? featR.error;
    if (availErr) {
      console.error('[daily-slot] community availability failed', availErr.message);
      return NextResponse.json({ error: 'Could not load today’s pick — try again.', code: 'SLOT_UNAVAILABLE', retryable: true }, { status: 503 });
    }
    const voted = new Set((mineR.data ?? []).map((v: { submission_id: string }) => v.submission_id));
    const featuredToday = new Set((featR.data ?? []).map((f: { id: string }) => f.id));
    // A live item that is not mine, that I have not judged, and that is not
    // already occupying today's top slot. The old rule also demanded an
    // unexpired 72h ballot window; after that ballot retired on 20 Aug the
    // clause could never be true, so the community slot silently stopped
    // being offered by the rotation at all.
    communityOpen = (openR.data ?? []).some((s: { id: string; student_id: string | null }) =>
      s.student_id !== user.id && !voted.has(s.id) && !featuredToday.has(s.id)
    );
  }

  // The 'peer' slot is population proof, so it obeys the same density gate as
  // the Home card (peer-cohort.ts). Below the threshold it is not "unavailable
  // because we lack data" — we have the data — it is unavailable because
  // saying it out loud at this size makes CareerRai look empty rather than
  // alive. 'mirror' and 'reflection' carry the rotation until then, and both
  // are built from the student alone.
  const densityOk = pulse != null && populationProofAllowed(pulse.studiedToday);

  // Is there actually a question live today? Asked of the SAME table and the
  // same active-date rule the challenge card itself uses, so the rotation can
  // never offer a question slot the card would then render as empty.
  let questionLive = false;
  {
    const { count, error: chalErr } = await admin
      .from('daily_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'live')
      .eq('live_date', activeChallengeDate(now));
    if (chalErr) {
      // A failed count must not quietly delete the day's question from the
      // rotation (ERROR became FALSE here before). Retryable, like the rest.
      console.error('[daily-slot] challenge availability failed', chalErr.message);
      return NextResponse.json({ error: 'Could not load today’s pick — try again.', code: 'SLOT_UNAVAILABLE', retryable: true }, { status: 503 });
    }
    questionLive = (count ?? 0) > 0;
  }

  const available: PickAvailability = {
    question: questionLive,
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

  // The question is the hero, every day it exists (founder, 13 Aug: "this mix
  // of screen should not exist"). A student must know what they are opening
  // before they open it — that predictability is what makes a daily habit
  // daily, and it is what the timed question is built around.
  //
  // The rotation still runs for every other day: when no challenge is
  // scheduled, pickKindForDay chooses among the remaining kinds exactly as
  // before, so nothing about that engine or its tests changed.
  const kind: PickKind | null = available.question
    ? 'question'
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
