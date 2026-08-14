import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverError } from '@/lib/api-error';
import { FIRST_WEEK_ASKS, type AskId } from '@/lib/first-week-asks';

// POST /api/student/first-week-ask { id, value } — writes ONE first-week input.
//
// Founder, 14 Aug: "ask weakest section in onboarding, rest in first week."
// This is the "rest" half. Every field it can write is one the audit found at
// 0% fill because nothing asked for it — see lib/first-week-asks for why the
// ask is rationed to one a day, and lib/plan-inputs.guard.test.ts for the rule
// that a planner input must always have something that fills it.
//
// `value: null` is accepted and meaningful: a student who genuinely does not
// know is answered honestly, and the chain simply falls through to the next
// signal — exactly like the weakest-section screen at signup.
const VALID_STAGES = new Set(['not_started', 'concepts', 'questions', 'sectionals', 'mocks']);

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; value?: unknown };
  const ask = FIRST_WEEK_ASKS.find((a) => a.id === body.id);
  if (!ask) return NextResponse.json({ error: 'Unknown question.' }, { status: 400 });

  const value = body.value;
  if (value !== null && typeof value !== 'string') {
    return NextResponse.json({ error: 'value must be a string or null.' }, { status: 400 });
  }
  // current_stage is a closed set — the planner's phase logic reads it
  // directly, so a free-text value here would be silently ignored downstream
  // with no sign anything went wrong.
  if (ask.id === ('current_stage' as AskId) && value !== null && !VALID_STAGES.has(value)) {
    return NextResponse.json({ error: 'Not a valid stage.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ [ask.field]: value })
    .eq('id', user.id);
  if (error) return serverError('first-week-ask', error);

  return NextResponse.json({ ok: true, id: ask.id, field: ask.field });
}
