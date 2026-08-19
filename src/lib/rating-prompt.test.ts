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

// ── Re-cut additions (19 Aug) ───────────────────────────────────────────────
//
// The parked implementation predates today's security work, so the re-cut
// pins the things that were NOT true when it was written.

import { readFileSync as _read } from 'node:fs';
import { join as _join } from 'node:path';
const readFile = (p: string) => _read(_join(process.cwd(), p), 'utf8');
const sqlOnly = (p: string) =>
  readFile(p).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const MIGRATION_PATH = 'supabase/migrations/20260819g_rating_prompts.sql';

describe('the table cannot be written by a client', () => {
  it('has no write policy at all', () => {
    const s = sqlOnly(MIGRATION_PATH);
    expect(s, 'only /show and /resolve may write, via service_role')
      .not.toMatch(/for (insert|update|delete)/i);
  });

  it('revokes the write grants explicitly too', () => {
    expect(sqlOnly(MIGRATION_PATH))
      .toMatch(/revoke insert, update, delete on public\.rating_prompts from anon, authenticated/i);
  });

  it('uses is_admin(), not a second definition of admin', () => {
    const s = sqlOnly(MIGRATION_PATH);
    expect(s, 'is_admin reads auth.users, which no client can write')
      .toMatch(/public\.is_admin\(\(select auth\.uid\(\)\)\)/);
    expect(s, "profiles.role must not become a second admin authority")
      .not.toMatch(/p\.role = 'admin'/);
  });

  it('a student can only read their own rows', () => {
    expect(sqlOnly(MIGRATION_PATH))
      .toMatch(/for select using \(student_id = \(select auth\.uid\(\)\)\)/);
  });
});

describe('the routes cannot be abused', () => {
  it('show rejects an unknown trigger', () => {
    expect(readFile('src/app/api/rating-prompt/show/route.ts'))
      .toMatch(/RATING_PROMPT_TRIGGERS\.includes\(trigger as RatingPromptTrigger\)/);
  });

  it('resolve can only touch the caller’s own prompt', () => {
    // Without the student_id filter, any id would be resolvable by anyone.
    expect(readFile('src/app/api/rating-prompt/resolve/route.ts'))
      .toMatch(/\.eq\('id', id\)\s*\n?\s*\.eq\('student_id', user\.id\)/);
  });

  it('both routes require a session', () => {
    for (const r of ['show', 'resolve']) {
      expect(readFile(`src/app/api/rating-prompt/${r}/route.ts`))
        .toMatch(/if \(!user\) return NextResponse\.json\(\{ error: 'Unauthenticated' \}, \{ status: 401 \}\)/);
    }
  });
});

describe('the ask never lands on top of the celebration', () => {
  it('renders only once the feedback sheet has closed', () => {
    expect(readFile('src/components/DailyTracker/DailyTrackerApp.tsx'))
      .toMatch(/\{!showFeedback && pendingRatingTrigger && \(/);
  });

  it('a streak milestone outranks a same-day mock', () => {
    expect(readFile('src/components/DailyTracker/DailyTrackerApp.tsx'))
      .toMatch(/setPendingRatingTrigger\(\(prev\) => prev \?\? 'mock_completed'\)/);
  });
});
