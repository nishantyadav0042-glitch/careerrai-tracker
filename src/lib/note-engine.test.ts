import { describe, it, expect } from 'vitest';
import {
  composeNote, composeInterrupt, detectAvoidance, detectDrift, detectEarned,
  isRecognitionDay, paceLine, TRUST_CLOSE, type StudentSnapshot,
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

// ─── v0.2: the Morning Interrupt (thesis v1.5 — influence, not interest) ────

describe('the interrupt leads with the decision, never the deficit', () => {
  it('the first content line IS the decision; the why comes after', () => {
    const s = driftStudent(); // avoidance-class: QA silent 6 days
    const n = composeInterrupt(s, TODAY);
    const lines = n.text.split('\n').filter(Boolean);
    expect(lines[1]).toBe('Today’s plan changes.');
    expect(n.text.indexOf('plan changes')).toBeLessThan(n.text.indexOf('Why:'));
  });

  it('the swap is explicit and symmetric: same minutes in and out', () => {
    const n = composeInterrupt(driftStudent(), TODAY);
    expect(n.decision.kind).toBe('swap');
    expect(n.text).toContain(`➕ ${n.decision.minutes} min → ${n.decision.add}`);
    expect(n.text).toContain(`➖ ${n.decision.minutes} min → ${n.decision.cut}`);
  });

  it('avoidance swap adds the weak section and cuts the dominant one', () => {
    const n = composeInterrupt(driftStudent(), TODAY);
    expect(n.reason.kind).toBe('avoidance');
    expect(n.decision.add).toContain('QA');
    expect(n.decision.cut).toBe('DILR');
  });

  it('the why still carries receipts inline (Law 9 survives the pivot)', () => {
    const n = composeInterrupt(driftStudent(), TODAY);
    expect(n.text).toMatch(/Why: .+\(.+\)/);
  });
});

describe('the trust close — the compliance instrument', () => {
  it('every interrupt ends with the exact four-option close', () => {
    const swap = composeInterrupt(driftStudent(), TODAY);
    const hold = composeInterrupt({ ...base, logs: [], coverage: [] }, TODAY);
    for (const n of [swap, hold]) {
      expect(n.text.trim().endsWith(TRUST_CLOSE)).toBe(true);
      expect(n.text).toContain('✅ Followed exactly');
      expect(n.text).toContain('🟡 Mostly');
      expect(n.text).toContain('🔄 Modified it');
      expect(n.text).toContain('❌ Ignored');
    }
  });
});

describe('recognition days — the surprising-positive quota', () => {
  it('lands near 30% of student-days, deterministically', () => {
    let hits = 0;
    const names = ['Aman', 'Ved', 'Harshil', 'Nishu', 'Saurav', 'Tanvi', 'Jyoti', 'Arnav', 'Harsh', 'Aadith'];
    for (const name of names) {
      for (let d = 1; d <= 30; d++) {
        if (isRecognitionDay(name, `2026-08-${String(d).padStart(2, '0')}`)) hits++;
      }
    }
    const share = hits / (names.length * 30);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.42);
  });

  it('a recognition day HOLDS the plan and cites the earned delta with receipts', () => {
    // Find a recognition date for a steady student with an earned delta.
    const s: StudentSnapshot = {
      ...base,
      logs: [log('2026-08-04', ['QA', 'VARC']), log('2026-08-03', ['DILR', 'VARC']), log('2026-08-02', ['QA', 'VARC'])],
      coverage: [cov('Percentages', 'QA', 'practicing', '2026-08-03')],
    };
    // Probe only days where the fixture stays below every threshold (past
    // 8 Aug the VARC silence legitimately crosses avoidance — and avoidance
    // SHOULD override recognition). Vary the name to find a quota hit.
    let day: string | null = null;
    for (const name of ['Aman', 'Ved', 'Harshil', 'Nishu', 'Saurav', 'Tanvi', 'Jyoti', 'Arnav']) {
      for (let d = 5; d <= 8; d++) {
        const t = `2026-08-0${d}`;
        if (isRecognitionDay(name, t)) { s.firstName = name; day = t; break; }
      }
      if (day) break;
    }
    expect(day).not.toBeNull();
    const n = composeInterrupt(s, day!);
    expect(n.recognition).toBe(true);
    expect(n.decision.kind).toBe('hold');
    expect(n.text).toContain('Today’s plan holds. Change nothing.');
    expect(n.text).toContain('✅');
    expect(n.text).toContain('('); // receipts still travel
  });

  it('a critical (avoidance-class) signal overrides the recognition quota', () => {
    const s = driftStudent(); // avoidance weight ≥ 90
    for (let d = 5; d <= 30; d++) {
      const t = `2026-08-${String(d).padStart(2, '0')}`;
      if (isRecognitionDay(s.firstName, t)) {
        const n = composeInterrupt(s, t);
        expect(n.decision.kind).toBe('swap'); // the burning signal ships anyway
        return;
      }
    }
    throw new Error('no recognition day found in range');
  });

  it('a student with nothing crossed gets a hold, not a fabricated swap', () => {
    const s: StudentSnapshot = { ...base, logs: [], coverage: [] };
    const n = composeInterrupt(s, TODAY);
    expect(n.decision.kind).toBe('hold');
    expect(n.recognition).toBe(true);
  });
});

describe('the interrupt as a whole', () => {
  it('reads in 30 seconds — under 600 characters', () => {
    expect(composeInterrupt(driftStudent(), TODAY).text.length).toBeLessThan(600);
    expect(composeInterrupt({ ...base, logs: [], coverage: [] }, TODAY).text.length).toBeLessThan(600);
  });

  it('uses the coaching as leverage, not as a rival', () => {
    const n = composeInterrupt(driftStudent(), TODAY);
    expect(n.text).toContain('TIME');
    expect(n.text).toMatch(/batch pace/);
  });

  it('is deterministic — same snapshot, same date, same note', () => {
    expect(composeInterrupt(driftStudent(), TODAY).text).toBe(composeInterrupt(driftStudent(), TODAY).text);
  });
});
