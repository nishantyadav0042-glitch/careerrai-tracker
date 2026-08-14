import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── THE SERVER OWNS THE MOCK'S DATE ─────────────────────────────────────────
//
// Founder, 14 Aug: "after filling the log, the mock date."
//
// Why this is a study-plan gate and not a logging detail: `taken_on` is what
// mockInformedFocus reads to decide which SECTION the whole plan attacks, and
// `log_date` is what the tracker matches against today to claim "score
// recorded". A wrong date here does not produce a wrong row — it produces a
// wrong plan, every day, until another mock overwrites it.
//
// The route used to take that date straight from the browser after checking
// only that it LOOKED like a date. The browser reads it off the device clock.

const ROUTE = 'src/app/api/logging/mock-debrief/route.ts';

describe('the date the plan trusts is derived, never accepted', () => {
  const src = () => readFileSync(ROUTE, 'utf8');

  it('writes a server-derived date into both date columns', () => {
    const s = src();
    expect(s).toContain('taken_on: takenOn');
    expect(s).toContain('log_date: takenOn');
    // The client value must not reach the row under any name.
    expect(s).not.toContain('taken_on: body.log_date');
    expect(s).not.toContain('log_date: body.log_date');
  });

  it('derives it from the student\'s own daily log', () => {
    // "After filling the log, the mock date" — the log is the anchor, so the
    // route reads daily_reports rather than believing the request.
    const s = src();
    expect(s).toContain("from('daily_reports')");
    expect(s).toContain('loggedDays');
  });

  it('bounds the candidates to two server-known days', () => {
    // today and yesterday, both computed here from the study-day authority.
    const s = src();
    expect(s).toContain('const todayStr = getLogDateString();');
    expect(s).toContain('yesterdayStr');
    expect(s).toContain("in('report_date', [todayStr, yesterdayStr])");
  });

  it('treats a client date as a preference between those days, never a source', () => {
    // A student who logged both yesterday and today may say which one the mock
    // belongs to. They cannot name a third day, and an unrecognised value is
    // ignored rather than trusted.
    const s = src();
    expect(s).toMatch(/asked && loggedDays\.includes\(asked\)/);
    expect(s).toContain('?? todayStr;');
  });

  it('compares against the previous mock using the derived date too', () => {
    // The percentile delta ("rose 88→92") is shown to the student. Ordering it
    // by a client-supplied date would let a wrong clock invent an improvement.
    const s = src();
    expect(s).toContain("lt('taken_on', takenOn)");
    expect(s).not.toContain("lt('taken_on', body.log_date)");
  });
});

describe('the cases a wrong clock would have produced', () => {
  // Documented as behaviour, since the route is server-only and not directly
  // unit-testable here. Each maps to a line asserted above.
  const CASES: [string, string][] = [
    ['a future date', 'not in [today, yesterday] -> ignored, falls back to the newest log'],
    ['a 30-day-old date', 'not in [today, yesterday] -> ignored'],
    ['a malformed date', 'fails the shape check -> asked is null'],
    ['a null date', 'asked is null -> newest log, else today'],
    ['a timezone-shifted date', 'only lands if it is genuinely a day they logged'],
    ['no client date at all', 'newest log, else the server study day'],
  ];

  it('every one of them resolves to a day the server already knew about', () => {
    const s = readFileSync(ROUTE, 'utf8');
    // The whole resolution is these three sources and nothing else.
    const resolution = s.slice(s.indexOf('const takenOn ='), s.indexOf('const row = {'));
    expect(resolution).toContain('loggedDays[0]');
    expect(resolution).toContain('todayStr');
    expect(resolution).not.toMatch(/body\./);
    expect(CASES).toHaveLength(6);
  });
});
