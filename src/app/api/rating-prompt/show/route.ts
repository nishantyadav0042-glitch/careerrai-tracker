import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  checkRatingPromptEligibility, detectPlatformFromUA,
  RATING_PROMPT_TRIGGERS, type RatingPromptTrigger,
} from '@/lib/rating-prompt';
import { writeReviewUrl } from '@/lib/install/store-links';

// Called by <RatingPromptSheet> on mount. Checks eligibility server-side
// (cross-device cooldown, see rating-prompt.ts) and, only if eligible,
// records the impression and hands back the platform-correct store link.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { trigger } = (await request.json().catch(() => ({}))) as { trigger?: string };
  if (!trigger || !RATING_PROMPT_TRIGGERS.includes(trigger as RatingPromptTrigger)) {
    return NextResponse.json({ error: 'invalid trigger' }, { status: 400 });
  }

  const platform = detectPlatformFromUA(request.headers.get('user-agent'));
  const admin = createAdminClient();
  const { eligible } = await checkRatingPromptEligibility(admin, user.id, platform);
  if (!eligible || !platform) return NextResponse.json({ show: false });

  const { data: row, error } = await admin
    .from('rating_prompts')
    .insert({ student_id: user.id, trigger, platform })
    .select('id')
    .single();
  if (error || !row) return NextResponse.json({ show: false });

  return NextResponse.json({ show: true, id: (row as { id: number }).id, url: writeReviewUrl(platform) });
}
