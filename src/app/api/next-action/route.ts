import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextBestActions } from '@/lib/next-action';
import { sanitizeTargets } from '@/lib/timetable';
import { computeTargetProgress, targetKey } from '@/lib/coaching-progress';
import { getLogDateString } from '@/lib/streak-utils';
import { studyDayStart } from '@/lib/study-day';
import { resolveFocusSections } from '@/lib/focus-sections';
import type { DebriefRow } from '@/lib/mock-informed-focus';
import { archetypeRevisionMultiplier } from '@/lib/routine-engine';
import { TOPIC_METADATA } from '@/lib/topics-constants';

const SECTION_OF: Record<string, string> = Object.fromEntries(
  Object.entries(TOPIC_METADATA).map(([t, m]) => [t, (m as { section: string }).section]),
);

export const maxDuration = 60;

// "What's the highest-value thing I can do in the time I have?"
//
// Every number in the answer is this student's own. Nothing is modelled,
// nothing is predicted — we rank real signals we already hold and show the
// evidence beside each one.

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const raw = Number(request.nextUrl.searchParams.get('minutes'));
  const minutes = Number.isFinite(raw) ? Math.max(10, Math.min(300, Math.floor(raw))) : 60;

  const admin = createAdminClient();
  const [{ data: cov }, { data: mock }, { data: tt }, { data: prof }, { data: prog }, { data: routine }] = await Promise.all([
    admin.from('topic_coverage').select('topic, status, is_priority, updated_at').eq('student_id', user.id),
    // Five rows, not one, and no date filter here — mockInformedFocus applies
    // the recency window itself. Taking limit(1) and using it raw is how this
    // surface ended up acting on a mock of any age.
    admin.from('mock_debriefs').select('varc, dilr, qa, taken_on')
      .eq('student_id', user.id).order('taken_on', { ascending: false }).limit(5),
    admin.from('student_timetables').select('targets, confirmed_at').eq('student_id', user.id).maybeSingle(),
    admin.from('profiles').select('plan_source, is_repeater, is_working_professional, self_reported_weakest_section, self_reported_strongest_section, baseline_varc, baseline_dilr, baseline_qa').eq('id', user.id).maybeSingle(),
    admin.from('coaching_target_progress').select('target_key, done').eq('student_id', user.id),
    // Today's routine, so "Done" on the card can tick the REAL plan task
    // instead of writing a second, parallel record of the same fact.
    admin.from('daily_routines').select('tasks').eq('student_id', user.id)
      .eq('routine_date', getLogDateString()).maybeSingle(),
  ]);

  const coverage = (cov ?? []).map((c) => ({
    topic: c.topic as string,
    status: (c.status as string) ?? 'not_started',
    isPriority: c.is_priority === true,
  }));

  // Days since each topic was last touched, from the coverage row's own
  // timestamp. Approximate, and honestly so — it's the only practice signal
  // we hold per topic.
  const now = Date.now();
  const daysSincePractice: Record<string, number | null> = {};
  for (const c of cov ?? []) {
    daysSincePractice[c.topic as string] = c.updated_at
      ? Math.floor((now - Date.parse(c.updated_at as string)) / 86_400_000)
      : null;
  }

  // Section percentiles live in jsonb ({ percentile: number } per section).
  const pct = (v: unknown): number | null => {
    const n = Number((v as { percentile?: unknown } | null)?.percentile);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  // The newest row is display fuel only — it explains the section the shared
  // resolver picked, it no longer picks one.
  const latestMock = (mock ?? [])[0] ?? null;
  const mockPercentiles = latestMock
    ? { varc: pct(latestMock.varc), dilr: pct(latestMock.dilr), qa: pct(latestMock.qa) }
    : null;

  // Anything the student has already marked DONE today. A completed action must
  // not keep sitting at the top of Home for the rest of the day — that's the
  // difference between a plan and a nag.
  //
  // "Today" is the IST study day with its 3am rollover (getLogDateString), the
  // same day every log and streak uses. This used to be UTC midnight — which
  // falls at 5:30am IST, INSIDE the morning dead zone but after the 3am
  // boundary, so a student acting between 3:00 and 5:30am IST (the tail of our
  // single busiest usage block, 22:00–04:00) had their "done today" filter and
  // their log date disagree, and a finished action could reappear on the card.
  // One day boundary, defined once, or the same student lives in two days.
  // studyDayStart, not a hardcoded 03:00 — the rollover moved to 05:30 on
  // 14 Aug and this literal silently kept the old boundary, so an action
  // acknowledged at 04:00 was filtered against the previous day's window and
  // could reappear.
  const dayStart = studyDayStart();
  const { data: todayLog } = await admin
    .from('study_action_log').select('kind, outcome')
    .eq('student_id', user.id).gte('shown_at', dayStart.toISOString());
  const doneToday = new Set(
    (todayLog ?? []).filter((r) => r.outcome === 'followed').map((r) => r.kind as string),
  );

  // What this student has actually acted on before — the learning input.
  const { data: hist } = await admin
    .from('study_action_log').select('kind, outcome')
    .eq('student_id', user.id).not('outcome', 'is', null).limit(500);
  const history: Record<string, { shown: number; followed: number }> = {};
  for (const h of hist ?? []) {
    const k = h.kind as string;
    history[k] ??= { shown: 0, followed: 0 };
    history[k].shown += 1;
    if (h.outcome === 'followed') history[k].followed += 1;
  }

  const doneBy = new Map<string, number>((prog ?? []).map((r) => [r.target_key as string, Number(r.done) || 0]));
  const targets = sanitizeTargets(tt?.targets)
    .map((t) => computeTargetProgress(t, doneBy.get(targetKey(t)) ?? 0, (tt?.confirmed_at as string | null) ?? null));

  // THE shared chain — the same weakest section the plan leads with. This
  // module used to decide it here from a raw mock with its own thresholds.
  const focus = resolveFocusSections(
    prof ?? {},
    coverage.map((c) => ({ section: SECTION_OF[c.topic] ?? '', status: c.status })),
    (mock ?? []) as DebriefRow[],
    getLogDateString(),
  );

  const allActions = nextBestActions({
    minutes,
    coverage,
    mock: mockPercentiles,
    weakestSection: focus.weakest,
    revisionMultiplier: archetypeRevisionMultiplier({
      isRepeater: !!prof?.is_repeater,
      isWorkingProfessional: !!prof?.is_working_professional,
    }),
    daysSincePractice,
    targets,
    followingCoaching: prof?.plan_source === 'coaching',
    history,
  });

  // Drop what's finished. If everything is finished we say so, rather than
  // silently rendering nothing — a student who did the work deserves to see it
  // acknowledged.
  const actions = allActions.filter((a) => !doneToday.has(a.kind));
  const finishedCount = allActions.length - actions.length;

  // Where "Start now" goes.
  //
  // ONE WAY TO BUILD A STUDY PLAN (founder, 14 Aug): "delete — there should
  // be only one way for building study plan, unless a student uploads their
  // coaching or self timetable. Otherwise one study table for all."
  //
  // /student/plan/[section] was a SECOND planner: its own per-section day, its
  // own budget split, its own topic ranking, reachable from this very card
  // behind a per-section feature flag. A student could read "do Geometry"
  // there and "do Percentages" on Home — two screens, two answers, one app.
  // It is deleted. Every action now points at the coverage matrix, which every
  // student can always open and which never contradicts the daily plan.
  const hrefFor = (section: string | null, kind: string): string => {
    if (kind === 'coaching_due') return '/student/profile';
    return '/student/plan/topics';
  };

  // Match each action to today's actual plan task. When one exists, "Done" on
  // the card completes THAT task — which advances coverage, ticks it in the
  // daily log so the student never enters it twice, and counts toward the
  // streak through the same path the log itself uses.
  const routineTasks = (routine?.tasks ?? []) as { id?: unknown; topic?: unknown }[];
  const taskIdForTopic = new Map<string, string>();
  for (const t of routineTasks) {
    if (typeof t?.topic === 'string' && t.topic && t.id != null) {
      if (!taskIdForTopic.has(t.topic)) taskIdForTopic.set(t.topic, String(t.id));
    }
  }

  const withHref = actions.map((a, i) => ({
    ...a,
    href: hrefFor(a.section, a.kind),
    rank: i,
    taskId: a.topic ? (taskIdForTopic.get(a.topic) ?? null) : null,
  }));

  // Log what we recommended, fire-and-forget. Deliberately NOT awaited and no
  // read-before-write: this used to add three round trips to the critical path
  // of a card that sits at the top of the home screen, and a slow log is not a
  // reason to make a student stare at "Working it out...".
  //
  // De-duplication is handled by the ack/reconcile side keying on
  // (student, kind, day), so a repeat insert can't inflate the follow-rate.
  const loggedKinds = new Set((todayLog ?? []).map((r) => r.kind as string));
  const fresh = withHref
    .filter((a) => !loggedKinds.has(a.kind))
    .map((a) => ({
      student_id: user.id, kind: a.kind, topic: a.topic,
      section: a.section, minutes: a.minutes, rank: a.rank,
    }));
  if (fresh.length > 0) {
    admin.from('study_action_log').insert(fresh)
      .then(({ error }) => { if (error) console.error('[next-action] log failed', error.message); });
  }

  return NextResponse.json({ minutes, actions: withHref, finishedToday: finishedCount });
}
