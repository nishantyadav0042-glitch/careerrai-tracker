import { describe, it, expect } from 'vitest';
import {
  outreachState, outreachDraft, firstNameOf, STATE_ORDER, STATE_LABEL,
  type OutreachRow, type OutreachState,
} from './student-outreach';

const row = (o: Partial<OutreachRow> = {}): OutreachRow => ({
  studentId: 's1', name: 'Aryan Lalwani', phone: '+919876543210',
  logDays: 1, liveStreak: 0, longestStreak: 1, lastLog: '2026-09-10', daysSinceLastLog: 6,
  ...o,
});

describe('outreachState — a live streak always beats history', () => {
  it('a student logging TODAY is never "stopped"', () => {
    // The ordering bug that would matter: someone who logged an hour ago
    // receiving "you stopped — any reason?". That ends the conversation.
    expect(outreachState(row({ liveStreak: 4, logDays: 30, longestStreak: 12, daysSinceLastLog: 0 })))
      .toBe('logging');
  });

  it('7+ live days is its own state', () => {
    expect(outreachState(row({ liveStreak: 7, logDays: 7, longestStreak: 7 }))).toBe('logging_strong');
    expect(outreachState(row({ liveStreak: 6, logDays: 6, longestStreak: 6 }))).toBe('logging');
  });

  it('a single live day is "just started", not "logging"', () => {
    expect(outreachState(row({ liveStreak: 1, logDays: 1, longestStreak: 1 }))).toBe('logging_new');
  });

  it('one log ever, now quiet, is one_and_done', () => {
    expect(outreachState(row({ logDays: 1, liveStreak: 0, longestStreak: 1 }))).toBe('one_and_done');
  });

  it('a dead chain of 3+ is a broken streak, not merely "stopped"', () => {
    expect(outreachState(row({ logDays: 9, liveStreak: 0, longestStreak: 5 }))).toBe('streak_broken');
  });

  it('several scattered logs with no real chain is "stopped"', () => {
    expect(outreachState(row({ logDays: 4, liveStreak: 0, longestStreak: 2 }))).toBe('stopped');
  });
});

describe('every draft cites only TRUE numbers', () => {
  // A message that says "5 days straight" to somebody who logged three is
  // worse than a generic one: it proves nobody actually looked.
  it('quotes the LIVE streak when the student is still logging', () => {
    const r = row({ liveStreak: 9, logDays: 20, longestStreak: 14, daysSinceLastLog: 0 });
    const d = outreachDraft(r);
    expect(d).toContain('9 days straight');
    expect(d, 'must not quote the longest streak to an actively logging student').not.toContain('14');
    expect(d).not.toContain('20');
  });

  it('quotes the LONGEST streak and the gap when the streak broke', () => {
    const r = row({ liveStreak: 0, logDays: 11, longestStreak: 6, daysSinceLastLog: 4 });
    const d = outreachDraft(r);
    expect(d).toContain('6 days straight');
    expect(d).toContain('4 days ago');
  });

  it('quotes total log days for a scattered, stopped student', () => {
    expect(outreachDraft(row({ liveStreak: 0, logDays: 3, longestStreak: 2 }))).toContain('3 days');
  });

  it('never claims a streak for a one-and-done student', () => {
    const d = outreachDraft(row({ logDays: 1, liveStreak: 0, longestStreak: 1 }));
    expect(d).toContain('once');
    // "days straight" is the streak claim. Plain "tell me straight" is the
    // ask, and is fine — match the claim, not the word.
    expect(d).not.toMatch(/days? straight/);
  });

  it('gets singular right — "1 day", never "1 days"', () => {
    const d = outreachDraft(row({ liveStreak: 0, logDays: 7, longestStreak: 3, daysSinceLastLog: 1 }));
    expect(d).toContain('1 day ago');
    expect(d).not.toContain('1 days');
  });
});

describe('the message obeys the founder brief', () => {
  const everyState: OutreachRow[] = [
    row({ liveStreak: 10, logDays: 10, longestStreak: 10, daysSinceLastLog: 0 }),
    row({ liveStreak: 3, logDays: 3, longestStreak: 3, daysSinceLastLog: 0 }),
    row({ liveStreak: 1, logDays: 1, longestStreak: 1, daysSinceLastLog: 0 }),
    row({ liveStreak: 0, logDays: 8, longestStreak: 4, daysSinceLastLog: 3 }),
    row({ liveStreak: 0, logDays: 4, longestStreak: 2, daysSinceLastLog: 5 }),
    row({ liveStreak: 0, logDays: 1, longestStreak: 1, daysSinceLastLog: 9 }),
  ];

  it('covers all six states', () => {
    expect(new Set(everyState.map(outreachState)).size).toBe(6);
  });

  it('names Nishant as the founder in every draft', () => {
    for (const r of everyState) {
      expect(outreachDraft(r)).toContain('Nishant here, founder of CareerRai');
    }
  });

  it('asks for a suggestion, strength or weakness in every draft', () => {
    for (const r of everyState) {
      expect(outreachDraft(r)).toMatch(/suggestion.*(strength|weakness)|weakness/i);
    }
  });

  it('stays SHORT — two lines, never a paragraph', () => {
    // The founder was explicit: "do line mein ya ek line mein", not five, not
    // ten. 260 characters is roughly two WhatsApp lines on a phone.
    for (const r of everyState) {
      const d = outreachDraft(r);
      expect(d.length, `too long (${d.length}): ${d}`).toBeLessThanOrEqual(260);
    }
  });

  it('thanks them, and never sells anything', () => {
    for (const r of everyState) {
      const d = outreachDraft(r);
      expect(d).toContain('Thanks a lot.');
      // No pricing, no upgrade, no booking — this is a feedback ask only.
      expect(d).not.toMatch(/₹|\bbuy\b|upgrade|session|book|premium|offer|discount/i);
    }
  });

  it('never opens with a database placeholder', () => {
    const d = outreachDraft(row({ name: '(no name)' }));
    expect(d).not.toContain('(no name)');
    expect(d).toContain('Hi there,');
  });
});

describe('firstNameOf', () => {
  it('takes the first token', () => {
    expect(firstNameOf('Aryan Lalwani')).toBe('Aryan');
    expect(firstNameOf('  Neelam  Singh ')).toBe('Neelam');
  });
  it('falls back for empty and placeholder names', () => {
    expect(firstNameOf('')).toBe('there');
    expect(firstNameOf('(no name)')).toBe('there');
  });
});

describe('board ordering', () => {
  it('lists every state exactly once, with a label each', () => {
    const all: OutreachState[] = ['logging_strong', 'logging', 'logging_new', 'streak_broken', 'stopped', 'one_and_done'];
    expect([...STATE_ORDER].sort()).toEqual([...all].sort());
    for (const s of all) expect(STATE_LABEL[s]).toBeTruthy();
  });

  it('puts long streaks first and one-and-done last', () => {
    // Deliberate: the person mid-streak can say what WORKS and no other list
    // asks them; one-and-done is the biggest group but the vaguest answers.
    expect(STATE_ORDER[0]).toBe('logging_strong');
    expect(STATE_ORDER[STATE_ORDER.length - 1]).toBe('one_and_done');
  });
});
