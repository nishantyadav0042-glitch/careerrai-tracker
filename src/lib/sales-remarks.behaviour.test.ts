import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import {
  buildRemarkHistories, isHumanTouch, isTypedRemark,
  HUMAN_PROVENANCE, MAX_REMARKS_ON_CARD, type RemarkRow,
} from './sales-remarks';

/**
 * ── WHAT WAS SAID, EVERY TIME IT WAS SAID ───────────────────────────────────
 *
 * Founder order, 4 Sep 2026. What these tests protect, in order of how much
 * damage the regression would do:
 *
 *  1. LEAD INTAKE IS NOT A REMARK. On 4 Sep the calling card was showing an
 *     internal lead-distribution log line ("Daily intake -> Neelam Singh: 50
 *     of 50 new-per-day used...") as "what the student said" for 272 of the
 *     319 touched students, because the read had no provenance filter. That
 *     is the single worst thing this file exists to make impossible again.
 *  2. AN UNANSWERED DIAL DOES NOT BURY A CONVERSATION. no_answer is the
 *     commonest disposition in production and carries an auto-note; the words
 *     from the call before it must still lead the card.
 *  3. ORDER AND COUNT ARE HONEST. Newest first, capped for the card, and the
 *     total tells the truth about what is not shown.
 */

const REP_A = '11111111-1111-4111-8111-111111111111';
const REP_B = '22222222-2222-4222-8222-222222222222';
const staff = new Map([[REP_A, 'Neelam Singh'], [REP_B, 'Anshul Yadav']]);

function row(over: Partial<RemarkRow> & { created_at: string }): RemarkRow {
  return {
    student_id: 's1', status: 'interested', note: 'said something',
    provenance: HUMAN_PROVENANCE, actor_id: REP_A, ...over,
  };
}

describe('a remark is a human touch and nothing else', () => {
  it('lead-intake bookkeeping is never a remark — the 272-student bug', () => {
    // The exact shape production had on 4 Sep 2026.
    const intake = row({
      created_at: '2026-09-02T04:00:00Z', status: 'reassigned',
      provenance: 'system_generated', actor_id: null,
      note: 'Daily intake -> Neelam Singh: 50 of 50 new-per-day used, book at 500',
    });
    expect(isHumanTouch(intake.provenance, intake.actor_id)).toBe(false);
    const h = buildRemarkHistories([intake], staff);
    expect(h.get('s1'), 'an intake row alone must produce NO history at all').toBeUndefined();
  });

  it('a human provenance with no actor is not a human touch either', () => {
    // Vendor-reported and observed rows can carry provenance values we did not
    // anticipate; the actor is the second half of the definition.
    expect(isHumanTouch(HUMAN_PROVENANCE, null)).toBe(false);
    expect(isHumanTouch(HUMAN_PROVENANCE, '')).toBe(false);
    expect(isHumanTouch('vendor_reported', REP_A)).toBe(false);
    expect(isHumanTouch(HUMAN_PROVENANCE, REP_A)).toBe(true);
  });

  it('mixes real conversations with intake rows and keeps only the conversations', () => {
    const h = buildRemarkHistories([
      row({ created_at: '2026-09-03T10:00:00Z', status: 'reassigned', provenance: 'system_generated', actor_id: null, note: 'Daily intake -> Anshul Yadav' }),
      row({ created_at: '2026-09-01T10:00:00Z', status: 'callback', note: 'he told me send me the application link' }),
    ], staff);
    expect(h.get('s1')!.total).toBe(1);
    expect(h.get('s1')!.last!.note).toBe('he told me send me the application link');
  });
});

describe('the words survive the silence', () => {
  const rows = [
    row({ created_at: '2026-09-04T10:00:00Z', status: 'no_answer', note: 'Did not pick up' }),
    row({ created_at: '2026-09-01T10:00:00Z', status: 'callback', note: 'studies on his own mainly on weekends' }),
  ];

  it('lastTyped reaches past an auto-noted no-answer to the real conversation', () => {
    const h = buildRemarkHistories(rows, staff).get('s1')!;
    expect(h.last!.outcome, 'the newest row is still the newest row').toBe('no_answer');
    expect(h.lastTyped!.note, 'but the WORDS the card leads with are the real ones').toBe('studies on his own mainly on weekends');
  });

  it('lastTyped is null when nobody has ever written anything', () => {
    const h = buildRemarkHistories([
      row({ created_at: '2026-09-04T10:00:00Z', status: 'no_answer', note: 'Did not pick up' }),
      row({ created_at: '2026-09-03T10:00:00Z', status: 'skipped', note: 'Skipped: no time today' }),
    ], staff).get('s1')!;
    expect(h.total, 'the attempts are still real history').toBe(2);
    expect(h.lastTyped).toBeNull();
  });

  it('knows the system auto-notes from the rep\'s own words', () => {
    expect(isTypedRemark('no_answer', 'Did not pick up')).toBe(false);
    expect(isTypedRemark('skipped', 'Skipped: student wrote back')).toBe(false);
    expect(isTypedRemark('messaged', 'Sent a WhatsApp message')).toBe(false);
    expect(isTypedRemark('interested', '   ')).toBe(false);
    expect(isTypedRemark('interested', null)).toBe(false);
    // A rep who types the same words a no-answer would have auto-written is
    // still a rep typing: only the EXACT auto-note is discounted.
    expect(isTypedRemark('no_answer', 'Did not pick up, will retry at 7')).toBe(true);
    expect(isTypedRemark('interested', 'wants mentor for DILR')).toBe(true);
  });
});

