/**
 * ── WHAT STUDENTS TOLD THE SALES TEAM, AND WHAT MUST STAY FIXED ────────────
 *
 * 23 Sep 2026. Reading every Anshul and Neelam call remark surfaced three
 * product gaps students were hitting (docs: "App Issues Reported to Sales"):
 *
 *   1. A 2027 aspirant saw a CAT 2026 countdown. 190 July accounts have no
 *      attempt_year, every surface falls back to the current year, and there
 *      was no way for a student to change it.
 *   2. "Hard to customise, I want more focus on Quant": the section the plan
 *      leads with was asked once at signup and could never be changed.
 *   3. "Downloaded it, didn't know what to do next": nothing a rep could send.
 *
 * These are greps of the source; they say the fix is still wired, not that it
 * works in a browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

const root = join(__dirname, '..', '..');
const code = (p: string) => codeOnly(readFileSync(join(root, p), 'utf8'));

describe('the student can set their own CAT year and focus section', () => {
  const route = code('src/app/api/student/post-signup/route.ts');

  it('the year is validated against cycles the product can still honour', () => {
    expect(route).toContain('selectableCatCycles(new Date(), 3)');
    expect(route).toMatch(/!years\.includes\(body\.attempt_year\)/);
    expect(route).toMatch(/update\.attempt_year = body\.attempt_year/);
  });

  it('the focus section is one of three, and is recorded as a real choice', () => {
    expect(route).toMatch(/const FOCUS_SECTIONS = \['VARC', 'DILR', 'QA'\] as const/);
    expect(route).toMatch(/update\.self_reported_weakest_section = body\.weakest_section/);
    expect(route).toMatch(/update\.self_report_status = 'SELECTED_SECTION'/);
  });

  it('a route file exports only handlers (Next rejects stray exports)', () => {
    expect(route).not.toMatch(/export const FOCUS_SECTIONS/);
  });

  it('the hours still have exactly one writer', () => {
    expect(route).toContain('setDailyHours(body.daily_hours, \'student\')');
  });

  it('the mock still outranks the self-report in the focus chain', () => {
    const chain = code('src/lib/focus-sections.ts');
    const body = chain.slice(chain.indexOf('export function resolveFocusSections'));
    expect(body.indexOf('mock?.weakest')).toBeLessThan(body.indexOf('self_reported_weakest_section'));
  });
});

describe('Home shows which CAT it is counting down to, and lets them change it', () => {
  const card = code('src/components/home/pace-card.tsx');

  it('the collapsed card names the exam year', () => {
    expect(card).toContain('CAT {shownYear} · {pace.daysLeft} days to syllabus');
  });

  it('the edit sheet sends year and focus through the same save', () => {
    expect(card).toMatch(/if \(yearChanged\) payload\.attempt_year = yearChoice/);
    expect(card).toMatch(/if \(focusChanged\) payload\.weakest_section = focusChoice/);
  });

  it('the timetable upload is reachable from the edit sheet, never dismissible', () => {
    expect(card).toContain('<TimetableUpload onClose=');
    expect(card).toContain('data-analytics="plan_add_timetable"');
  });

  it('keeps the reschedule tap label the Day-2 observation reads', () => {
    expect(card).toContain('data-analytics="reschedule"');
  });

  it('the tracker passes the year and focus it already reads', () => {
    const page = code('src/app/student/tracker/page.tsx');
    expect(page).toMatch(/examYear=\{examYear\}/);
    expect(page).toMatch(/attemptYear=\{\(profile\?\.attempt_year/);
    expect(page).toMatch(/focusSection=\{\(weakestSectionRow\?\.self_reported_weakest_section/);
  });
});

describe('there is one page a rep can send for the first steps', () => {
  it('exists outside the login wall', () => {
    const page = code('src/app/how-it-works/page.tsx');
    expect(page).toContain('export default function HowItWorksPage');
    const proxy = code('src/proxy.ts');
    // Protected prefixes are /student, /buddy, /admin; /how-it-works is none.
    expect(proxy).toMatch(/pathname\.startsWith\('\/student'\)/);
    expect('/how-it-works'.startsWith('/student')).toBe(false);
  });

  it('is linked from the first-timer hint on the plan card', () => {
    expect(code('src/components/DailyTracker/TodaysRoutineCard.tsx')).toContain('href="/how-it-works"');
  });
});
