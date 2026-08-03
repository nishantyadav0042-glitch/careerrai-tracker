import { describe, it, expect } from 'vitest';
import {
  composeNote, detectAvoidance, detectDrift, detectRevisionGap, detectEarned,
  paceLine, type StudentSnapshot,
} from './note-engine';

// These tests enforce the Nine Laws (docs/CAREERRAI-THESIS.md v1.4) as
// behaviour, on fixtures shaped like REAL production students — because the
// engine that writes to nineteen real people in the pilot must be provably
// incapable of the failure modes the research documented.

const TODAY = '2026-08-05';

const base: StudentSnapshot = {
  firstName: 'Aman',
  targetPercentile: 99,
  coachingName: 'TIME',
  isRepeater: false,
  weakSection: 'VARC',
  weakTopic: 'Reading Comprehension',
  daysToCat: 116,
  logs: [],
  coverage: [],
};

const log = (date: string, sections: string[], hours = 2) => ({ date, hours, sections });
const cov = (topic: string, section: string, status: StudentSnapshot['coverage'][0]['status'], updatedAt: string) =>
  ({ topic, section, status, updatedAt });

// The Vedprakash shape: 18 days, DILR-dominant, VARC starved.
function driftStudent(): StudentSnapshot {
  const logs = [];
  for (let i = 1; i <= 10; i++) logs.push(log(`2026-07-${25 + (i % 5)}`, ['DILR']));
  return {
    ...base,
    firstName: 'Ved',
    weakSection: 'QA',
    logs: [
      log('2026-08-04', ['DILR']), log('2026-08-03', ['DILR']), log('2026-08-02', ['DILR']),
      log('2026-08-01', ['DILR']), log('2026-07-31', ['DILR']), log('2026-07-30', ['QA']),
      log('2026-07-29', ['DILR']), log('2026-07-28', ['DILR']),
    ],
    coverage: [cov('Percentages', 'QA', 'practicing', '2026-07-20')],
  };
}

describe('Law 3 — the earned delta opens the note; the cut never leads', () => {
  it('places the ✅ earned line before any observation, structurally', () => {
    const s = driftStudent();
    const note = composeNote(s, TODAY);
    const earnedIdx = note.text.indexOf('✅');
    const obsIdx = note.text.indexOf("not noticing");
    expect(earnedIdx).toBeGreaterThan(-1);
    expect(obsIdx).toBeGreaterThan(earnedIdx); // ostrich law: never red on open
  });

  it('finds something earned even for a thin log — that is what memory is FOR', () => {
    const s = { ...base, logs: [log('2026-08-03', ['QA'])] };
    expect(detectEarned(s, TODAY)?.text).toContain('1 logged day');
  });
});

describe('Law 2 — thresholds, bands, and steady-as-good-news', () => {
  it('says steady when nothing crosses a band, and says it positively', () => {
    const s: StudentSnapshot = {
      ...base,
      logs: [ // balanced, recent, no gaps: nothing to flag
        log('2026-08-04', ['QA', 'VARC']), log('2026-08-03', ['DILR', 'VARC']),
        log('2026-08-02', ['QA', 'VARC']),
      ],
      coverage: [cov('Percentages', 'QA', 'practicing', '2026-08-03')],
    };
    const note = composeNote(s, TODAY);
    expect(note.observation).toBeNull();
    expect(note.text).toContain('steady days are how plans get won');
    expect(note.text).not.toContain('not noticing');
  });

  it('avoidance stays silent below the 5-day threshold', () => {
    const s = { ...base, logs: [log('2026-08-04', ['QA']), log('2026-08-02', ['VARC']), log('2026-08-01', ['QA'])] };
    expect(detectAvoidance(s, TODAY)).toBeNull(); // VARC touched 3 days ago — noise, not pattern
  });

  it('drift stays silent without a dominant section AND a starved core section', () => {
    const s = { ...base, logs: [
      log('2026-08-04', ['QA']), log('2026-08-03', ['VARC']), log('2026-08-02', ['DILR']),
      log('2026-08-01', ['QA']), log('2026-07-31', ['VARC']),
    ] };
    expect(detectDrift(s, TODAY)).toBeNull();
  });
});

