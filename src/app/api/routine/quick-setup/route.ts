import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';

const VALID_SECTIONS = ['VARC', 'DILR', 'QA'] as const;
const VALID_STAGES = ['not_started', 'concepts', 'questions', 'sectionals', 'mocks'] as const;
const VALID_BLOCKERS = ['inconsistency', 'dont_know_what', 'mock_anxiety', 'time_wasting'] as const;

// Reuses the same topic taxonomy already shown in daily logging (quick-log
// sheet) rather than inventing a second one — "weakest section" alone was
// too coarse (every CAT aspirant already knows to study VARC/DILR/QA); the
// topic within it is what makes the routine feel precise.
const TOPICS_BY_SECTION: Record<(typeof VALID_SECTIONS)[number], string[]> = {
  VARC: VERBAL_TOPICS,
  DILR: LRDI_TOPICS,
  QA: QUANT_TOPICS,
};

// A "skip" tap must never mean "give up on topic-level personalization
// forever" — that regressed straight back to the generic section-only
// routine this feature exists to fix. Skipping instead picks the
// highest-weightage topic in that section as a real, defensible default
// (Reading Comprehension carries the most weight in VARC, Arithmetic in QA,
// Data Interpretation in DILR) — the student still gets a specific topic,
// they just didn't have to choose it themselves.
const DEFAULT_TOPIC_BY_SECTION: Record<(typeof VALID_SECTIONS)[number], string> = {
  VARC: VERBAL_TOPICS[0],
  DILR: LRDI_TOPICS[0],
  QA: QUANT_TOPICS[0],
};

// POST /api/routine/quick-setup — weakest section + toughest topic within it
// (skippable, defaults to that section's highest-weightage topic rather than
// dropping personalization entirely), current prep stage (fixes phase being
// calendar-only), biggest blocker (seeds the Mission Score Engine's
// cold-start bias — see mission-engine.ts), plus an optional weekend-hours
// refinement — all captured just-in-time on first use of the routine card
// rather than as an extra step in the main onboarding wizard.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { weakest_section?: string; weak_topic?: string; weekend_hours?: number; current_stage?: string; biggest_blocker?: string };
  const weakest = body.weakest_section;
  if (!weakest || !(VALID_SECTIONS as readonly string[]).includes(weakest)) {
    return NextResponse.json({ error: 'weakest_section must be VARC, DILR, or QA' }, { status: 400 });
  }
  if (body.current_stage != null && !(VALID_STAGES as readonly string[]).includes(body.current_stage)) {
    return NextResponse.json({ error: 'current_stage is not a recognised value' }, { status: 400 });
  }
  if (body.biggest_blocker != null && !(VALID_BLOCKERS as readonly string[]).includes(body.biggest_blocker)) {
    return NextResponse.json({ error: 'biggest_blocker is not a recognised value' }, { status: 400 });
  }

  const strongest = (VALID_SECTIONS as readonly string[]).filter((s) => s !== weakest);

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {
    self_reported_weakest_section: weakest,
    // No second tap for "strongest" — inferring it from whichever remaining
    // section isn't the weakest only shapes a minor revision-phase task
    // label, so asking a second question for it isn't worth the friction.
    self_reported_strongest_section: strongest[0],
  };
  if (typeof body.weak_topic === 'string') {
    const section = weakest as (typeof VALID_SECTIONS)[number];
    const validTopics = TOPICS_BY_SECTION[section];
    if (body.weak_topic === '') {
      // Explicit skip — still resolves to a real topic (see
      // DEFAULT_TOPIC_BY_SECTION above), never to nothing.
      updates.self_reported_weak_topic = DEFAULT_TOPIC_BY_SECTION[section];
    } else if (validTopics.includes(body.weak_topic)) {
      updates.self_reported_weak_topic = body.weak_topic;
    } else {
      return NextResponse.json({ error: 'weak_topic is not valid for weakest_section' }, { status: 400 });
    }
  }
  if (typeof body.weekend_hours === 'number' && body.weekend_hours >= 0 && body.weekend_hours <= 16) {
    updates.weekend_hours_available = body.weekend_hours;
  }
  if (typeof body.current_stage === 'string') {
    updates.current_stage = body.current_stage;
  }
  if (typeof body.biggest_blocker === 'string') {
    updates.biggest_blocker = body.biggest_blocker;
  }

  const { error } = await admin.from('profiles').update(updates).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
