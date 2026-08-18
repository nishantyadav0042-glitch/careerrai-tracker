import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeRequiredPace, studentEffortMultiplier } from './study-pace';

// ── P0-C-B/C — COMPLETION % MEANS ACTUAL COVERAGE, AND HAS ONE PRODUCER ─────
//
// Founder decisions, 18 Aug:
//
//   D2: "Completion % means ACTUAL DEMONSTRATED EXAM-SYLLABUS COVERAGE.
//        0 actual syllabus coverage = 0% completion. No effort multiplier may
//        manufacture completion."
//
//   D3: "If no legitimate current consumer requires the effort-scaled
//        percentage, remove it from the completion path rather than inventing
//        a replacement metric."
//
// THE DEFECT: study-pace.ts computed
//     completedPct = (totalHours − remainingHours) / totalHours
// with an UNSCALED 397h denominator while every caller passed an effort-SCALED
// numerator. A repeater at 0.55 effort with zero coverage therefore priced out
// at (397 − 218)/397 = 45% complete.
//
// AND THE CONSUMER AUDIT: it turned out nothing displayed that number. It is
// read in exactly one place (pace-card.tsx), rendered from exactly one place
// (tracker/page.tsx), and the tracker overrode it with the canonical
// topic-count percentage before render (founder decision, 23 Jul). So the
// effort-scaled figure was computed on every request, always discarded, and
// visible to nobody — which is precisely the case D3 describes.
//
// Removed rather than repaired. Keeping an hours-based completion percentage
// beside the canonical topic-count one would leave two producers of the same
// claim, which is the condition the Metric Constitution exists to forbid.

const studyPaceSrc = readFileSync(join(process.cwd(), 'src/lib/study-pace.ts'), 'utf8');
const paceCardSrc = readFileSync(join(process.cwd(), 'src/components/home/pace-card.tsx'), 'utf8');
const trackerSrc = readFileSync(join(process.cwd(), 'src/app/student/tracker/page.tsx'), 'utf8');

describe('the pace engine no longer produces a completion percentage', () => {
  it('declares no completedPct on its result', () => {
    // A pace calculator answers "how much per day from here". How much of the
    // syllabus is DONE is a coverage fact with its own authority.
    expect(studyPaceSrc).not.toMatch(/completedPct\s*[:?]/);
  });

  it('computes no percentage from the effort-scaled remaining hours', () => {
    const block = studyPaceSrc.slice(studyPaceSrc.indexOf('export function computeRequiredPace'));
    expect(block).not.toMatch(/\bMath\.round\([^)]*\/\s*totalHours[^)]*\)\s*\*\s*100/);
    expect(block).not.toMatch(/totalHours\s*-\s*remainingHours/);
  });

  it('still returns the pace numbers the callers actually use', () => {
    const pace = computeRequiredPace({
      remainingHours: 200,
      today: new Date('2026-08-18T00:00:00Z'),
      targetDate: new Date('2026-10-18T00:00:00Z'),
      committedPerDay: 4,
    });
    expect(pace.remainingHours).toBe(200);
    expect(pace.requiredPerDay).toBeGreaterThan(0);
    expect(pace.daysLeft).toBeGreaterThan(0);
    expect(['ahead', 'on_pace', 'behind', 'unrealistic', 'done']).toContain(pace.status);
  });
});

describe('effort scaling cannot manufacture completion', () => {
  it('a repeater and a first-timer differ in hours, never in a completion claim', () => {
    // The effort multiplier legitimately shrinks a repeater's remaining hours.
    // What it may never do is turn that discount into "you are 45% done".
    const firstTimer = studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null });
    const strongRepeater = studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 95 });
    expect(strongRepeater).toBeLessThan(firstTimer);

    const args = {
      today: new Date('2026-08-18T00:00:00Z'),
      targetDate: new Date('2026-11-29T00:00:00Z'),
      committedPerDay: 4,
    };
    const a = computeRequiredPace({ ...args, remainingHours: 397 * firstTimer });
    const b = computeRequiredPace({ ...args, remainingHours: 397 * strongRepeater });

    // Neither result carries a percentage at all — so no effort multiplier can
    // leak into one. Guarded structurally rather than numerically, because a
    // numeric check would pass again the moment someone re-added the field.
    expect(Object.keys(a)).not.toContain('completedPct');
    expect(Object.keys(b)).not.toContain('completedPct');
  });
});

describe('there is exactly one producer of the displayed completion %', () => {
  it('the ring takes the canonical percentage as its own input', () => {
    // pace-card must not reach into the pace object for a completion number —
    // it receives the coverage-derived one explicitly.
    expect(paceCardSrc).not.toMatch(/pace\.completedPct/);
    expect(paceCardSrc).toMatch(/completedPct\s*[:?]/); // its own prop
  });

  it('the tracker supplies it from the topic-count authority', () => {
    // completedByTopics = (46 − remaining) / 46, the definition My CAT Plan
    // uses, so the ring and the Blueprint can never disagree.
    expect(trackerSrc).toContain('completedByTopics');
    // …and no longer by spreading a pace object and patching the field after.
    expect(trackerSrc).not.toMatch(/completedPct:\s*completedByTopics/);
  });
});
