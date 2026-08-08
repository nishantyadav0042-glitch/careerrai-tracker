import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIX_PROMISES } from '@/components/six-promises';
import {
  buildValueProof, shouldShowValueProof, hoursGivenBack, VALUE_PROOF_INTERVAL_DAYS,
} from './value-proof';

const base = {
  plansBuilt: 14, topicsRemembered: 46, revisionsFlagged: 5, remindersSent: 9,
  daysLogged: 8, daysSinceSignup: 16, rotation: 0,
};

// Founder, 8 Aug: tell them what we do for them, free, at first open AND every
// two or three days — retention needs telling. These tests hold the line that
// "telling" means COUNTING, not sloganeering: a claim a student cannot check
// against their own memory is the one they learn to scroll past.

describe('the repeat is proof, not an advertisement', () => {
  it('leads with a number from their own data', () => {
    const v = buildValueProof(base);
    expect(v.kind).toBe('proof');
    expect(v.headline).toContain('14');
    expect(v.body).toContain('14 mornings');
  });

  it('rotates proof, proof, promise so the same line is never shown twice running', () => {
    const kinds = [0, 1, 2, 3].map((rotation) => buildValueProof({ ...base, rotation }).kind);
    expect(kinds).toEqual(['proof', 'proof', 'promise', 'proof']);
  });

  it('a negative rotation still lands in range', () => {
    expect(() => buildValueProof({ ...base, rotation: -1 })).not.toThrow();
    expect(['proof', 'promise']).toContain(buildValueProof({ ...base, rotation: -1 }).kind);
  });

  it('always asks for the same one thing', () => {
    for (const rotation of [0, 1, 2]) {
      const v = buildValueProof({ ...base, rotation });
      expect(v.ask).toContain('You do one thing. Study.');
      expect(v.ask).toContain('free');
    }
  });
});

describe('it never counts to zero, and never flatters', () => {
  it('a brand-new account gets the promise, not "0 plans built"', () => {
    const v = buildValueProof({
      ...base, plansBuilt: 0, topicsRemembered: 0, revisionsFlagged: 0,
      remindersSent: 0, daysSinceSignup: 0,
    });
    expect(v.kind).toBe('promise');
    expect(v.body).not.toContain('0');
    expect(v.headline).toContain('Six things');
  });

  it('day one gets the promise even when a plan already exists', () => {
    // A plan is generated on first open. Telling someone on day one that we
    // saved them an hour would be a claim they can immediately disprove.
    const v = buildValueProof({ ...base, daysSinceSignup: 1, plansBuilt: 1 });
    expect(v.kind).toBe('promise');
  });

  it('rounds the hours claim DOWN, and drops it entirely below an hour', () => {
    expect(hoursGivenBack(14)).toBe(14);
    expect(hoursGivenBack(0)).toBe(0);
    const one = buildValueProof({ ...base, plansBuilt: 1, rotation: 0 });
    expect(one.body).toContain('1 morning');
  });

  it('names only what actually happened', () => {
    // No reminders sent -> the line must not claim reminders.
    const v = buildValueProof({ ...base, rotation: 1, remindersSent: 0, revisionsFlagged: 0 });
    expect(v.body).not.toMatch(/reminders sent/);
    expect(v.body).toContain('46 topics tracked');
  });

  it('falls back to a true statement when there is nothing to list', () => {
    const v = buildValueProof({
      ...base, rotation: 1, topicsRemembered: 0, revisionsFlagged: 0, remindersSent: 0,
      plansBuilt: 3,
    });
    expect(v.body).toContain('tracked');
  });
});

describe('one list of six worries, everywhere', () => {
  it('is six short lines in a student\'s own vocabulary', () => {
    // Two founder corrections live here. First: name the WORRY, not the
    // feature — "we make your plan" reads as another planner. Second: say it
    // the way a coaching class says it, and say it short. "Don't worry about"
    // on all six rows is what made the screen long, so it is said once in the
    // heading and the rows are nouns.
    expect(SIX_PROMISES).toHaveLength(6);
    for (const p of SIX_PROMISES) {
      expect(p.head.split(' ').length, `"${p.head}" is too long for a glance`).toBeLessThanOrEqual(5);
      expect(p.sub.split(' ').length, `"${p.sub}" is too long for a glance`).toBeLessThanOrEqual(8);
      expect(p.head.startsWith("Don't worry"), 'the heading says it once, rows do not repeat it').toBe(false);
    }
    // The words students actually use in class, not our product language.
    const all = SIX_PROMISES.map((p) => `${p.head} ${p.sub}`).join(' ').toLowerCase();
    for (const word of ['backlog', 'revision', 'mock', 'syllabus', 'off day']) {
      expect(all, `"${word}" is missing — that is the word they say`).toContain(word);
    }
  });

  it('the landing page and the AI caller carry the same six', () => {
    // Three surfaces stated the pitch in three different ways, and the landing
    // page argued against it outright: "CAT prep, tracked" tells a stranger
    // there is MORE work for them, and leads with the one paid thing.
    // Checked by VOCABULARY rather than by exact sentence: the landing page
    // says it in six words and Riya says it in a spoken line, so pinning a
    // phrase would force one surface to talk like the other. What must not
    // drift is which six worries each of them names.
    const welcome = readFileSync('src/app/welcome/page.tsx', 'utf8');
    const riya = readFileSync('docs/EXPEDIFY-RIYA-PROMPT.txt', 'utf8');
    for (const surface of [welcome, riya]) {
      expect(surface).toMatch(/revis/i);       // revision
      expect(surface).toMatch(/mock/i);        // mocks
      expect(surface).toMatch(/syllabus/i);    // finishing in time
      expect(surface).toMatch(/off day|bad day/i);
    }
    expect(welcome).not.toContain('CAT prep, tracked');
  });

  it('free is never claimed without the mentor boundary nearby', () => {
    // Say "free" loosely, let them meet the mentor price later, and every other
    // true thing we said stops being believed.
    const riya = readFileSync('docs/EXPEDIFY-RIYA-PROMPT.txt', 'utf8');
    expect(riya).toMatch(/MENTOR IS THE ONLY PAID THING/);
  });
});

describe('cadence: every third day, not every open', () => {
  it('shows on a first ever visit', () => {
    expect(shouldShowValueProof(null, '2026-08-08')).toBe(true);
  });

  it('does not show again the same day, or the next', () => {
    expect(shouldShowValueProof('2026-08-08', '2026-08-08')).toBe(false);
    expect(shouldShowValueProof('2026-08-08', '2026-08-09')).toBe(false);
    expect(shouldShowValueProof('2026-08-08', '2026-08-10')).toBe(false);
  });

  it('shows again on the third day', () => {
    expect(shouldShowValueProof('2026-08-08', '2026-08-11')).toBe(true);
    expect(VALUE_PROOF_INTERVAL_DAYS).toBe(3);
  });

  it('a student back after a week sees it once, not the three they missed', () => {
    // Cadence, not a queue. Nobody returns to a backlog of advertisements.
    expect(shouldShowValueProof('2026-08-01', '2026-08-20')).toBe(true);
  });
});
