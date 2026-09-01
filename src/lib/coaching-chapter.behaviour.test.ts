import { describe, it, expect } from 'vitest';
import { resolveChapter, resolveTopic } from './coaching-vocab';
import { sanitizeBlocks } from './timetable';
import { QA_GROUPS } from './topics-constants';

/**
 * ── COACHINGS TEACH CHAPTERS; OUR TOPICS ARE LEAVES ─────────────────────────
 *
 * 1 Sep, from the founder's OCR screen: sheets reading "0/10 matched",
 * "1/7 matched", "1/3 matched".
 *
 * Every one of our 46 topics is a leaf — "Linear Equations", "Circles",
 * "Remainders". Coaching institutes schedule the chapter above them:
 * "Algebra", "Arithmetic", "Geometry", "Number System", "Modern Math". Not one
 * of those words existed in the taxonomy, as a topic or an alias.
 *
 * So the model read "Algebra - JP Sir 5:30-7:30" correctly, obeyed its
 * instruction never to invent a topic, and returned null — and we counted that
 * as a failure. Measured against real production labels: 0 of 14 genuine topic
 * rows resolved. We were penalising the model for doing as it was told.
 *
 * Every label in this file is REAL — taken from student_timetables in
 * production, newlines, teacher names, room codes and all.
 */

/** Verbatim from production. These name a chapter and must resolve. */
const REAL_CHAPTER_ROWS: [string, string][] = [
  ['Algebra\nRevision-JP Sir', 'Algebra'],
  ['Algebra14 Chirag(DL|4-7pm)', 'Algebra'],
  ['Geometry-1\nAnkit sir (5:30-7:30)', 'Geometry'],
  ['Arithmetic Workshop 3', 'Arithmetic'],
  ['Numbers Workshops', 'Number System'],
  ['Modern Maths', 'Modern Math'],
];

/** Also verbatim from production. None of these is a topic. */
const NOT_TOPICS = [
  'Break', 'BREAK', 'DINNER', 'LUNCH + FRESH', 'FRESH + BREAKFAST', 'GYM', 'CRICKET',
  'POWER NAP', 'PLANNING', 'EXTRA STUDY TIME', 'Independence Day Holiday',
  'Ravi Prakash Sir - 17:00', 'Apoorv Sir - 22:15', 'Swapnil Sir - 22:15',
  '(10:00-12:00)', 'LECTURE (1 DAILY)',
];

const block = (label: string) => ({
  day: 0, date: null, dayIndex: null, start: null, end: null,
  section: null, topic: null, label,
});
const resolved = (label: string) => {
  const b = sanitizeBlocks([block(label)])[0];
  return b?.topic ?? b?.chapter ?? null;
};

describe('a chapter a coaching names is read, not discarded', () => {
  it.each(REAL_CHAPTER_ROWS)('%s -> %s', (label, chapter) => {
    expect(resolveChapter(label)).toBe(chapter);
    expect(resolved(label)).toBe(chapter);
  });

  it('REGRESSION: every one of these resolved to nothing before', () => {
    // resolveTopic is unchanged and still declines them — correctly, because
    // none names a leaf. The chapter layer is what makes them readable, so if
    // someone removes it these all silently go back to null.
    for (const [label] of REAL_CHAPTER_ROWS) {
      expect(resolveTopic(label), `${label} should NOT resolve to a leaf topic`).toBeNull();
    }
  });
});

describe('a chapter is never mistaken for a topic', () => {
  it('a block carries a chapter OR a topic, never both', () => {
    // topic_coverage reads `topic` only. A block carrying both would let a
    // chapter leak into coverage through a future change that reads either.
    for (const label of [...REAL_CHAPTER_ROWS.map((r) => r[0]), 'TSD', 'Circles', 'RC']) {
      const b = sanitizeBlocks([block(label)])[0];
      if (!b) continue;
      expect(Boolean(b.topic) && Boolean(b.chapter), `${label} carries both`).toBe(false);
    }
  });

  it('a precise leaf topic always wins over its chapter', () => {
    // "Circles" is a Geometry unit. It must stay the unit, not degrade to the
    // chapter — precision is never traded for a broader match.
    const b = sanitizeBlocks([block('Circles')])[0];
    expect(b.topic).toBe('Circles');
    expect(b.chapter ?? null).toBeNull();
  });

  it.each([
    ['Algebra: Linear Equations', 'Linear Equations'],
    ['Arithmetic - Percentages', 'Percentages'],
    ['Geometry / Circles', 'Circles'],
  ])('%s keeps the leaf and carries NO chapter', (label, topic) => {
    // The case that actually distinguishes the rule, and the one the first
    // version of this file missed: a label naming BOTH. Mutation testing
    // caught it — removing the `topic ? null :` guard survived every
    // assertion, because no example resolved to a chapter AND a topic at once.
    // Coaching sheets write exactly this ("Arithmetic : Percentages" is
    // already an alias example in coaching-vocab), so the more precise value
    // must win and the block must not carry both.
    const b = sanitizeBlocks([block(label)])[0];
    expect(b.topic).toBe(topic);
    expect(b.chapter ?? null).toBeNull();
  });

  it('every chapter it can return is a real group from our own taxonomy', () => {
    // Not a second vocabulary. QA_GROUPS has grouped these exact units since
    // the Blueprint was built.
    const known = new Set(QA_GROUPS.map((g) => g.label));
    for (const [, chapter] of REAL_CHAPTER_ROWS) expect(known.has(chapter)).toBe(true);
  });
});

describe('breaks, meals and teacher names stay unmatched', () => {
  // The failure that would make this whole change worse than the bug: filing a
  // dinner break under Algebra. A null here is the correct, honest answer.
  it.each(NOT_TOPICS)('%s resolves to nothing', (label) => {
    expect(resolveChapter(label)).toBeNull();
    expect(resolved(label)).toBeNull();
  });

  it('a name that merely contains chapter letters does not match', () => {
    // Word-bounded, not substring: "Algebraic" alone is not the Algebra class,
    // and a room code or surname must never trigger one.
    expect(resolveChapter('Mr Algebraickar')).toBeNull();
    expect(resolveChapter('CRHO1002704')).toBeNull();
  });
});
