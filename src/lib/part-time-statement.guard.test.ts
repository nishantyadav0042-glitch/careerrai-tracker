import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PART_TIME_REQUIRED_FIELDS, checkEmploymentStatement } from './sales-rep-provisioning';

// ── The hire form and the server must want the same things ──────────────────
//
// A part-time seat may not be created without stating what part-time means for
// that person — hours, capacity, intake, and (since 28 Aug 2026) pay. The
// server is the authority and refuses the write. The form mirrors the list to
// save a round trip and to name the missing fields inline.
//
// A mirror that drifts is worse than no mirror: the founder fills the form,
// the client says it is complete, and the server rejects it with a list of
// fields the form never asked for. This pins them together.

const FORM = readFileSync('src/app/admin/sales/capacity/new-rep-form.tsx', 'utf8');
const CREATE_ROUTE = readFileSync('src/app/api/admin/create-sales-rep/route.ts', 'utf8');

describe('every required field is actually collected', () => {
  it.each([...PART_TIME_REQUIRED_FIELDS])('the form names %s in its gap list', (field) => {
    expect(FORM, `${field} is required by the server but the form never reports it missing`)
      .toContain(`'${field}'`);
  });

  it.each([...PART_TIME_REQUIRED_FIELDS])('the form SENDS %s to the server', (field) => {
    expect(FORM, `${field} is validated but never put on the request body`)
      .toMatch(new RegExp(`body\\.${field}\\s*=`));
  });

  it.each([...PART_TIME_REQUIRED_FIELDS])('the create route reads %s off the body', (field) => {
    expect(CREATE_ROUTE, `${field} is required but the route never reads it`).toContain(field);
  });
});

describe('pay is part of the statement, not an afterthought', () => {
  it('a part-time seat with hours but no pay is refused', () => {
    const hoursOnly = {
      employment_type: 'part_time',
      work_days: [1, 3], work_start_ist: '17:00', work_end_ist: '22:00',
      max_capacity_units: 40, max_new_per_day: 8,
    };
    const r = checkEmploymentStatement(hoursOnly, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.sort()).toEqual(['incentive_percent', 'monthly_fixed_paise']);
  });

  it('the form converts rupees to paise before sending', () => {
    // The input asks for ₹8,000; the column stores 800000. Sending rupees
    // would pay every counsellor one hundredth of what was agreed.
    expect(FORM).toMatch(/monthly_fixed_paise\s*=\s*Math\.round\(Number\([A-Za-z]+\)\s*\*\s*100\)/);
  });

  it('full-time seats are still creatable without any of it', () => {
    // The rule is about part-time, and the table defaults ARE the full-time
    // week. Blocking full-time here would be a new obstacle, not a check.
    expect(checkEmploymentStatement({ employment_type: 'full_time' }, null).ok).toBe(true);
  });
});
