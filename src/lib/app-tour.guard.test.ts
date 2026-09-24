import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tourRunFor } from '@/components/app-tour';

// ── The app tour is a first-log guide, and it is measured ───────────────────
//
// Founder, 24 Sep: "build it now in our own tour, you decide." Measured that
// day: 72 installed students had opened the app in 14 days, cleared every
// onboarding gate, and never logged — most after already seeing this tour. The
// old tour pointed at the plan card, told them to "tap its circle" (the whole
// card has been the target since 16 Aug), and recorded nothing, so nobody
// could say whether it helped. These pin what replaced it.

const TOUR = () => readFileSync('src/components/app-tour.tsx', 'utf8');
const CARD = () => readFileSync('src/components/DailyTracker/TodaysRoutineCard.tsx', 'utf8');
const PAGE = () => readFileSync('src/app/student/tracker/page.tsx', 'utf8');
const JOURNEY = () => readFileSync('src/lib/journey.ts', 'utf8');

describe('who gets the tour', () => {
  it('a device that never had a tour gets the first run', () => {
    expect(tourRunFor({ hadTour: false, hadGuide: false, neverLogged: true })).toBe('first_run');
    expect(tourRunFor({ hadTour: false, hadGuide: false, neverLogged: false })).toBe('first_run');
  });

  it('a student who had the old tour and never logged gets it once more', () => {
    expect(tourRunFor({ hadTour: true, hadGuide: false, neverLogged: true })).toBe('never_logged');
  });

  it('never twice, and never for a student who logs', () => {
    expect(tourRunFor({ hadTour: true, hadGuide: true, neverLogged: true })).toBeNull();
    expect(tourRunFor({ hadTour: true, hadGuide: false, neverLogged: false })).toBeNull();
  });

  it('the page passes the real never-logged signal', () => {
    expect(PAGE()).toContain('<AppTour enabled={tourReady} neverLogged={(logs ?? []).length === 0} />');
  });

  it('finishing sets both keys, so the surfaces waiting on the first tour still fire', () => {
    // TOUR_KEY gates the first-log prompt, the insight cloud and the
    // notification ask. A tour that stopped setting it would silently switch
    // all three off for every new student.
    expect(TOUR()).toMatch(/localStorage\.setItem\(KEY, '1'\); localStorage\.setItem\(FIRST_LOG_GUIDE_KEY, '1'\)/);
  });
});

describe('it teaches the real gesture, on the real task', () => {
  it('ends on the first task, which the Home card marks for it', () => {
    const steps = TOUR().slice(TOUR().indexOf('const STEPS'), TOUR().indexOf('];', TOUR().indexOf('const STEPS')));
    const ids = [...steps.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(ids[ids.length - 1]).toBe('first-task');
    expect(steps).toContain(`sel: '[data-tour="first-task"]'`);
    // Only the hero (first open) task carries the marker.
    expect(CARD()).toContain(`data-tour={isStart ? 'first-task' : undefined}`);
  });

  it('names the two choices exactly as the card shows them, and no circle', () => {
    // The step copy only; a comment may quote the old wording to explain it.
    const t = TOUR().slice(TOUR().indexOf('const STEPS'), TOUR().indexOf('];', TOUR().indexOf('const STEPS')))
      .replace(/^\s*\/\/.*$/gm, '');
    for (const label of ['Finished it', 'Got halfway']) {
      expect(t).toContain(label);
      expect(CARD()).toContain(label);
    }
    expect(t).not.toMatch(/tap its circle/i);
  });

  it('describes the tips tab as it is now: one hint a day, no votes or questions', () => {
    const t = TOUR().replace(/^\s*\/\/.*$/gm, '');
    expect(t).toContain('Hint of the day');
    expect(t).not.toMatch(/Your vote decides/);
    expect(t).not.toMatch(/tip and questions/);
  });
});

describe('it opens by saying how the app works', () => {
  it('the first step has no spotlight and explains the day', () => {
    const t = TOUR();
    const steps = t.slice(t.indexOf('const STEPS'), t.indexOf('];', t.indexOf('const STEPS')));
    const ids = [...steps.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(ids[0]).toBe('how');
    expect(steps).toContain("{ id: 'how', sel: null, title: 'How CareerRai works'");
  });

  it('shows this student’s own plan size, read from the plan card', () => {
    expect(TOUR()).toContain(`getAttribute('data-plan-size')`);
    expect(TOUR()).toContain('` Today: ${planSize}.`');
  });
});

describe('it records itself', () => {
  it('fires started, step and finished, and each is a registered event', () => {
    const t = TOUR();
    for (const e of ['app_tour_started', 'app_tour_step', 'app_tour_finished']) {
      expect(t).toContain(`track('${e}'`);
      expect(JOURNEY()).toContain(`'${e}'`);
    }
  });

  it('Skip is recorded as not completed, with the step it ended on', () => {
    expect(TOUR()).toContain('onClick={() => finish(false, step.id)}');
  });
});

describe('it never stacks with another pop-up', () => {
  // The re-run reaches students whose TOUR_KEY is already set, so the other
  // first-run surfaces, which only asked tourDone(), would open on top of it.
  it('the tour flags itself while on screen and clears the flag when it ends', () => {
    const t = TOUR();
    expect(t).toContain('setTourVisible(true);');
    expect(t).toMatch(/track\('app_tour_finished'[^\n]*\n\s*setTourVisible\(false\);/);
    expect(t).toContain('useEffect(() => () => setTourVisible(false), []);');
  });

  it('the buddy nudge and the coverage review wait for it', () => {
    expect(readFileSync('src/components/daily-buddy-nudge.tsx', 'utf8'))
      .toContain("if (!tourDone() || tourVisible()) return blocked('tour_unfinished');");
    expect(readFileSync('src/components/coverage-review-gate.tsx', 'utf8'))
      .toContain('!tourDone() || tourVisible()');
  });
});
