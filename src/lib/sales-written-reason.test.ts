/**
 * Founder, 24 Sep 2026: "I want him to write the reason instead of just picking."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writtenReasonProblem, needsWrittenReason, writtenReasonPrompt } from './sales-written-reason';

const REAL = 'She said the app crashed twice when she tried to log in the evening';

describe('the written reason on log-breaker and daily-logger cards', () => {
  it('a connected call needs a real sentence', () => {
    for (const outcome of ['interested', 'not_interested', 'dnd', 'converted']) {
      expect(writtenReasonProblem('log_breaker', outcome, 'ok')).not.toBeNull();
      expect(writtenReasonProblem('log_breaker', outcome, 'busy with exams')).not.toBeNull();
      expect(writtenReasonProblem('log_breaker', outcome, REAL)).toBeNull();
      expect(writtenReasonProblem('daily_logger', outcome, REAL)).toBeNull();
    }
  });

  it('padding is not a sentence: fewer than six words fails however long', () => {
    expect(writtenReasonProblem('daily_logger', 'interested', 'goooooooooooooooooooooooooooooood')).not.toBeNull();
    expect(writtenReasonProblem('daily_logger', 'interested', '. . . . . . . . . . . . . . . .')).not.toBeNull();
  });

  it('only these two lanes, and never a callback or an unanswered call', () => {
    expect(needsWrittenReason('going_cold', 'interested')).toBe(false);
    expect(needsWrittenReason('log_breaker', 'callback')).toBe(false);
    expect(needsWrittenReason('log_breaker', 'no_answer')).toBe(false);
    expect(needsWrittenReason('log_breaker', 'messaged')).toBe(false);
    expect(needsWrittenReason(null, 'interested')).toBe(false);
  });

  it('the remark box asks the right question per lane', () => {
    expect(writtenReasonPrompt('log_breaker')).toMatch(/Why did they stop logging/);
    expect(writtenReasonPrompt('daily_logger')).toMatch(/Why do they log daily/);
    expect(writtenReasonPrompt('fresh')).toBeNull();
  });

  it('the server and the call deck enforce the same rule, and the deck drops the picker', () => {
    const route = readFileSync(join(__dirname, '..', 'app', 'api', 'sales', 'log', 'route.ts'), 'utf8');
    // The lane is the one the system dealt today, never one the client sends.
    expect(route).toMatch(/readToday\(admin, principal\.id\)\)\.find\(\(r\) => r\.studentId === studentId\)/);
    expect(route).toMatch(/writtenReasonProblem\(dealt\?\.lane \?\? null, outcome, noteText\)/);
    const deck = readFileSync(join(__dirname, '..', 'components', 'call-deck.tsx'), 'utf8');
    expect(deck).toMatch(/const asksReason = !isUnreached\(outcome\) && !isSkip && !writesReason;/);
    expect(deck).toMatch(/&& reasonProblem === null/);
  });
});
