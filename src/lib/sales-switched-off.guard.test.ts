import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEAD_STATUSES, UNREACHED_OUTCOMES, isUnreached, isCallOutcome, planDisposition, MAX_CONSECUTIVE_NO_ANSWER } from './sales-disposition';

// ── A PHONE THAT IS OFF IS NOT A PHONE NOBODY ANSWERED ──────────────────────
//
// Founder, 17 Sep 2026. `no_answer` held 256 students — the second largest
// status in the book — and two different facts: it rang and nobody picked up,
// and the phone was off. Our students switch phones off in order to study, so
// the second may be the signal rather than the failure.
//
// What this guards is that the SPLIT changed nothing except what is recorded.
// Every behavioural difference is a guess until the two numbers exist
// separately, and this repo has paid for guessing ahead of measurement twice
// in a week (#92, #99).

const now = Date.parse('2026-09-17T11:00:00Z');

describe('switched_off is recordable, and changes nothing else yet', () => {
  it('is a call outcome, and one of exactly two unreached ones', () => {
    expect(isCallOutcome('switched_off')).toBe(true);
    expect([...UNREACHED_OUTCOMES]).toEqual(['no_answer', 'switched_off']);
    expect(isUnreached('no_answer')).toBe(true);
    expect(isUnreached('switched_off')).toBe(true);
    expect(isUnreached('interested'), 'a conversation is not a miss').toBe(false);
    expect(isUnreached('messaged'), 'nobody failed to answer a message').toBe(false);
    expect(isUnreached('skipped'), 'a skip is not a contact at all').toBe(false);
  });

  it('is NOT a lead status — the lead is in the same place either way', () => {
    // `lead_outreach.status` records WHERE a lead is. An unreached student is
    // unreached. Adding it there would mean every branch reading
    // `status = 'no_answer'` — the retry lane, the contact ceiling, the
    // connected-today count — silently stopped seeing half its population.
    expect([...LEAD_STATUSES]).not.toContain('switched_off');
    expect(planDisposition('switched_off', { prevMisses: 0, hot: false, nowMs: now }).status).toBe('no_answer');
  });

  it('takes the same clock, the same miss and the same ceiling as no_answer', () => {
    for (const misses of [0, 1, 3, MAX_CONSECUTIVE_NO_ANSWER - 1]) {
      for (const hot of [true, false]) {
        const a = planDisposition('no_answer', { prevMisses: misses, hot, nowMs: now });
        const b = planDisposition('switched_off', { prevMisses: misses, hot, nowMs: now });
        expect(b, `misses=${misses} hot=${hot}: the split must not move the cadence`).toEqual(a);
      }
    }
    // And the ceiling closes it identically.
    const at = planDisposition('switched_off', { prevMisses: MAX_CONSECUTIVE_NO_ANSWER - 1, hot: false, nowMs: now });
    expect(at.noAnswerCount).toBe(MAX_CONSECUTIVE_NO_ANSWER);
    expect(at.nextActionAt, 'the ceiling still stops the dialling').toBeNull();
  });

  it('the database learned the value, and no history was rewritten', () => {
    const sql = readFileSync('supabase/migrations/20260917a_switched_off_is_not_no_answer.sql', 'utf8');
    expect(sql).toContain("'switched_off'");
    expect(sql, 'only the activity CHECK moves').toContain('sales_activity_status_check');
    expect(sql, 'lead_outreach keeps its vocabulary').not.toMatch(/alter table lead_outreach/i);
    // Relabelling old rows would invent a distinction nobody drew at the time.
    expect(sql, 'no backfill').not.toMatch(/\bupdate\s+sales_activity\b/i);
  });

  it('the counsellor can actually record it — an outcome nobody can reach is not an outcome', () => {
    const deck = readFileSync('src/components/call-deck.tsx', 'utf8');
    expect(deck).toContain("dispose(lead, 'switched_off', '')");
    expect(deck, 'and it says what it means').toContain('Switched off');
    // Six actions now sit on that row; un-wrapped it crushes every label on a
    // phone. This is the layout rule, not a preference.
    const row = deck.slice(deck.indexOf('mt-3 flex'), deck.indexOf('mt-3 flex') + 120);
    expect(row, 'the action row must wrap').toContain('flex-wrap');
  });
});
