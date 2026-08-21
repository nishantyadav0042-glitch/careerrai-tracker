import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A share is never lost, never doubled, never falsely declared failed ─────
//
// 21 Aug, the first real student contribution in CareerRai's history:
//   18:22:59  Send pressed
//   18:23:26  the phone's connection died — client showed "failed"
//   18:23:41  the SERVER finished successfully, row live
//   18:24:03  the student pressed Send again
//   18:24:05  429 — "one share a day", for a share they believed never sent
//
// The submission pipeline was never broken. The delivery semantics were: an
// ambiguous network outcome was reported as a definite failure, and the
// retry was refused by a rate limit that reads as an accusation.

const ROUTE = readFileSync('src/app/api/community/submit/route.ts', 'utf8');
const SHEET = readFileSync('src/components/community-submit.tsx', 'utf8');
const MIGRATION = readFileSync('supabase/migrations/20260821b_community_submission_idempotency.sql', 'utf8');

describe('same intent = same submission', () => {
  it('the DB, not the rate limit, is what makes a retry safe', () => {
    // A rate limit that happens to block a duplicate is a guard, not request
    // semantics. The partial unique index is the actual guarantee.
    expect(MIGRATION).toMatch(/create unique index[\s\S]*student_submissions[\s\S]*\(student_id, request_id\)/i);
    expect(MIGRATION).toMatch(/where request_id is not null/i);
  });

  it('one id per share intent, reused by every retry — not regenerated per attempt', () => {
    // useRef, not useState/inline: a fresh id per press would defeat the
    // whole mechanism by making each retry a new intent.
    // safeUuid guards crypto.randomUUID for old webviews (a render-time throw
    // white-screened the sheet); the idea pinned is useRef — one id per INTENT.
    expect(SHEET).toMatch(/requestId\s*=\s*useRef<string>\(safeUuid\(\)\)/);
    expect(SHEET).toContain('requestId: requestId.current');
  });

  it('a replay of a landed share returns its success, never a 429', () => {
    // Order is the invariant: the idempotent lookup must come BEFORE the
    // rate-limit check, or the retry is refused instead of reconciled.
    const replay = ROUTE.indexOf("eq('request_id', requestId)");
    // Anchor on the CHECK, not the import at the top of the file.
    const rateLimit = ROUTE.indexOf('>= MAX_SUBMISSIONS_PER_DAY');
    expect(replay).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(rateLimit);
  });

  it('a concurrent duplicate insert (23505) is success, not an error', () => {
    expect(ROUTE).toMatch(/23505[\s\S]{0,600}sentBody\(/);
  });

  it('a failed replay lookup is UNKNOWN, never "no previous submission"', () => {
    // Answering "not found" on a read error is exactly how a duplicate gets
    // minted — the same ERROR-as-FALSE conversion closed elsewhere this week.
    expect(ROUTE).toMatch(/replayErr[\s\S]{0,200}RECONCILE_UNAVAILABLE/);
  });
});

describe('the student is never told it failed when we do not know', () => {
  it('a dead request triggers reconciliation, not a failure message', () => {
    const catchBlock = SHEET.slice(SHEET.indexOf('} catch (e)'), SHEET.indexOf('setBusy(false);\n  }'));
    expect(catchBlock).toContain('reconcile()');
    // The old lie must not come back.
    expect(catchBlock).not.toContain("setError('Could not send. Please try again.')");
  });

  it('a confirmed landing shows success, even though the request died', () => {
    expect(SHEET).toMatch(/if \(landed\)[\s\S]{0,200}setSent\(landed\)/);
  });

  it('an unconfirmed share invites a retry and promises it is safe', () => {
    expect(SHEET).toMatch(/couldn’t confirm[\s\S]{0,80}won’t post twice/);
  });

  it('the reconcile endpoint answers only about the caller, and can say "unknown"', () => {
    expect(ROUTE).toMatch(/export async function GET/);
    expect(ROUTE).toMatch(/eq\('student_id', user\.id\)[\s\S]{0,80}eq\('request_id', requestId\)/);
    expect(ROUTE).toMatch(/error[\s\S]{0,160}RECONCILE_UNAVAILABLE/);
  });
});

describe('the rate limit states the state, never scolds', () => {
  it('"already in" is said ONLY after the existing row is confirmed', () => {
    // A 429 is not by itself proof their share landed.
    const idx = ROUTE.indexOf('ALREADY_SHARED_TODAY');
    expect(idx).toBeGreaterThan(-1);
    const before = ROUTE.slice(Math.max(0, idx - 700), idx);
    expect(before).toMatch(/select\('id, status'\)/);
    expect(ROUTE).toMatch(/existing\s*\?/);
  });
});

describe('the 27 seconds are measured, not guessed', () => {
  it('every stage is timed so the bottleneck is a number, not a theory', () => {
    // The two Gemini gates now run in Promise.all, timed as one 'safety'
    // stage — the parallelism IS the fix the timing revealed.
    for (const stage of ['safety', 'storageUpload', 'insert', 'imageBytes']) {
      expect(ROUTE, `${stage} is not timed`).toContain(stage);
    }
    expect(ROUTE).toContain('[community-submit-timing]');
  });
});
