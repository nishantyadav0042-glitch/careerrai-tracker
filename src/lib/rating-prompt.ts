// Store-rating ask eligibility — shared by the /api/rating-prompt routes.
//
// Founder reminder (set 11 Aug, actioned 17 Aug): nudge happy students toward
// an App Store / Play Store rating. Server-persisted (rating_prompts table,
// see the 17 Aug migration) rather than localStorage, so the cooldown and
// lifetime cap hold across a student's devices, not per-browser.
//
// Three triggers were asked for: streak_milestone, mock_completed,
// blueprint_reveal. Blueprint reveal only ever fires once, during onboarding
// — day 0 of the account. Asking for a rating before a student has used the
// product is the one thing every platform's own guidance (and plain product
// sense) warns against, so MIN_ACCOUNT_AGE_DAYS below structurally keeps that
// trigger a no-op today. It is wired for real, not stubbed — raise the
// constant if the founder wants day-0 asks after all.
import type { SupabaseClient } from '@supabase/supabase-js';

export type RatingPromptTrigger = 'streak_milestone' | 'mock_completed' | 'blueprint_reveal';
export const RATING_PROMPT_TRIGGERS: RatingPromptTrigger[] = [
  'streak_milestone', 'mock_completed', 'blueprint_reveal',
];

export const RATING_PROMPT_MIN_ACCOUNT_AGE_DAYS = 3;
export const RATING_PROMPT_COOLDOWN_DAYS = 21;
export const RATING_PROMPT_MAX_LIFETIME = 3;

const DAY_MS = 86_400_000;

export function detectPlatformFromUA(ua: string | null): 'ios' | 'android' | null {
  if (!ua) return null;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

export async function checkRatingPromptEligibility(
  admin: SupabaseClient,
  studentId: string,
  platform: 'ios' | 'android' | null,
): Promise<{ eligible: boolean; reason?: string }> {
  // No native review SDK on either shell (see store-links.ts), so a platform
  // we can't identify has nowhere sensible to send the tap.
  if (!platform) return { eligible: false, reason: 'no_store_for_platform' };

  const { data: profile } = await admin
    .from('profiles').select('created_at').eq('id', studentId).single();
  if (!profile?.created_at) return { eligible: false, reason: 'no_profile' };
  if (Date.now() - new Date(profile.created_at as string).getTime() < RATING_PROMPT_MIN_ACCOUNT_AGE_DAYS * DAY_MS) {
    return { eligible: false, reason: 'too_new' };
  }

  const { data: prior } = await admin
    .from('rating_prompts')
    .select('action, shown_at')
    .eq('student_id', studentId)
    .order('shown_at', { ascending: false });
  const rows = (prior ?? []) as { action: string | null; shown_at: string }[];

  // Rated once, or told us never again — permanent, no matter how much time passes.
  if (rows.some((r) => r.action === 'rated' || r.action === 'never_ask_again')) {
    return { eligible: false, reason: 'already_resolved' };
  }
  if (rows.length >= RATING_PROMPT_MAX_LIFETIME) return { eligible: false, reason: 'lifetime_cap' };

  const last = rows[0];
  if (last && Date.now() - new Date(last.shown_at).getTime() < RATING_PROMPT_COOLDOWN_DAYS * DAY_MS) {
    return { eligible: false, reason: 'cooldown' };
  }

  return { eligible: true };
}
