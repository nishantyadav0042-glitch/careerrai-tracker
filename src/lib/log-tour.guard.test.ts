import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The onboarding log tour: teach the real thing, write nothing, gate nothing ─
//
// Built 13 Aug after the day's cohort measured 19/19 onboarded → 4 logged.
// The journey now ends with the student practising the actual log gesture.
// Three properties hold it together, and each one has a specific way of
// rotting silently — hence a guard, not a convention.

const SCREEN = 'src/app/student/onboarding/screens/screen-log-tour.tsx';
const MODAL = 'src/app/student/onboarding/onboarding-modal.tsx';
const HOME_CARD = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

const screen = () => readFileSync(SCREEN, 'utf8');
const modal = () => readFileSync(MODAL, 'utf8');

describe('practice writes nothing', () => {
  // A student who has studied nothing must never start Day 0 with study data
  // on record. The learning machine runs on true logs; one fabricated
  // "finished it" at signup poisons the very first row of a student's
  // history and steals their real Day-1 moment ("already logged today").
  it('never calls the real completion endpoint', () => {
    expect(screen()).not.toContain('/api/routine/complete-task');
  });

  it('never touches daily_reports or any supabase table directly', () => {
    const s = screen();
    expect(s).not.toContain("daily_reports");
    expect(s).not.toContain('createClient');
    expect(s).not.toMatch(/\.from\(/);
  });

  it('says out loud that nothing is saved', () => {
    expect(screen()).toContain('nothing is saved');
  });

  it('copy stays English-only (founder, 13 Aug)', () => {
    // The first draft shipped in Hinglish; the founder's correction was
    // immediate and total. Pin a few of the removed phrases so the old
    // voice can't drift back in a later edit.
    const s = screen();
    for (const hinglish of ['yeh raha', 'kaam milenge', 'nahi hota', 'Seekh lo']) {
      expect(s).not.toContain(hinglish);
    }
  });
});

describe('it teaches the REAL gesture, not an invented one', () => {
  // A tutorial showing a different mechanic than Day 1 presents un-teaches
  // itself overnight. The tour must keep the same two-choice strip the Home
  // card uses — including the honest half-day option, which is the product's
  // whole answer to "a student forced to choose done-or-nothing picks
  // nothing."
  it('uses the same two progress choices as the Home card', () => {
    const s = screen();
    const home = readFileSync(HOME_CARD, 'utf8');
    for (const label of ['Got halfway', 'Finished it']) {
      expect(s).toContain(label);
      expect(home).toContain(label);
    }
  });

  it('half is a first-class state with its own visual, not a footnote', () => {
    const s = screen();
    expect(s).toContain("'half'");
    expect(s).toContain('bg-amber-500');
  });

  it('does not promise these are the student\'s actual Day-1 tasks', () => {
    // The real routine is generated fresh when Home first loads; the tour's
    // tasks are illustrative. Claiming otherwise is a promise the very next
    // screen breaks.
    expect(screen()).not.toMatch(/your (actual|real) Day.?1/i);
    expect(screen()).toContain('Practice');
  });
});

describe('it never gates completion', () => {
  // Incident #2: the last time anything stood between a student and
  // finishing, a cohort's logging died behind it. The skip path must always
  // exist and must fire the same completion as the earned path.
  it('has a skip that completes onboarding without any practice taps', () => {
    const s = screen();
    expect(s).toContain('Skip practice');
    // Both exits call the same finish() → onNext({ onboardingCompleted: true }).
    expect(s).toContain('onboardingCompleted: true');
    expect((s.match(/finish\((true|false)\)/g) ?? []).length).toBe(2);
  });
});

describe('placement and measurement', () => {
  it('is wired as the last screen, after the reveal', () => {
    const m = modal();
    const reveal = m.indexOf("key: 'blueprint-reveal'");
    const tour = m.indexOf("key: 'log-tour'");
    expect(reveal).toBeGreaterThan(-1);
    expect(tour).toBeGreaterThan(reveal);
    // Nothing after the tour in the screens array — it must own the final
    // save. The closing bracket of the array follows it before any new key.
    const afterTour = m.slice(tour);
    const nextKey = afterTour.indexOf('key:', 10);
    const arrayEnd = afterTour.indexOf('];');
    expect(nextKey === -1 || nextKey > arrayEnd).toBe(true);
  });

  it('was appended without shifting earlier screen indices (no draft bump needed)', () => {
    // The draftKey comment chain documents every reorder. Appending at the
    // end is index-stable, so v10 must still be the current version — if
    // someone later inserts a screen BEFORE the tour, they must bump, and
    // this assertion goes with that change.
    expect(modal()).toContain('cr_onboarding_draft_v10_');
  });

  it('reports the cohort event so the 19→4 gap becomes measurable', () => {
    expect(screen()).toContain("track('log_tour_done'");
    expect(readFileSync('src/lib/journey.ts', 'utf8')).toContain("'log_tour_done'");
  });
});