describe('Law 9 — receipts travel with every claim', () => {
  it('avoidance ships dates and counts the student can verify', () => {
    const s: StudentSnapshot = { ...base, logs: [
      log('2026-08-04', ['QA']), log('2026-08-03', ['QA']), log('2026-08-02', ['DILR']),
      log('2026-08-01', ['QA']), log('2026-07-30', ['DILR']),
    ] };
    const o = detectAvoidance(s, TODAY);
    expect(o).not.toBeNull();
    expect(o!.receipts).toMatch(/\d+ study days/);
    const note = composeNote(s, TODAY);
    expect(note.text).toContain('('); // receipts rendered inline with the claim
  });

  it('drift receipts carry the exact day counts', () => {
    const o = detectDrift(driftStudent(), TODAY);
    expect(o).not.toBeNull();
    expect(o!.receipts).toMatch(/DILR: \d+\/\d+/);
  });
});

describe('Law 8 — pace is plan-denominated, never a percentile promise', () => {
  it('speaks of the PLAN being intact, not the percentile being likely', () => {
    const s: StudentSnapshot = {
      ...base,
      coverage: Array.from({ length: 10 }, (_, i) => cov(`T${i}`, 'QA', i < 4 ? 'practicing' : 'not_started', '2026-08-01')),
    };
    const line = paceLine(s);
    expect(line).toMatch(/plan/);
    expect(line).not.toMatch(/on track for \d+ percentile/i); // the banned sentence
  });
});

describe('Law 4 — Today\'s Win: at most two items, answering the observation', () => {
  it('caps the win at two items', () => {
    const s = driftStudent();
    s.coverage.push(cov('Triangles', 'QA', 'learning', '2026-08-01'));
    const note = composeNote(s, TODAY);
    expect(note.win.length).toBeLessThanOrEqual(2);
  });

  it('the win answers the avoidance observation — Law 5: today\'s action is tomorrow\'s evidence', () => {
    const s: StudentSnapshot = { ...base, logs: [
      log('2026-08-04', ['QA']), log('2026-08-03', ['QA']), log('2026-08-02', ['QA']),
      log('2026-08-01', ['QA']), log('2026-07-30', ['QA']),
    ] };
    const note = composeNote(s, TODAY);
    expect(note.observation?.kind).toBe('avoidance');
    expect(note.win[0]).toContain('VARC');
  });
});

describe('the note as a whole', () => {
  it('acknowledges the coaching by name and defers to it (the treaty)', () => {
    const note = composeNote(driftStudent(), TODAY);
    expect(note.text).toContain('TIME');
    expect(note.text).toContain("we're not changing that");
  });

  it('ends by telling the student to LEAVE', () => {
    const note = composeNote(driftStudent(), TODAY);
    expect(note.text).toContain('Go study');
    expect(note.text.trim().endsWith("we'll review tonight.")).toBe(true);
  });

  it('stays WhatsApp-sized — under 900 characters', () => {
    const note = composeNote(driftStudent(), TODAY);
    expect(note.text.length).toBeLessThan(900);
  });

  it('revision decay keeps the note alive on zero-input days', () => {
    const s: StudentSnapshot = {
      ...base,
      logs: [], // student has done NOTHING — the note must still have news
      coverage: [cov('Time & Work', 'QA', 'revising', '2026-07-20')],
    };
    const note = composeNote(s, TODAY);
    expect(note.observation?.kind).toBe('revision_gap');
    expect(note.text).toContain('Time & Work');
  });

  it('never opens with the negative even when the observation is brutal', () => {
    const s = driftStudent();
    const note = composeNote(s, TODAY);
    const firstContentLine = note.text.split('\n').filter(Boolean)[1]; // after greeting
    expect(firstContentLine.startsWith('✅') || firstContentLine.startsWith('🟢') || firstContentLine.startsWith('🟠') || firstContentLine.startsWith('🔴')).toBe(true);
    expect(firstContentLine).not.toContain('not noticing');
  });
});
