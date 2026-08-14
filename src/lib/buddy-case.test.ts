import { describe, it, expect } from 'vitest';
import {
  buildBuddyCase, topFindings, sessionPitch,
  MIN_MOCKS_FOR_TREND, PLATEAU_BAND, type BuddyCaseInput,
} from './buddy-case';

// This module tells a student what is wrong with their preparation and then
// asks them for money. That order puts a very high bar on every claim: a
// finding a student reads and does not recognise says the product does not
// know them, which costs more than the sale it was meant to win.
//
// So these tests are mostly about SILENCE — the cases where we must say
// nothing rather than reach for a claim.

const BLANK: BuddyCaseInput = {
  plannedHours7d: null, loggedHours7d: null, missedDays7d: null,
  recentMockPercentiles: [], coveragePct: null, daysToTarget: null,
  hasPlanShape: true, isRepeater: false,
  weakestSectionNow: null, weakestSectionAtSignup: null, hasMentor: false,
  sectionsStarted: [], mocksEver: false, daysSinceLastMock: null, repeatSwapped: null,
};
const kinds = (i: Partial<BuddyCaseInput>) => buildBuddyCase({ ...BLANK, ...i }).map((f) => f.kind);

describe('a student we know nothing about gets no invented problem', () => {
  it('a brand-new student sees only the honest floor', () => {
    expect(kinds({})).toEqual(['unreviewed']);
  });

  it('and a brand-new student WITH a mentor gets nothing at all', () => {
    expect(kinds({ hasMentor: true })).toEqual([]);
  });

  it('the floor claim carries no invented statistic', () => {
    // "~50% of aspirants are repeaters" is unverifiable and our own onboarded
    // students self-report ~16%. The pain does not need a number.
    const floor = buildBuddyCase({ ...BLANK }).find((f) => f.kind === 'unreviewed');
    expect(floor?.evidence).not.toMatch(/\d+\s*%/);
  });

  it('no finding anywhere quotes a population statistic', () => {
    const everything = buildBuddyCase({
      ...BLANK, plannedHours7d: 28, loggedHours7d: 10,
      recentMockPercentiles: [62, 64, 61, 63], coveragePct: 20, daysToTarget: 60,
      hasPlanShape: false, isRepeater: true,
      weakestSectionNow: 'VARC', weakestSectionAtSignup: 'VARC',
    });
    for (const f of everything) {
      // Percentages are allowed only where they are the STUDENT's own number
      // (syllabus coverage). Never "X% of aspirants".
      expect(f.evidence, f.kind).not.toMatch(/of (CAT )?aspirants/i);
      expect(f.evidence, f.kind).not.toMatch(/students (are|do)/i);
    }
  });
});

describe('consistency is measured against the student\'s OWN promise', () => {
  it('fires when they fall well short of the hours they set', () => {
    const f = buildBuddyCase({ ...BLANK, plannedHours7d: 28, loggedHours7d: 17 })
      .find((x) => x.kind === 'consistency');
    expect(f?.evidence).toBe('You planned 28 hrs this week and logged 17.');
  });

  it('stays quiet when they are broadly keeping up', () => {
    expect(kinds({ plannedHours7d: 28, loggedHours7d: 25 })).not.toContain('consistency');
  });

  it('stays quiet on a tiny planned week, where the ratio means nothing', () => {
    // 1 of 2 hours is a 50% shortfall and says nothing about anybody.
    expect(kinds({ plannedHours7d: 2, loggedHours7d: 1 })).not.toContain('consistency');
  });

  it('says nothing when either side is unknown', () => {
    expect(kinds({ plannedHours7d: 28, loggedHours7d: null })).not.toContain('consistency');
    expect(kinds({ plannedHours7d: null, loggedHours7d: 5 })).not.toContain('consistency');
  });
});