describe('order, cap and attribution', () => {
  it('sorts newest first regardless of the order rows arrive in', () => {
    const h = buildRemarkHistories([
      row({ created_at: '2026-09-01T10:00:00Z', note: 'oldest' }),
      row({ created_at: '2026-09-04T10:00:00Z', note: 'newest' }),
      row({ created_at: '2026-09-02T10:00:00Z', note: 'middle' }),
    ], staff).get('s1')!;
    expect(h.remarks.map((r) => r.note)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('caps what travels with the card but tells the truth about the total', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      row({ created_at: `2026-09-0${i + 1}T10:00:00Z`, note: `remark ${i + 1}` }));
    const h = buildRemarkHistories(many, staff).get('s1')!;
    expect(h.remarks).toHaveLength(MAX_REMARKS_ON_CARD);
    expect(h.total, 'the count must not shrink to the cap — the card says "of N"').toBe(9);
    expect(h.remarks[0].note).toBe('remark 9');
  });

  it('attributes each remark to the rep who wrote it, and survives an unknown actor', () => {
    const h = buildRemarkHistories([
      row({ created_at: '2026-09-04T10:00:00Z', actor_id: REP_B, note: 'anshul called' }),
      row({ created_at: '2026-09-03T10:00:00Z', actor_id: 'ghost-rep', note: 'someone who left' }),
    ], staff).get('s1')!;
    expect(h.remarks[0].by).toBe('Anshul Yadav');
    expect(h.remarks[1].by, 'an unresolvable actor renders unattributed, never as a raw uuid').toBeNull();
  });

  it('separates students and never leaks one student\'s remarks onto another', () => {
    const h = buildRemarkHistories([
      row({ student_id: 'a', created_at: '2026-09-04T10:00:00Z', note: 'about A' }),
      row({ student_id: 'b', created_at: '2026-09-03T10:00:00Z', note: 'about B' }),
    ], staff);
    expect(h.get('a')!.remarks.map((r) => r.note)).toEqual(['about A']);
    expect(h.get('b')!.remarks.map((r) => r.note)).toEqual(['about B']);
  });

  it('handles null and empty input without inventing history', () => {
    expect(buildRemarkHistories(null).size).toBe(0);
    expect(buildRemarkHistories([]).size).toBe(0);
  });
});

describe('the call queue reads remarks the way this module defines them', () => {
  const src = codeOnly(readFileSync('src/lib/call-queue.ts', 'utf8'));

  it('filters sales_activity to human touches AT THE DATABASE', () => {
    // The whole 272-student bug in one assertion: without these predicates the
    // newest row for most of the book is an intake log line.
    expect(src).toMatch(/\.eq\('provenance', HUMAN_PROVENANCE\)/);
    expect(src).toMatch(/\.not\('actor_id', 'is', null\)/);
  });

  it('selects the columns the remark model needs to judge a row', () => {
    expect(src).toMatch(/select\('student_id, created_at, status, note, provenance, actor_id'\)/);
  });

  it('builds the history through this module rather than its own reducer', () => {
    expect(src).toMatch(/buildRemarkHistories\(/);
    expect(src, 'the old single-row lastInteraction reducer must be gone').not.toMatch(/lastInteraction/);
  });
});

describe('the calling card renders the history, not one row', () => {
  const src = codeOnly(readFileSync('src/components/call-deck.tsx', 'utf8'));

  it('leads with the newest TYPED remark, falling back to the newest touch', () => {
    expect(src).toMatch(/h\.lastTyped \?\? h\.last/);
  });

  it('offers every remark without leaving the calling list', () => {
    // Sending a counsellor to another page mid-day means the history is read
    // when there is time and skipped when there isn't.
    expect(src).toMatch(/Show all \$\{h\.total\}/);
  });

  it('renders nothing at all when nobody has spoken to the student', () => {
    expect(src).toMatch(/if \(h\.total === 0\) return null/);
  });
});
