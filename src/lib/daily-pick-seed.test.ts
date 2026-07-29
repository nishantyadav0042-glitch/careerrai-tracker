import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MAX_TIP_CHARS } from './community-pipeline';
import { RUNWAY_TARGET_DAYS } from './daily-pick';

// The founder's brief for this content was a set of hard constraints, not a
// vibe: "no basic questions or tips at all… no RC or longggg questions… one
// filter — students should feel this question is good I should solve this."
// Constraints that live only in a chat message get violated by the next batch,
// so they live here instead. Anyone adding stock has to clear the same bar.

interface SeedQuestion {
  section: string; topic: string; text: string;
  options: string[]; correct_index: number; explanation: string;
}
interface SeedTip { section: string; topic: string; text: string }

const seed = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/daily-pick-seed.json'), 'utf-8'),
) as { questions: SeedQuestion[]; tips: SeedTip[] };

const SECTIONS = ['QA', 'DILR', 'VARC'] as const;

// A Daily Pick question is read on a phone, in one screen, between study
// blocks. 420 characters is roughly that screen — anything longer is the
// "longggg question" the founder ruled out, and RC passages can't fit at all.
const MAX_QUESTION_CHARS = 420;

describe('curated Daily Pick seed', () => {
  it('carries a full month of stock for both kinds', () => {
    // The rotation burns one question and one tip per day (daily-pick-runner),
    // so a month of no-repeats needs RUNWAY_TARGET_DAYS of each.
    expect(seed.questions.length).toBeGreaterThanOrEqual(RUNWAY_TARGET_DAYS);
    expect(seed.tips.length).toBeGreaterThanOrEqual(RUNWAY_TARGET_DAYS);
  });

  it('covers all three sections evenly, for questions and tips alike', () => {
    // The ballot asks for one question PER SECTION every day. A pile of QA and
    // three VARC items would starve two of the three slots.
    for (const section of SECTIONS) {
      expect(seed.questions.filter((q) => q.section === section).length).toBeGreaterThanOrEqual(10);
      expect(seed.tips.filter((t) => t.section === section).length).toBeGreaterThanOrEqual(10);
    }
    const known = new Set<string>(SECTIONS);
    for (const item of [...seed.questions, ...seed.tips]) {
      expect(known.has(item.section), `unknown section ${item.section}`).toBe(true);
    }
  });

  it('gives every question exactly four distinct options and a real answer', () => {
    for (const q of seed.questions) {
      expect(q.options.length, q.text).toBe(4);
      expect(new Set(q.options).size, `duplicate option in: ${q.text}`).toBe(4);
      expect(q.correct_index).toBeGreaterThanOrEqual(0);
      expect(q.correct_index).toBeLessThan(4);
    }
  });

  it('names the trap in every explanation', () => {
    // The whole quality bar is that a wrong-but-plausible answer sits in the
    // options and the explanation says why it's wrong. A short explanation is
    // a drill; this surface is meant to teach in one read.
    for (const q of seed.questions) {
      expect(q.explanation.length, `thin explanation: ${q.text}`).toBeGreaterThan(90);
    }
  });

  it('keeps questions short enough to read on a phone, and excludes RC', () => {
    for (const q of seed.questions) {
      expect(q.text.length, `too long: ${q.text.slice(0, 60)}…`).toBeLessThanOrEqual(MAX_QUESTION_CHARS);
      // RC needs a passage plus questions about it — structurally impossible
      // on this surface, and explicitly ruled out.
      expect(q.topic).not.toBe('Reading Comprehension');
    }
  });

  it('keeps every tip inside the submission limit', () => {
    // Same ceiling the student-facing submit API enforces, so curated stock and
    // student stock render identically. One list, one limit.
    for (const t of seed.tips) {
      expect(t.text.length, `${t.text.length} chars: ${t.text}`).toBeLessThanOrEqual(MAX_TIP_CHARS);
    }
  });

  it('makes every tip an instruction, not an encouragement', () => {
    // "Practise more" is not a tip. A tip a student can act on today has a
    // concrete handle: a number, a named object, or an explicit first move.
    for (const t of seed.tips) {
      expect(t.text.length, `too vague to act on: ${t.text}`).toBeGreaterThan(60);
    }
  });

  it('has no duplicates', () => {
    const qTexts = seed.questions.map((q) => q.text);
    expect(new Set(qTexts).size).toBe(qTexts.length);
    const tTexts = seed.tips.map((t) => t.text);
    expect(new Set(tTexts).size).toBe(tTexts.length);
  });
});