describe('mock trends need enough mocks to be a trend', () => {
  it('below the minimum we say nothing, however flat the numbers look', () => {
    const few = Array(MIN_MOCKS_FOR_TREND - 1).fill(62);
    const k = kinds({ recentMockPercentiles: few });
    expect(k).not.toContain('mock_plateau');
    expect(k).not.toContain('mock_drop');
  });

  it('a flat run reads as a plateau, with the real numbers shown', () => {
    const f = buildBuddyCase({ ...BLANK, recentMockPercentiles: [62, 64, 61, 63] })
      .find((x) => x.kind === 'mock_plateau');
    expect(f?.evidence).toBe('Last 4 mocks: 62 → 64 → 61 → 63.');
  });

  it('a genuine climb is never called a plateau', () => {
    expect(kinds({ recentMockPercentiles: [55, 68, 74, 82] })).not.toContain('mock_plateau');
  });

  it('a real fall outranks a plateau — going backwards is the more urgent story', () => {
    const all = buildBuddyCase({ ...BLANK, recentMockPercentiles: [80, 74, 70, 66] });
    expect(all[0].kind).toBe('mock_drop');
    expect(all.map((f) => f.kind)).not.toContain('mock_plateau');
  });

  it('a wobble inside the band is a plateau, not a drop', () => {
    const k = kinds({ recentMockPercentiles: [64, 62, 61, 64 - PLATEAU_BAND + 1] });
    expect(k).toContain('mock_plateau');
    expect(k).not.toContain('mock_drop');
  });

  it('impossible percentiles are discarded rather than reported', () => {
    expect(kinds({ recentMockPercentiles: [-4, 250, NaN] })).not.toContain('mock_plateau');
  });
});

describe('the repeater finding is specific, not a label', () => {
  it('fires only when the weak section genuinely never moved', () => {
    expect(kinds({ isRepeater: true, weakestSectionNow: 'VARC', weakestSectionAtSignup: 'VARC' }))
      .toContain('repeating_pattern');
  });

  it('a repeater whose weak section CHANGED is not told they are repeating', () => {
    // They fixed something. Saying otherwise would be false and insulting.
    expect(kinds({ isRepeater: true, weakestSectionNow: 'QA', weakestSectionAtSignup: 'VARC' }))
      .not.toContain('repeating_pattern');
  });

  it('a first-timer is never called a repeater', () => {
    expect(kinds({ isRepeater: false, weakestSectionNow: 'VARC', weakestSectionAtSignup: 'VARC' }))
      .not.toContain('repeating_pattern');
  });
});

describe('the timeline finding respects the student\'s own date', () => {
  it('fires when coverage is low and their date is close', () => {
    const f = buildBuddyCase({ ...BLANK, coveragePct: 22, daysToTarget: 60 })
      .find((x) => x.kind === 'behind_timeline');
    expect(f?.evidence).toBe('22% of the syllabus covered, 60 days to the date you set.');
  });

  it('stays quiet when they are comfortably covered', () => {
    expect(kinds({ coveragePct: 80, daysToTarget: 60 })).not.toContain('behind_timeline');
  });

  it('stays quiet when the date is far enough away to fix it calmly', () => {
    expect(kinds({ coveragePct: 20, daysToTarget: 300 })).not.toContain('behind_timeline');
  });

  it('never fires on a date that has already passed', () => {
    expect(kinds({ coveragePct: 20, daysToTarget: -5 })).not.toContain('behind_timeline');
  });
});

describe('ranking and the offer that follows it', () => {
  it('the strongest evidence leads, and the no-data floor ranks last', () => {
    const all = buildBuddyCase({
      ...BLANK, recentMockPercentiles: [80, 74, 70, 66],
      plannedHours7d: 28, loggedHours7d: 10,
    });
    expect(all[0].kind).toBe('mock_drop');
    expect(all[all.length - 1].kind).toBe('unreviewed');
  });

  it('shows three findings — one reads as nitpicking, five as an attack', () => {
    const all = buildBuddyCase({
      ...BLANK, recentMockPercentiles: [80, 74, 70, 66], plannedHours7d: 28, loggedHours7d: 10,
      coveragePct: 20, daysToTarget: 60, hasPlanShape: false, isRepeater: true,
      weakestSectionNow: 'VARC', weakestSectionAtSignup: 'VARC',
    });
    expect(all.length).toBeGreaterThan(3);
    expect(topFindings(all)).toHaveLength(3);
  });

  it('the session offered answers the problem they just read', () => {
    expect(sessionPitch({ kind: 'mock_plateau' } as never).label).toBe('Mock Strategy Session');
    expect(sessionPitch({ kind: 'consistency' } as never).label).toBe('Prep Routine Session');
    expect(sessionPitch({ kind: 'repeating_pattern' } as never).label).toBe('Second-Attempt Session');
    expect(sessionPitch(undefined).label).toBe('Prep Review Session');
  });

  it('every finding carries evidence AND what a Buddy does about it', () => {
    const all = buildBuddyCase({
      ...BLANK, recentMockPercentiles: [62, 64, 61, 63], plannedHours7d: 28, loggedHours7d: 10,
    });
    for (const f of all) {
      expect(f.title.length, f.kind).toBeGreaterThan(0);
      expect(f.evidence.length, f.kind).toBeGreaterThan(0);
      expect(f.soWhat.length, f.kind).toBeGreaterThan(0);
    }
  });
});

