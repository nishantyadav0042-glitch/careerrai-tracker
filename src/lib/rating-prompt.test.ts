import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkRatingPromptEligibility, detectPlatformFromUA,
  RATING_PROMPT_MIN_ACCOUNT_AGE_DAYS, RATING_PROMPT_COOLDOWN_DAYS, RATING_PROMPT_MAX_LIFETIME,
} from './rating-prompt';

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

function fakeAdmin(
  createdAt: string | null,
  priorRows: { action: string | null; shown_at: string }[],
): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: createdAt ? { created_at: createdAt } : null }) }) }) };
      }
      if (table === 'rating_prompts') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: priorRows }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('detectPlatformFromUA', () => {
  it('reads iOS from the UA', () => {
    expect(detectPlatformFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
  });
  it('reads Android from the UA', () => {
    expect(detectPlatformFromUA('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
  });
  it('has no store for desktop or a missing UA', () => {
    expect(detectPlatformFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBeNull();
    expect(detectPlatformFromUA(null)).toBeNull();
  });
});

describe('checkRatingPromptEligibility', () => {
  it('rejects a platform we could not identify — nowhere sensible to send the tap', async () => {
    const admin = fakeAdmin(daysAgo(30), []);
    const result = await checkRatingPromptEligibility(admin, 'student-1', null);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_store_for_platform');
  });

  it('rejects an account newer than the minimum age — never ask before value is delivered', async () => {
    const admin = fakeAdmin(daysAgo(RATING_PROMPT_MIN_ACCOUNT_AGE_DAYS - 1), []);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'ios');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('too_new');
  });

  it('is eligible for an old-enough account with no prior prompts', async () => {
    const admin = fakeAdmin(daysAgo(RATING_PROMPT_MIN_ACCOUNT_AGE_DAYS + 1), []);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'ios');
    expect(result.eligible).toBe(true);
  });

  it('permanently suppresses after "rated", no matter how long ago', async () => {
    const admin = fakeAdmin(daysAgo(365), [{ action: 'rated', shown_at: daysAgo(300) }]);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'ios');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('already_resolved');
  });

  it('permanently suppresses after "never_ask_again"', async () => {
    const admin = fakeAdmin(daysAgo(365), [{ action: 'never_ask_again', shown_at: daysAgo(300) }]);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'android');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('already_resolved');
  });

  it('caps at the lifetime max even with dismissed-only history and cooldown expired', async () => {
    const rows = Array.from({ length: RATING_PROMPT_MAX_LIFETIME }, (_, i) => (
      { action: 'dismissed', shown_at: daysAgo(RATING_PROMPT_COOLDOWN_DAYS + 10 + i) }
    ));
    const admin = fakeAdmin(daysAgo(365), rows);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'ios');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('lifetime_cap');
  });

  it('blocks inside the cooldown window since the most recent prompt', async () => {
    const admin = fakeAdmin(daysAgo(365), [{ action: 'dismissed', shown_at: daysAgo(RATING_PROMPT_COOLDOWN_DAYS - 1) }]);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'ios');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('cooldown');
  });

  it('is eligible again once the cooldown has fully elapsed', async () => {
    const admin = fakeAdmin(daysAgo(365), [{ action: 'dismissed', shown_at: daysAgo(RATING_PROMPT_COOLDOWN_DAYS + 1) }]);
    const result = await checkRatingPromptEligibility(admin, 'student-1', 'ios');
    expect(result.eligible).toBe(true);
  });
});
