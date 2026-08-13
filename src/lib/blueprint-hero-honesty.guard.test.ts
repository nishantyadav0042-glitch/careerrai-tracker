import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The S1 blueprint-reveal hero must never invent a statistic ─────────────
//
// The original mock's exact line was "Everything fits before CAT — with 4
// study days to spare." That number does not exist anywhere in the engine:
// projectSyllabusFinish (lib/study-plan.ts) returns a status and a real
// verdict sentence, never a day-count of slack. Computing "4 days to spare"
// for the rebuild would mean deriving a NEW statistic outside the one module
// that owns finish-date math — the exact "fourth planner" failure CODEMAP.md
// forbids, and a fresh way to invent a number this session spent all night
// refusing to do on every other surface.
//
// So the hero renders the engine's OWN verdict line (`finishProjection.sub`)
// instead — real for whatever the student's actual pace is, not a fixed
// flourish borrowed from a mock.

const ROUTE = 'src/app/api/blueprint/route.ts';
const SCREEN = 'src/app/student/onboarding/screens/screen-blueprint-reveal.tsx';

describe('every new number on the hero reuses an existing engine, none is invented', () => {
  it('daysToExam is derived from the SAME exam/today the route already computed', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain('const daysToExam = Math.max(0, Math.round((exam.getTime() - today.getTime())');
  });

  it('mock cadence comes from the shared exam-calendar authority, not new logic', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain("from '@/lib/exam-calendar'");
    expect(src).toContain('mocksForWeekOf(today, exam)');
  });

  it('the hero never fabricates a "days to spare" style claim', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).not.toContain('days to spare');
    expect(src).not.toContain('study days to spare');
  });

  it('the "everything fits" line is the finish-projection engine\'s own verdict', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain('data.finishProjection.sub');
    expect(src).not.toMatch(/const spareDays/);
  });

  it('the syllabus-done-by date is the real window label, never collapsed to a fake single date', () => {
    // Collapsing "20-25 October" to a single invented "22 Oct" would be false
    // precision — exactly what this session's other engines refuse to do.
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain('data.finishProjection.windowLabel');
  });
});

describe('onboarding threads a real name, never invents one', () => {
  it('firstName comes from the same derivation already used elsewhere in the modal', () => {
    const modal = readFileSync('src/app/student/onboarding/onboarding-modal.tsx', 'utf8');
    // Two call sites now share the identical extraction logic (documented as
    // "same derivation as hFirstName" in the added one) rather than drifting.
    const occurrences = (modal.match(/onboardingData\.full_name\.trim\(\)\.split\(' '\)\[0\]/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('renders a plain fallback when no name is known yet, never a placeholder guess', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain("'Your plan is ready.'");
  });
});
