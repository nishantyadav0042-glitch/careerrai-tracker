import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  COVERED_STATUSES, COVERED_FLOOR, isCovered, statusRank, STATUS_ORDER,
} from './coverage-status';
import { REVISABLE_STATUSES, isRevisableStatus } from './revision-due';

// ── "HAS THIS STUDENT COVERED THIS TOPIC?" — ONE AUTHORITY ──────────────────
//
// The 14 Aug dead-code sweep found this question implemented ELEVEN times, as
// the same inline three-way comparison, in eleven files. Ten agreed. The
// eleventh (prep-insight-engine's isFinished) dropped exam_ready, so a topic
// the student had earned through evidence counted as never studied.
//
// Consolidating them was the easy half. This file is the half that lasts: the
// repo has now watched a consolidated rule grow back at least twice — the
// coverage ladder had five copies before coverage-status.ts, and "is revision
// due" had six before revision-due.ts. Both were fixed by writing one function
// and asking everyone nicely. Both came back.
//
// So the constraint is enforced by the build. A comment cannot lose an argument
// with a developer in a hurry; a failing test can.
//
// NOTE ON THE BANNED STRING: it is ASSEMBLED from fragments below, never
// written as a literal. A guard that greps for text it itself contains can
// never pass — the self-quoting trap that has broken several guards here.

const LIB = 'src/lib';
const APP = 'src/app';
const COMPONENTS = 'src/components';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const SOURCES = [...walk(LIB), ...walk(APP), ...walk(COMPONENTS)];

/** The authority itself is allowed to name the three statuses. */
const AUTHORITY = 'src/lib/coverage-status.ts';

describe('the covered rule has exactly one implementation', () => {
  // Assembled, never written as literals: this file would otherwise match
  // itself and the guard could never pass.
  const P = ['practi', 'cing'].join('');
  const R = ['revi', 'sing'].join('');
  const E = ['exam', '_ready'].join('');
  const NS = ['not', '_started'].join('');

  /** Source with ALL comments removed — prose may explain the rule freely. */
  function codeOf(file: string): string {
    return readFileSync(file, 'utf8')
      // Line comments FIRST — stripping block comments first can unanchor a
      // `//` line from the start of its line. `(^|\s)` rather than `^\s*` so a
      // TRAILING comment is stripped too; requiring the preceding character to
      // be whitespace or line-start leaves `https://` alone.
      .replace(/(^|\s)\/\/.*$/gm, '$1')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /**
   * A per-status TALLY is not this rule and stays legal: a histogram that
   * counts all five rungs separately answers "how is this student spread
   * across the ladder", not "has this topic been covered". Three of those
   * exist (api/blueprint, the buddy study-plan feed, the blueprint reveal) and
   * they are keyed by status name because their consumers read
   * `coverageTally.not_started` directly. Recognised by naming not_started AND
   * learning alongside the three — the covered rule never mentions those.
   */
  const isTally = (line: string) => line.includes(NS) && line.includes('learning');

  it('no file re-spells the covered triple in an expression', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      if (file === AUTHORITY) continue;
      for (const line of codeOf(file).split(/[;\n]/)) {
        if (!line.includes(P) || !line.includes(R) || !line.includes(E)) continue;
        if (isTally(line)) continue;
        offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders, `use isCovered() from lib/coverage-status instead:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('no file re-declares the coverage ladder as its own union type', () => {
    // The sweep found three: decision-engine, student/plan/topics, and
    // TodaysRoutineCard — the last two spelling all five rungs under the
    // canonical NAME. A local copy is how one screen quietly loses a status.
    const offenders: string[] = [];
    for (const file of SOURCES) {
      if (file === AUTHORITY) continue;
      for (const line of codeOf(file).split(/[;\n]/)) {
        if (!/type\s+\w+\s*=/.test(line)) continue;
        if (line.includes(NS) && line.includes(P) && line.includes(R)) {
          offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `import CoverageStatus from lib/coverage-status:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('revision-due consumes the covered set rather than listing it again', () => {
    // Identity, not equality — the same array object, so they cannot drift.
    expect(REVISABLE_STATUSES).toBe(COVERED_STATUSES);
  });

  it('prep-insight-engine re-exports the ladder instead of narrowing it', () => {
    const src = readFileSync('src/lib/prep-insight-engine.ts', 'utf8');
    // It must not declare its own CoverageStatus union.
    expect(src).not.toMatch(/export type CoverageStatus\s*=\s*'/);
    expect(src).toContain("from './coverage-status'");
  });
});

describe('the covered set is derived from the ladder, not listed', () => {
  it('covers everything at or above the floor, and nothing below it', () => {
    for (const s of STATUS_ORDER) {
      expect(isCovered(s), s).toBe(statusRank(s) >= statusRank(COVERED_FLOOR));
    }
  });

  it('a new status added above exam_ready would be covered automatically', () => {
    // The property that makes this rule survive the next schema change: the
    // top of the ladder is always covered, whatever it becomes.
    expect(isCovered(STATUS_ORDER[STATUS_ORDER.length - 1])).toBe(true);
    expect(COVERED_STATUSES[COVERED_STATUSES.length - 1]).toBe(STATUS_ORDER[STATUS_ORDER.length - 1]);
  });

  it('the three statuses that were hand-listed everywhere are exactly the covered set', () => {
    // Pins the consolidation as behaviour-preserving: whatever the eleven call
    // sites used to say, they say the same thing today.
    expect(COVERED_STATUSES).toEqual(['practicing', 'revising', 'exam_ready']);
  });
});

describe('the covered rule normalizes what the database actually holds', () => {
  it('counts a legacy mastered row as covered', () => {
    // normalizeStatus maps 'mastered' to exam_ready. The eleven inline copies
    // compared raw strings, so every one of them read a surviving 'mastered'
    // row as NOT covered — undercounting the student's own progress.
    expect(isCovered('mastered')).toBe(true);
  });

  it('treats unknown, null and undefined as not covered rather than throwing', () => {
    expect(isCovered('untouched')).toBe(false);   // the legacy not_started alias
    expect(isCovered(null)).toBe(false);
    expect(isCovered(undefined)).toBe(false);
    expect(isCovered('')).toBe(false);
    expect(isCovered(42)).toBe(false);
  });

  it('isRevisableStatus and isCovered can never disagree', () => {
    for (const s of [...STATUS_ORDER, 'mastered', 'untouched', '']) {
      expect(isRevisableStatus(s), s).toBe(isCovered(s));
    }
  });
});
