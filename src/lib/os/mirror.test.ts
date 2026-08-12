import { describe, it, expect } from 'vitest';
import { mirrorLines, mirrorForDay } from './mirror';
import type { PeerRow } from './peer-cohort';

const me = (over: Partial<PeerRow> = {}): PeerRow => ({
  studentId: 'me',
  attemptYear: 2026,
  targetHours: 5,
  weakestSection: 'DILR',
  daysToExam: 100,
  loggedToday: false,
  loggedDaysLast7: 4,
  sectionsToday: [],
  observedAvgHours: 3,
  ...over,
});

describe('the mirror only speaks from the record', () => {
  it('says nothing at all to a student with no history', () => {
    expect(mirrorLines(me({ loggedDaysLast7: 0, observedAvgHours: null, targetHours: null }))).toEqual([]);
    expect(mirrorForDay(me({ loggedDaysLast7: 0, observedAvgHours: null, targetHours: null }), '2026-08-12')).toBeNull();
  });

  it('celebrates real consistency without turning it into a scoreboard', () => {
    const lines = mirrorLines(me({ loggedDaysLast7: 6 }));
    const c = lines.find((l) => l.id === 'consistency-strong');
    expect(c!.line).toContain('6 of the last 7');
  });

  it('never renders a zero back at a student who had a hard week', () => {
    const lines = mirrorLines(me({ loggedDaysLast7: 0, observedAvgHours: null }));
    expect(lines.some((l) => /\b0\b/.test(l.line))).toBe(false);
  });

  it('is stable for the day — a refresh cannot reroll it', () => {
    const m = me();
    const first = mirrorForDay(m, '2026-08-12');
    for (let i = 0; i < 20; i++) expect(mirrorForDay(m, '2026-08-12')).toEqual(first);
  });
});

describe('tone is a hard constraint, because this fires on bad days too', () => {
  const FORBIDDEN = [
    'falling behind', 'you failed', 'lazy', 'not serious', 'wasted',
    'running out of time', 'only', 'should have', 'disappointing',
  ];

  it('no line shames, warns, or counts down — across the whole input space', () => {
    const cases: Partial<PeerRow>[] = [
      { loggedDaysLast7: 0, observedAvgHours: null },
      { loggedDaysLast7: 1, observedAvgHours: 0.5 },
      { loggedDaysLast7: 2, observedAvgHours: 1, targetHours: 10 },
      { loggedDaysLast7: 7, observedAvgHours: 8, targetHours: 2 },
      { loggedDaysLast7: 4, observedAvgHours: 3, targetHours: 5 },
      { loggedDaysLast7: 5, observedAvgHours: 2, targetHours: 9 },
    ];
    for (const c of cases) {
      for (const { line } of mirrorLines(me(c))) {
        for (const bad of FORBIDDEN) {
          expect(line.toLowerCase(), `"${line}"`).not.toContain(bad);
        }
      }
    }
  });

  it('when the news is bad it points at the plan, not the person', () => {
    const lines = mirrorLines(me({ targetHours: 9, observedAvgHours: 1.5, loggedDaysLast7: 3 }));
    const gap = lines.find((l) => l.id === 'plan-gap');
    expect(gap!.line).toContain('the plan is the thing that is wrong');
  });
});
