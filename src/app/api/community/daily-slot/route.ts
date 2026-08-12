import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { loadPeerRows } from '@/lib/os/peer-cohort-data';
import { peerPulse, cohortInsights } from '@/lib/os/peer-cohort';
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
// `question` is deliberately reported UNAVAILABLE until a real question bank
// exists. Its weight is the largest in the rotation, so the moment that bank
// ships this route flips one boolean and the surface rebalances itself — no
// engine change, no UI change.

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
  let communityOpen = false;
  try {
    const [{ data: open }, { data: mine }] = await Promise.all([
      admin.from('student_submissions')
        .select('id, student_id, status, voting_ends_at')
        .in('status', ['voting', 'featured']),
      admin.from('submission_votes').select('submission_id').eq('student_id', user.id),
    ]);
    const voted = new Set((mine ?? []).map((v: { submission_id: string }) => v.submission_id));
    const nowIso = now.toISOString();
    communityOpen = (open ?? []).some((s: { id: string; student_id: string | null; status: string; voting_ends_at: string | null }) =>
      s.student_id !== user.id &&
      !voted.has(s.id) &&
      (s.status === 'featured' || (s.voting_ends_at != null && s.voting_ends_at > nowIso))
    );
  } catch (e) {
    console.error('[daily-slot] community availability failed', e);
  }

  const available: PickAvailability = {
    question: false, // no bank yet — see note above
    community: communityOpen,
    mirror: mirror != null,
    peer: insights.length > 0 || (pulse != null && pulse.studiedToday > 0),
    reflection: true, // the floor: needs nothing but the student
  };

  // What they were served the last two days, so the rotation can avoid a
  // three-peat. Best-effort: if this read fails the pick is still valid.
  let recent: PickKind[] = [];
  try {
    const { data } = await admin
      .from('student_events')
      .select('props, created_at')
      .eq('user_id', user.id)
      .eq('event', 'daily_slot_served')
      .order('created_at', { ascending: false })
      .limit(2);
    recent = (data ?? [])
      .map((r: { props: { kind?: string } | null }) => r.props?.kind)
      .filter((k: unknown): k is PickKind => typeof k === 'string')
      .reverse();
  } catch { /* best effort */ }

  const kind = pickKindForDay(user.id, day, available, recent);
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
