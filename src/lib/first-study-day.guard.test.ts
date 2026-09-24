import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { firstDayOver, FIRST_HOME_DAY_KEY, TOUR_KEY } from './first-run-events';

// ── The first study day (24 Sep) ────────────────────────────────────────────
//
// Founder, 24 Sep: "Don't teach students how to use CareerRai. Give them a
// reason to use CareerRai, show them today's job, and let the first job teach
// them the product." The audit found the product explained five times in the
// first session: six promises, a log practice on fake tasks that ended
// "nothing is saved", sample insights, a four-step spotlight tour, and the
// value-proof card on day 0–1. Now it is said once, after signup, and Home
// carries one line. These pin that it stays that way.

// A Map-backed localStorage for the node test environment.
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
  return store;
}

// IST = UTC+5:30. The study day rolls over at 05:30 IST (00:00 UTC).
const ist = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000);

describe('day one is the plan and nothing else', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installStorage(); });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('the first ask records today and answers no, all day', () => {
    expect(firstDayOver(ist(2026, 9, 24, 10))).toBe(false);
    expect(store.get(FIRST_HOME_DAY_KEY)).toBe('2026-09-24');
    expect(firstDayOver(ist(2026, 9, 24, 23))).toBe(false);
    // 02:00 IST still belongs to the 24th's study day.
    expect(firstDayOver(ist(2026, 9, 25, 2))).toBe(false);
  });

  it('the next study day answers yes', () => {
    firstDayOver(ist(2026, 9, 24, 10));
    expect(firstDayOver(ist(2026, 9, 25, 5, 31))).toBe(true);
  });

  it('a device that finished the old tour already had its first day', () => {
    store.set(TOUR_KEY, '1');
    expect(firstDayOver(ist(2026, 9, 24, 10))).toBe(true);
    expect(store.has(FIRST_HOME_DAY_KEY)).toBe(false);
  });

  it('blocked storage answers no, so nothing extra opens on an unknown day', () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(firstDayOver(ist(2026, 9, 25, 10))).toBe(false);
  });

  it('every surface that waited for the tour now waits for this', () => {
    const gates: [string, string][] = [
      ['src/components/daily-buddy-nudge.tsx', "if (!firstDayOver()) return blocked('first_day');"],
      ['src/components/coverage-review-gate.tsx', '!firstDayOver()'],
      ['src/components/check-in-gate.tsx', '!firstDayOver()'],
      ['src/components/insight-cloud.tsx', 'if (firstDayOver())'],
    ];
    for (const [file, gate] of gates) expect(readFileSync(file, 'utf8'), file).toContain(gate);
  });
});

describe('the product is explained once', () => {
  const SEQUENCE = readFileSync('src/components/post-signup-sequence.tsx', 'utf8');

  it('after signup: one screen, then WhatsApp, then Home', () => {
    expect(SEQUENCE).toContain('<WhatCareerRaiIs onNext=');
    expect(SEQUENCE).toContain("onDone={() => finishCommitment()}");
    expect(SEQUENCE).not.toMatch(/SixPromises|ScreenLogTour/);
  });

  it('the log practice, its sample insights and the app tour are gone', () => {
    expect(existsSync('src/app/student/onboarding/screens/screen-log-tour.tsx')).toBe(false);
    expect(existsSync('src/components/app-tour.tsx')).toBe(false);
    expect(readFileSync('src/app/student/tracker/page.tsx', 'utf8')).not.toMatch(/<AppTour\b/);
    expect(readFileSync('src/lib/first-run-events.ts', 'utf8')).not.toContain('TOUR_DONE_EVENT');
  });

  it('the profile-edit modal survives a draft saved on the removed screen', () => {
    const modal = readFileSync('src/app/student/onboarding/onboarding-modal.tsx', 'utf8');
    expect(modal).toContain('const screenIndex = Math.min(currentScreen, screens.length - 1);');
    expect(modal).toContain('const currentScreenMeta = screens[screenIndex];');
    expect(modal).not.toContain('screens[currentScreen]');
  });

  it('the lesson-link announcement reaches only students for whom it is news', () => {
    const layout = readFileSync('src/app/student/layout.tsx', 'utf8');
    expect(layout).toContain('studyDayString(new Date(profile.created_at as string)) < RESOURCE_ANNOUNCE_DAY');
    expect(layout).toMatch(/!onboardedTodayIst && joinedBeforeLessonLinks;/);
  });
});
