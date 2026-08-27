import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { getPhase, phaseForTopic, targetPhrase, archetypeRevisionMultiplier, type Section, type Stage } from '@/lib/routine-engine';
import { chooseTopicForSection, type CoverageStatus } from '@/lib/topic-selector';
import { topicsInSection } from '@/lib/prep-model';
import { mutatePlanTasks } from '@/lib/plan-mutate';

// POST /api/routine/add-block — "One more? +30 min."
//
// Stage A's other half. The plan is built at the bad-day FLOOR so finishing
// it is normal — which means finishing must open a door, not close the day.
// This appends one more 30-minute block to today's routine: the same
// engine, the same explained choice, one tap. A student who wants a big day
// builds it block by block, each one finished before the next appears —
// the exact opposite of the 720-minute monuments that churned Kashika and
// Uvesh (8 Aug cohort).
//
// Rules:
//   · variety first — a section not yet in today's plan wins the slot;
//     once all three appear, the weak section leads again
//   · never repeats a topic already in today's plan
//   · capped at 8 extra blocks/day — past that it's a bug, not diligence

const BLOCK_MINUTES = 30;
const MAX_EXTRAS = 8;
const SECTIONS: Section[] = ['VARC', 'DILR', 'QA'];

interface StoredTask { id: string; section: string; topic: string | null; label: string; target: string | null; estMinutes: number; reason: string | null }

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const today = getLogDateString();

  // Profile and the FULL coverage grid are fetched once, up front, because
  // neither depends on the plan. Everything that does depend on the plan is
  // decided inside the mutator below, so a retry re-decides from the row it
  // just re-read instead of replaying a stale choice. (Coverage used to be
  // fetched per-section AFTER the section was picked from the stale task
  // list — which is exactly the kind of ordering that makes a retry unsafe.)
  const [{ data: profile }, { data: coverageRows }] = await Promise.all([
    admin.from('profiles')
      .select('is_repeater, is_working_professional, self_reported_weakest_section, attempt_year, current_stage')
      .eq('id', user.id).maybeSingle(),
    admin.from('topic_coverage')
      .select('topic, status, section')
      .eq('student_id', user.id),
  ]);

  const coverageByTopic = new Map<string, CoverageStatus>(
    (coverageRows ?? []).map((r: { topic: string; status: string }) => [r.topic, r.status as CoverageStatus]));
  const multiplier = archetypeRevisionMultiplier({
    isRepeater: !!profile?.is_repeater,
    isWorkingProfessional: !!profile?.is_working_professional,
  });
  const phase = getPhase(new Date(), profile?.attempt_year as number | null, (profile?.current_stage as Stage | null) ?? null, !!profile?.is_repeater);
  const weak = (profile?.self_reported_weakest_section as Section | null) ?? 'DILR';

  // Compare-and-swap: two taps that overlap used to lose one silently, and
  // est_minutes was incremented from a stale read so the row's minutes could
  // drift out of agreement with the tasks it held. See lib/plan-mutate.
  const result = await mutatePlanTasks<StoredTask>(admin, user.id, today, (row) => {
    const tasks = row.tasks as StoredTask[];
    const extras = tasks.filter((t) => t.id.startsWith('extra-')).length;
    if (extras >= MAX_EXTRAS) {
      return { ok: false, status: 429, error: "That's a full day already — rest is part of the plan too." };
    }

    // Variety first: a section today hasn't seen yet takes the slot. All three
    // present → the weak section leads again, on a topic today hasn't used.
    const sectionsToday = new Set(tasks.map((t) => t.section));
    const section: Section = SECTIONS.find((s) => !sectionsToday.has(s)) ?? weak;
    const topicsToday = new Set(tasks.map((t) => t.topic).filter(Boolean) as string[]);

    const candidates = topicsInSection(section)
      .filter((topic) => !topicsToday.has(topic))
      .map((topic) => ({
        topic,
        coverageStatus: coverageByTopic.get(topic) ?? null,
        // Lean on purpose: recency/postponed context lives in the full daily
        // build. An extra block choosing by coverage + weightage is still an
        // explained, sensible pick — and it can never contradict the plan,
        // because it excludes everything already on it.
        daysSinceLastPracticed: null,
      }));
    if (candidates.length === 0) {
      return { ok: false, status: 409, error: 'Nothing left to add in that section today.' };
    }

    const choice = chooseTopicForSection(candidates, multiplier);
    const task: StoredTask = {
      id: `extra-${extras + 1}`,
      section,
      topic: choice.topic,
      label: `${section} — ${choice.topic}`,
      target: targetPhrase(section, choice.topic, BLOCK_MINUTES, phaseForTopic(choice.coverageStatus, phase)),
      estMinutes: BLOCK_MINUTES,
      reason: choice.reasons[0] ?? 'One more block',
    };
    return {
      ok: true,
      value: task,
      // est_minutes derived from the row we just read, never from a stale one.
      patch: { tasks: [...tasks, task], est_minutes: row.est_minutes + BLOCK_MINUTES },
    };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const task = result.value;

  admin.from('student_events').insert({
    user_id: user.id, event: 'plan_block_added',
    // Logged from the task that was actually WRITTEN, not from variables the
    // decision happened to leave lying around — after a retry those would
    // describe the attempt that lost.
    props: { section: task.section, topic: task.topic, taskId: task.id }, path: null,
  }).then(({ error: e }: { error: { message: string } | null }) => { if (e) console.error('[add-block] event log failed', e.message); });

  return NextResponse.json({ task });
}
