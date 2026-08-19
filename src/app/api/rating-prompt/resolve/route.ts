import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_ACTIONS = ['rated', 'dismissed', 'never_ask_again'];

// The write half of <RatingPromptSheet> — records what the student did with
// the prompt /api/rating-prompt/show handed them. 'rated' and
// 'never_ask_again' are permanent (checkRatingPromptEligibility never shows
// again); 'dismissed' just starts the normal cooldown.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { id, action } = (await request.json().catch(() => ({}))) as { id?: number; action?: string };
  if (!id || !action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'id and valid action required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('rating_prompts')
    .update({ action, action_at: new Date().toISOString() })
    .eq('id', id)
    .eq('student_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
