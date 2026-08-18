import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isExamSyllabusTopic, EXAM_SYLLABUS_TOPICS,
  MOCK_PREP_UNITS, READING_HABIT_UNITS, KNOWLEDGE_GRAPH,
} from './topics-constants';

// ── 0C.1 — THE EXAM SYLLABUS IS 46 UNITS, AND NOTHING ELSE ──────────────────
//
// Founder ruling D1 (18 Aug), locked:
//
//   "Do NOT count MOCKS or READING/habit-support activities inside syllabus
//    coverage. The canonical exam syllabus is 46 units: QA 28 + VARC 9 +
//    DILR 9. 46 is the denominator for syllabus coverage."
//
// and ruling 9:
//
//   "A ratio >100% under the canonical syllabus definition is an INVALID FACT,
//    not a value to clamp to 100%. The producer must fail closed."
//
// THE DEFECT THIS PINS, verified in production 18 Aug:
// prep-memory-data.ts computed `studentState.knowledge` as
//     |{rows where status != 'not_started'}| / |TOPIC_METADATA|
// where the numerator ranged over ALL 53 topic_coverage rows (46 syllabus + 7
// habit-track units: Sectional Tests, Full Length Mocks, Mock Analysis, Error
// Log, Daily Editorials, Business & Economy Reading, Long-form Reading) and the
// denominator was 46. Live query that day: 4 students exceeded 100%, maximum
// 111%.
//
// It was never a naming ambiguity. signal-engine.ts:100 declares the intent in
// the type itself — "% of the 46 exam topics past not_started" — so the
// producer simply contradicted its own contract.
//
// The fix is NOT Math.min(100, x). A clamp is presentation logic; this is a
// data-integrity fault, and clamping would have hidden the contamination while
// leaving 53-basis numerators flowing into a 46-basis world. The fix is to give
// the syllabus authority an explicit membership test and make the numerator
// range over the same set as the denominator.

describe('the syllabus authority knows its own boundary', () => {
  it('counts exactly 46 exam units', () => {
    expect(EXAM_SYLLABUS_TOPICS.length).toBe(46);
  });

  it('admits real exam topics', () => {
    for (const t of ['Percentages', 'Reading Comprehension', 'Arrangements']) {
      expect(isExamSyllabusTopic(t), `${t} must be an exam unit`).toBe(true);
    }
  });

  it('excludes every mock-prep and reading-habit unit', () => {
    for (const unit of [...MOCK_PREP_UNITS, ...READING_HABIT_UNITS]) {
      expect(isExamSyllabusTopic(unit), `${unit} is preparation activity, not a syllabus unit`).toBe(false);
    }
  });

  it('excludes unknown strings rather than admitting them by default', () => {
    // Fail closed: a topic name the authority does not recognise is NOT
    // syllabus. Admitting unknowns is how a 47th unit sneaks into a
    // 46-denominator ratio.
    expect(isExamSyllabusTopic('Some Future Habit Track')).toBe(false);
    expect(isExamSyllabusTopic('')).toBe(false);
  });

  it('is derived from the graph, never a second hardcoded list', () => {
    // Same law as coverage-status.ts's ladder predicates: derive, never
    // re-spell. A unit added to KNOWLEDGE_GRAPH's exam sections must appear
    // here automatically.
    const fromGraph = KNOWLEDGE_GRAPH
      .filter((s) => ['VARC', 'DILR', 'QA'].includes(s.id))
      .flatMap((s) => s.groups.flatMap((g) => g.units));
    expect([...EXAM_SYLLABUS_TOPICS].sort()).toEqual([...fromGraph].sort());
  });
});

describe('the >100% defect cannot recur', () => {
  // The exact production shape: every one of a student's 53 coverage rows is
  // past not_started. Under the old code this produced round(53/46*100) = 115.
  const allRows = [
    ...EXAM_SYLLABUS_TOPICS.map((topic) => ({ topic, status: 'learning' })),
    ...MOCK_PREP_UNITS.map((topic) => ({ topic, status: 'learning' })),
    ...READING_HABIT_UNITS.map((topic) => ({ topic, status: 'learning' })),
  ];

  it('has a numerator that ranges over the same set as the denominator', () => {
    const numerator = new Set(
      allRows.filter((r) => r.status !== 'not_started' && isExamSyllabusTopic(r.topic)).map((r) => r.topic)
    ).size;
    expect(numerator).toBe(EXAM_SYLLABUS_TOPICS.length);
    expect(Math.round((numerator / EXAM_SYLLABUS_TOPICS.length) * 100)).toBe(100);
  });

  it('cannot exceed 100 for any mixture of rows', () => {
    for (const slice of [allRows, allRows.slice(0, 30), allRows.slice(46), []]) {
      const n = new Set(
        slice.filter((r) => r.status !== 'not_started' && isExamSyllabusTopic(r.topic)).map((r) => r.topic)
      ).size;
      expect(Math.round((n / EXAM_SYLLABUS_TOPICS.length) * 100)).toBeLessThanOrEqual(100);
    }
  });

  it('the producer filters the numerator by syllabus membership', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/prep-memory-data.ts'), 'utf8');
    const block = src.slice(src.indexOf('inMotionTopics'), src.indexOf('const totalTopics'));
    expect(block, 'the knowledge numerator must be filtered to exam syllabus units').toContain('isExamSyllabusTopic');
  });

  it('is fixed by filtering, never by clamping', () => {
    // Ruling 9: a clamp would hide the contamination rather than remove it.
    const src = readFileSync(join(process.cwd(), 'src/lib/prep-memory-data.ts'), 'utf8');
    const block = src.slice(src.indexOf('const studentState'), src.indexOf('momentum:'));
    expect(block).not.toMatch(/Math\.min\(\s*100/);
  });
});

describe('0C.1 — the database may not hold a competing day definition', () => {
  it('no migration leaves an IST-offset date default in place', () => {
    // Founder ruling 7/8: 05:30 IST is the application boundary; the 03:00 IST
    // database default was a VERIFIED production defect and must not remain as
    // a competing definition — and must not be repaired by swapping in another
    // magic constant.
    //
    // Both writers (api/evidence, api/challenge/attempt) already pass
    // logged_for explicitly from getLogDateString(), and the column is NOT
    // NULL, so the default only ever fired for direct inserts. A default that
    // guesses a date is the database-level equivalent of a clamp: it invents a
    // value rather than failing closed. So the last word on this column must
    // DROP the default, not re-set it.
    const dir = join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    let lastVerdict: { file: string; drops: boolean } | null = null;
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8').toLowerCase();
      if (!sql.includes('logged_for')) continue;
      if (/alter\s+column\s+logged_for\s+drop\s+default/.test(sql)) lastVerdict = { file: f, drops: true };
      else if (/alter\s+column\s+logged_for[\s\S]{0,40}set\s+default/.test(sql)) lastVerdict = { file: f, drops: false };
    }

    expect(lastVerdict, 'expected a migration governing topic_evidence.logged_for').not.toBeNull();
    expect(
      lastVerdict!.drops,
      `${lastVerdict!.file} leaves a date default on logged_for — the app is the only authority on the CareerRai day`
    ).toBe(true);
  });
});