describe('the one external fact we print is sourced and hedged', () => {
  it('quotes the sourced RANGE, never a point estimate', async () => {
    const { REPEATER_FACT } = await import('./buddy-case');
    expect(REPEATER_FACT).toContain('30–40%');
    expect(REPEATER_FACT).toContain('estimated');
    // The founder's original ask was "~50%". We could not source it, our own
    // onboarded students self-report ~16%, and the research he then sent puts
    // it at 30-40%. A number nobody can check is the one thing TRUST-OS is
    // absolute about.
    expect(REPEATER_FACT).not.toContain('50%');
  });

  it('carries its source, including that no official figure exists', async () => {
    const { REPEATER_SOURCE } = await import('./buddy-case');
    expect(REPEATER_SOURCE).toContain('Careers360');
    expect(REPEATER_SOURCE).toMatch(/not published/i);
  });

  it('never claims the CAUSE of repeating', async () => {
    const { REPEATER_FACT, REPEATER_SO_WHAT } = await import('./buddy-case');
    // "Students repeat BECAUSE they have no mentor" is a causal claim nobody
    // has evidence for. What is true and enough: repeating the year is common,
    // repeating the same preparation is the avoidable part.
    for (const line of [REPEATER_FACT, REPEATER_SO_WHAT]) {
      expect(line).not.toMatch(/because/i);
      expect(line).not.toMatch(/mentor/i);
    }
  });
});

describe('the section gap is a gap, not a start', () => {
  const secs = (qa: number, varc: number, dilr: number) => ([
    { section: 'QA', started: qa, total: 28 },
    { section: 'VARC', started: varc, total: 9 },
    { section: 'DILR', started: dilr, total: 9 },
  ]);

  it('the founder\'s example: 9 of 28 QA while the rest moves → named, with the numbers', () => {
    const f = buildBuddyCase({ ...BLANK, sectionsStarted: secs(9, 7, 6) })
      .find((x) => x.kind === 'section_gap');
    expect(f?.title).toBe('QA is your biggest gap');
    expect(f?.evidence).toBe('Only 9 of 28 QA topics started.');
  });

  it('a brand-new student with zero everywhere has a start, not a gap', () => {
    expect(kinds({ sectionsStarted: secs(0, 0, 0) })).not.toContain('section_gap');
  });

  it('balanced progress is never called a gap', () => {
    expect(kinds({ sectionsStarted: secs(15, 5, 5) })).not.toContain('section_gap');
  });
});

describe('mocks not happening is its own finding', () => {
  it('real coverage but zero mocks ever → said plainly', () => {
    const k = kinds({ mocksEver: false, coveragePct: 35 });
    expect(k).toContain('mock_missing');
  });

  it('a day-one student is not scolded for a mock they could not sit', () => {
    expect(kinds({ mocksEver: false, coveragePct: 5 })).not.toContain('mock_missing');
    expect(kinds({ mocksEver: false, coveragePct: null })).not.toContain('mock_missing');
  });

  it('a long gap since the last mock fires with the real count of days', () => {
    const f = buildBuddyCase({ ...BLANK, mocksEver: true, daysSinceLastMock: 23 })
      .find((x) => x.kind === 'mock_gap');
    expect(f?.title).toBe('No mock in 23 days');
  });

  it('a recent mock keeps both quiet', () => {
    const k = kinds({ mocksEver: true, daysSinceLastMock: 6, coveragePct: 40 });
    expect(k).not.toContain('mock_gap');
    expect(k).not.toContain('mock_missing');
  });
});

describe('avoidance needs a real pattern', () => {
  it('the same topic swapped away twice is named with the count', () => {
    const f = buildBuddyCase({ ...BLANK, repeatSwapped: { topic: 'Geometry', times: 3 } })
      .find((x) => x.kind === 'topic_avoidance');
    expect(f?.title).toBe('You keep pushing Geometry away');
    expect(f?.evidence).toContain('3 times');
  });

  it('one swap is a choice, not avoidance', () => {
    expect(kinds({ repeatSwapped: { topic: 'Geometry', times: 1 } })).not.toContain('topic_avoidance');
  });
});
