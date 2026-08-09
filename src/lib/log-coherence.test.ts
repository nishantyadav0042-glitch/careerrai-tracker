import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The Abhishek incident (9 Aug): hours were optional in the log sheet, but the
// weekly finish-date engine (plan-extension.ts) prices the whole week on the
// logged hours. A student who marked "studied", picked his topics, and skipped
// the optional hours recorded a studied day worth 0h — and had his finish date
// pushed a week while showing up daily on a 12-day streak. Four students hit it.
//
// The fix: a "studied" day with topics can never be 0 hours. These guards keep
// that rule in source, on both the server (the integrity backstop) and the
// client (so nobody meets the backstop as a raw 400).

describe('a "studied" day can never be recorded as 0 hours', () => {
  it('the log API rejects studied + topics + 0 hours', () => {
    const route = readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8');
    expect(route).toContain("body.day_outcome === 'studied'");
    // The guard must key on hours === 0 with sections present.
    expect(route).toMatch(/body\.hours === 0[\s\S]{0,120}sections\.length > 0/);
  });

  it('the log sheet requires hours once the day shows a study signal', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('studyingSignal');
    expect(modal).toContain('hoursOk');
    // hoursOk must gate submit validity.
    expect(modal).toMatch(/isValid[\s\S]{0,200}hoursOk/);
  });

  it('the guard is scoped to studied+topics, so an honest empty day still passes', () => {
    // The reject requires BOTH day_outcome==='studied' AND sections.length>0, so
    // a terminal outcome (not_studied/skipped) or a 0h/no-topics day never trips
    // it — we never re-block the honest rest day.
    const route = readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8');
    // The one conditional that returns the "add your study hours" 400.
    const rejectLine = route.slice(route.indexOf("if (body.hours === 0 && body.day_outcome"), route.indexOf("if (body.hours === 0 && body.day_outcome") + 160);
    expect(rejectLine).toContain("body.hours === 0");
    expect(rejectLine).toContain("body.day_outcome === 'studied'");
    expect(rejectLine).toContain("sections.length > 0");
  });
});
