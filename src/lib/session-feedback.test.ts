import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateFeedback, summarise, isResolution, RESOLUTIONS, RESOLUTION_LABEL,
  MIN_RATING, MAX_RATING, MIN_FEEDBACK_FOR_AVERAGE, type FeedbackRow,
} from './session-feedback';

const SQL = readFileSync('supabase/migrations/20260824j_session_intent_and_feedback.sql', 'utf8');
const ROUTE = readFileSync('src/app/api/sessions/feedback/route.ts', 'utf8');

// A mentor pressing "Complete" is not what makes a session real. started_at /
// ended_at remain the delivery authority. This is the STUDENT's verdict on a
// session the product already believes happened.

describe('only a completed session can be rated', () => {
  it('the DATABASE refuses feedback on anything else', () => {
    // Verified functionally against careerrai-test: scheduled, in-progress and
    // cancelled sessions were all refused, completed was accepted.
    expect(SQL).toMatch(/session_status <> 'completed'/);
    expect(SQL).toMatch(/only a completed session can be rated/);
  });

  it('the feedback must belong to the two people who were in the room', () => {
    expect(SQL).toMatch(/new\.student_id <> s\.student_id or new\.buddy_id <> s\.buddy_id/);
  });

  it('one row per session — an average cannot be stuffed', () => {
    expect(SQL).toMatch(/video_session_id uuid not null unique/);
  });

  it('the route checks status for a readable message too', () => {
    expect(ROUTE).toMatch(/session_status !== 'completed'/);
    expect(ROUTE).toMatch(/409/);
  });

  it('only the student may rate — not the mentor', () => {
    // A mentor rating their own session would make every quality number
    // self-reported, the exact mistake the intervention ledger avoids.
    expect(ROUTE).toMatch(/session\.student_id !== user\.id/);
  });

  it('a failed read answers 503, never "session not found"', () => {
    const guard = ROUTE.slice(ROUTE.indexOf('readError'));
    expect(guard).toMatch(/503/);
  });

  it('a second submission is a quiet success, not an error', () => {
    expect(ROUTE).toMatch(/23505/);
    expect(ROUTE).toMatch(/alreadySubmitted/);
  });
});

describe('validation', () => {
  it('accepts a well-formed answer', () => {
    const r = validateFeedback({ rating: 4, issueResolved: 'partly', wouldBookAgain: true });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.rating).toBe(4);
  });

  it.each([0, 6, -1, 2.5, NaN, 'five'])('rejects rating %s', (rating) => {
    expect(validateFeedback({ rating, issueResolved: 'fully' }).ok).toBe(false);
  });

  it('rejects an invented resolution', () => {
    expect(validateFeedback({ rating: 5, issueResolved: 'sort_of' }).ok).toBe(false);
    expect(validateFeedback({ rating: 5 }).ok).toBe(false);
  });

  it('empty optional text becomes null, not an empty string', () => {
    const r = validateFeedback({ rating: 5, issueResolved: 'fully', whatHelped: '   ' });
    expect(r.ok && r.value.whatHelped).toBeNull();
  });

  it('long text is truncated rather than rejected', () => {
    const r = validateFeedback({ rating: 5, issueResolved: 'fully', whatHelped: 'x'.repeat(5000) });
    expect(r.ok && (r.value.whatHelped?.length ?? 0)).toBeLessThanOrEqual(2000);
  });

  it('a missing would-book-again is null, never false', () => {
    // "Did not answer" and "said no" are different facts.
    const r = validateFeedback({ rating: 5, issueResolved: 'fully' });
    expect(r.ok && r.value.wouldBookAgain).toBeNull();
  });

  it('the resolution vocabulary matches the DB constraint', () => {
    const m = SQL.match(/issue_resolved in \(([^)]*)\)/);
    expect(m).toBeTruthy();
    const dbValues = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(dbValues).toEqual([...RESOLUTIONS].sort());
  });

  it('every resolution has a human label', () => {
    for (const r of RESOLUTIONS) expect(RESOLUTION_LABEL[r]).toBeTruthy();
    expect(isResolution('fully')).toBe(true);
    expect(isResolution('maybe')).toBe(false);
  });

  it('the rating bounds agree with the DB', () => {
    expect(SQL).toContain(`rating between ${MIN_RATING} and ${MAX_RATING}`);
  });
});

describe('summarising refuses a confident average over a thin sample', () => {
  const rows = (n: number, rating = 5, res = 'fully'): FeedbackRow[] =>
    Array.from({ length: n }, () => ({
      rating, issue_resolved: res, would_book_again: true, session_intent: 'qa_weak',
    }));

  it('below the floor there is no average, only counts', () => {
    const s = summarise(rows(3));
    expect(s.count).toBe(3);
    expect(s.averageRating).toBeNull();
  });

  it('at the floor an average appears', () => {
    const s = summarise(rows(MIN_FEEDBACK_FOR_AVERAGE, 4));
    expect(s.averageRating).toBe(4);
  });

  it('rating and resolution are counted independently', () => {
    // A student can rate the mentor 5 and still say nothing was solved — that
    // disagreement is the most useful row in the table and must survive.
    const s = summarise([...rows(5, 5, 'not_at_all')]);
    expect(s.averageRating).toBe(5);
    expect(s.notResolved).toBe(5);
    expect(s.resolvedFully).toBe(0);
  });

  it('the resolution buckets always account for everyone', () => {
    const mixed = [...rows(2, 5, 'fully'), ...rows(2, 3, 'partly'), ...rows(2, 1, 'not_at_all')];
    const s = summarise(mixed);
    expect(s.resolvedFully + s.resolvedPartly + s.notResolved).toBe(s.count);
  });

  it('an empty set is null, not zero or NaN', () => {
    const s = summarise([]);
    expect(s.count).toBe(0);
    expect(s.averageRating).toBeNull();
    expect(Number.isNaN(s.averageRating as number)).toBe(false);
  });
});

describe('this does not duplicate an existing authority', () => {
  it('it is a NEW table, not an overload of buddy_feedback or rating_prompts', () => {
    // buddy_feedback is the mentor writing about the student — the opposite
    // direction. rating_prompts is the App Store ask.
    expect(SQL).toMatch(/create table if not exists public\.session_feedback/);
    const lib = readFileSync('src/lib/session-feedback.ts', 'utf8');
    expect(lib).not.toMatch(/from\(['"]buddy_feedback['"]\)/);
    expect(lib).not.toMatch(/from\(['"]rating_prompts['"]\)/);
    expect(ROUTE).not.toMatch(/rating_prompts/);
  });
});
