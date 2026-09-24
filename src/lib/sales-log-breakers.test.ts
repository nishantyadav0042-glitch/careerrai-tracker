/**
 * Log breakers first, daily loggers second (founder, 24 Sep 2026).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  logBreakerOf, dailyLoggerOf, isConversation,
  LOG_BREAKER_MAX_ATTEMPTS, FEEDBACK_EVERY_DAYS,
} from './sales-log-breakers';
import { assembleDay, SECTION_ORDER, SECTION_OF } from './sales-day';
import type { DueReason } from './call-queue';

const TODAY = '2026-09-24';
const NOW = Date.parse('2026-09-24T12:00:00+05:30');
const at = (d: string, hhmm = '15:00') => new Date(`${d}T${hhmm}:00+05:30`).toISOString();

// Somya Bhargava's week: logged 15–21 Sep but for one day, then nothing.
const SOMYA = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21'];

describe('who is a log breaker', () => {
  it('a 3+ day habit, then 2–7 days without a log', () => {
    const lb = logBreakerOf(SOMYA, TODAY, []);
    expect(lb).toEqual({ lastLog: '2026-09-21', gapDays: 3, habitDays: 6, attemptsSinceBreak: 0 });
    // Missed only yesterday: the break has begun.
    expect(logBreakerOf(['2026-09-20', '2026-09-21', '2026-09-22'], TODAY, [])?.gapDays).toBe(2);
    // Seven days silent is still a fresh break.
    expect(logBreakerOf(['2026-09-15', '2026-09-16', '2026-09-17'], TODAY, [])?.gapDays).toBe(7);
  });

  it('not yet broken: logged yesterday or today', () => {
    expect(logBreakerOf([...SOMYA, '2026-09-23'], TODAY, [])).toBeNull();
    expect(logBreakerOf([...SOMYA, '2026-09-24'], TODAY, [])).toBeNull();
  });

  it('not a habit: fewer than 3 log days in the week that ended at the last log', () => {
    expect(logBreakerOf(['2026-09-14', '2026-09-21'], TODAY, [])).toBeNull();
  });

  it('too long ago: after 7 days the older lanes own them', () => {
    expect(logBreakerOf(['2026-09-14', '2026-09-15', '2026-09-16'], TODAY, [])).toBeNull();
  });

  it('a conversation since the break clears the card; one before it does not', () => {
    expect(logBreakerOf(SOMYA, TODAY, [{ atIso: at('2026-09-22'), status: 'callback' }])).toBeNull();
    expect(logBreakerOf(SOMYA, TODAY, [{ atIso: at('2026-09-21'), status: 'interested' }])).not.toBeNull();
  });

  it(`try up to ${LOG_BREAKER_MAX_ATTEMPTS} times: unanswered tries are counted, then the card stands down`, () => {
    const miss = (d: string, h = '15:00') => ({ atIso: at(d, h), status: 'no_answer' });
    expect(logBreakerOf(SOMYA, TODAY, [miss('2026-09-22')])?.attemptsSinceBreak).toBe(1);
    expect(logBreakerOf(SOMYA, TODAY, [miss('2026-09-22'), { atIso: at('2026-09-23'), status: 'switched_off' }])?.attemptsSinceBreak).toBe(2);
    expect(logBreakerOf(SOMYA, TODAY, [miss('2026-09-22'), miss('2026-09-22', '18:30'), miss('2026-09-23')])).toBeNull();
    // A WhatsApp message is not a connection and not a try.
    expect(logBreakerOf(SOMYA, TODAY, [{ atIso: at('2026-09-22'), status: 'messaged' }])?.attemptsSinceBreak).toBe(0);
  });
});

describe('who is a daily logger', () => {
  const LOGS = ['2026-09-18', '2026-09-19', '2026-09-21', '2026-09-23', '2026-09-24'];

  it('3+ of the last 7 days, the latest today or yesterday', () => {
    expect(dailyLoggerOf(LOGS, TODAY, [], NOW)).toEqual({ daysOf7: 5, lastLog: '2026-09-24' });
    expect(dailyLoggerOf(['2026-09-22', '2026-09-23', '2026-09-24'], TODAY, [], NOW)?.daysOf7).toBe(3);
    expect(dailyLoggerOf(['2026-09-23', '2026-09-24'], TODAY, [], NOW)).toBeNull();
    // Stopped two days ago — that is a log breaker, not a daily logger.
    expect(dailyLoggerOf(['2026-09-20', '2026-09-21', '2026-09-22'], TODAY, [], NOW)).toBeNull();
  });

  it(`one feedback conversation per ${FEEDBACK_EVERY_DAYS} days; unanswered dials do not count`, () => {
    expect(dailyLoggerOf(LOGS, TODAY, [{ atIso: at('2026-09-20'), status: 'interested' }], NOW)).toBeNull();
    expect(dailyLoggerOf(LOGS, TODAY, [{ atIso: at('2026-09-01'), status: 'interested' }], NOW)).not.toBeNull();
    expect(dailyLoggerOf(LOGS, TODAY, [{ atIso: at('2026-09-23'), status: 'no_answer' }], NOW)).not.toBeNull();
  });

  it('a conversation is anything that reached the student', () => {
    for (const s of ['interested', 'callback', 'not_interested', 'dnd', 'converted', 'called']) expect(isConversation(s)).toBe(true);
    for (const s of ['no_answer', 'switched_off', 'messaged', 'skipped', null, '']) expect(isConversation(s)).toBe(false);
  });
});

describe('where they sit in the counsellor\'s day', () => {
  const card = (dueReason: DueReason, i: number) => ({ studentId: `${dueReason}-${i}`, dueReason });

  it('log breakers are the first section; daily loggers come right after the promises', () => {
    expect(SECTION_ORDER[0]).toBe('logbreakers');
    expect(SECTION_ORDER.indexOf('champions')).toBe(SECTION_ORDER.indexOf('promises') + 1);
    expect(SECTION_OF.log_breaker).toBe('logbreakers');
    expect(SECTION_OF.daily_logger).toBe('champions');
  });

  it('neither is ever trimmed from a full day', () => {
    const day = assembleDay([
      ...Array.from({ length: 80 }, (_, i) => card('retry', i)),
      ...Array.from({ length: 12 }, (_, i) => card('log_breaker', i)),
      ...Array.from({ length: 10 }, (_, i) => card('daily_logger', i)),
    ]);
    expect(day.queue.filter((c) => c.dueReason === 'log_breaker')).toHaveLength(12);
    expect(day.queue.filter((c) => c.dueReason === 'daily_logger')).toHaveLength(10);
    expect(day.queue[0].section).toBe('logbreakers');
  });

  it('the queue routes them ahead of the re-dial — the defect that hid every daily logger', () => {
    // On 24 Sep all seven students logging 5+ of 7 days were `no_answer`
    // retries in the second-to-last section. The log-breaker and daily-logger
    // branches must come before the retry branch in the chain.
    const src = readFileSync(join(__dirname, 'call-queue.ts'), 'utf8');
    const lb = src.indexOf('} else if (logBreaker) {');
    const dl = src.indexOf('} else if (dailyLogger) {');
    const retry = src.indexOf("} else if (dueNow && status === 'no_answer') {");
    expect(lb).toBeGreaterThan(-1);
    expect(dl).toBeGreaterThan(lb);
    expect(retry).toBeGreaterThan(dl);
  });
});
