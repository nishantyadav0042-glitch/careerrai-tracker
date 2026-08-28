import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ── THE SCREENS, RENDERED ───────────────────────────────────────────────────
//
// The commit that built these pages typechecked and built and was NOT clicked
// through. This file is the repo's own answer to that gap, and the reason it
// exists is written on capacity-panel.render.test.tsx: a page once shipped
// that crashed for any student with a mock debrief, while 3,124 tests passed,
// because nothing ever RENDERED it. "Tests pass" is evidence about logic, not
// about screens.
//
// Every assertion below is secondary to the render itself not throwing. What
// the assertions add is the question a build cannot answer: does the number on
// the screen equal the number in the rows underneath it?
//
// SCOPE, STATED HONESTLY: this renders real page components against a
// controlled database. It is not a browser, and it does not exercise auth
// redirects, Next's streaming, or CSS. It proves UI == calculation == rows.

/* eslint-disable @typescript-eslint/no-explicit-any */

let currentAdmin: any;
let currentUser: { id: string } = { id: 'anshul' };

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));
vi.mock('@/lib/admin-auth', () => ({
  requireSales: async () => ({ user: currentUser, admin: currentAdmin, role: 'sales' }),
  requireAdmin: async () => ({ user: currentUser, admin: currentAdmin, role: 'admin' }),
}));
vi.mock('@/components/admin/workspace-shell', () => ({
  WorkspaceShell: ({ children, title }: any) => <div data-shell={title}>{children}</div>,
}));

import SalesEarningsPage from './earnings/page';
import SalesFollowupsPage from './followups/page';
import PayrollPage from '@/app/admin/sales/payroll/page';

/**
 * A query recorder that answers per (table, terminal-op) and remembers the
 * filters it was given, so a test can assert WHAT WAS ASKED as well as what
 * was shown — the rep-scoping assertions below depend on it.
 */
function makeAdmin(rows: Record<string, unknown>) {
  const asked: { table: string; filters: [string, unknown][] }[] = [];
  const chain = (table: string) => {
    const filters: [string, unknown][] = [];
    const c: any = {};
    for (const m of ['select', 'order', 'limit', 'is', 'not', 'lt', 'gte', 'lte']) c[m] = () => c;
    for (const m of ['eq', 'in']) c[m] = (k: string, v: unknown) => { filters.push([k, v]); return c; };
    for (const m of ['insert', 'update', 'upsert', 'delete']) c[m] = () => c;

    const resolve = () => {
      const v = rows[table];
      // A per-table answer may be a function of the filters, because several
      // pages query one table for two different things (profiles = the staff
      // list AND the students named on a payslip) and a single array would
      // silently answer both.
      return typeof v === 'function' ? (v as (f: [string, unknown][]) => unknown)(filters) : v;
    };

    // maybeSingle/single return a ROW, not an array. Modelling that wrongly
    // made readTerms() see no terms at all, which turned the "UNKNOWN terms"
    // test green for entirely the wrong reason — the exact fake-green this
    // suite exists to prevent.
    const settle = (single: boolean) => (ok: any) => {
      asked.push({ table, filters });
      const v = resolve();
      if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } }).then(ok);
      const data = single ? (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) : (v ?? []);
      return Promise.resolve({ data, error: null }).then(ok);
    };
    c.maybeSingle = () => ({ then: settle(true) });
    c.single = () => ({ then: settle(true) });
    c.then = settle(false);
    return c;
  };
  return { from: (t: string) => chain(t), asked };
}

/** profiles answers the STAFF query and the STUDENT-NAMES query differently. */
const profilesFor = (staff: unknown[], students: unknown[]) =>
  (filters: [string, unknown][]) =>
    filters.some(([k]) => k === 'role') ? staff : students;

const SEP = '2026-09-15T06:00:00.000Z';   // mid-September IST
const TERMS = [{ monthly_fixed_paise: 800_000, incentive_percent: 10 }];

function conversions() {
  return [
    { payment_id: 'p1', student_id: 's1', plan: 'tillcat', amount_paise: 259_900, realised_at: SEP, refunded_at: null },
    { payment_id: 'p2', student_id: 's2', plan: 'monthly', amount_paise: 99_900, realised_at: SEP, refunded_at: SEP },
    { payment_id: 'p3', student_id: 's3', plan: 'session', amount_paise: 39_900, realised_at: SEP, refunded_at: null },
  ];
}
const STUDENTS = [
  { id: 's1', full_name: 'Riya Sharma', phone: '+919000000001' },
  { id: 's2', full_name: 'Karan Mehta', phone: '+919000000002' },
  { id: 's3', full_name: 'Aditi Rao', phone: '+919000000003' },
];

beforeEach(() => { currentUser = { id: 'anshul' }; });

// Server components are async; render the resolved element.
const render = async (el: Promise<any>) => renderToStaticMarkup(await el);

describe('/sales/earnings — the statement the letter promises', () => {
  it('renders, and the total equals fixed + the surviving incentives', async () => {
    currentAdmin = makeAdmin({ sales_conversions: conversions(), sales_rep_config: TERMS, profiles: STUDENTS });
    const html = await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);

    // ₹8,000 + (₹260 + ₹40) = ₹8,300. The refunded ₹100 is NOT in it.
    expect(html).toContain('₹8,300');
    expect(html).toContain('₹8,000 fixed');
    expect(html).toContain('₹300');
  });

  it('shows every conversion, including the refunded one, with its reason', async () => {
    currentAdmin = makeAdmin({ sales_conversions: conversions(), sales_rep_config: TERMS, profiles: STUDENTS });
    const html = await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    for (const n of ['Riya Sharma', 'Karan Mehta', 'Aditi Rao']) expect(html).toContain(n);
    // The deduction is explained, not silently absent.
    expect(html).toMatch(/Refunded[^<]*doesn’t count/);
    expect(html).toContain('line-through');

    // AND the struck-through line reads ₹0, not the ₹100 it would have earned.
    // Added after a mutation survived: making a refunded line compute its full
    // incentive broke nothing here, because the monthly TOTAL is summed from
    // the surviving lines either way. Only the row itself was uncovered, and
    // a row showing ₹100 next to "doesn't count" is a contradiction the
    // counsellor would have to resolve by asking.
    const amountShown = html.slice(html.indexOf('Karan Mehta')).match(/line-through[^>]*>([^<]*)</);
    expect(amountShown?.[1], 'the refunded line must show ₹0').toBe('₹0');
  });

  it('per-line rupees match the table printed in the engagement letter', async () => {
    currentAdmin = makeAdmin({ sales_conversions: conversions(), sales_rep_config: TERMS, profiles: STUDENTS });
    const html = await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toContain('₹260');   // Till CAT Day
    expect(html).toContain('₹40');    // Single session
  });

  it('UNKNOWN terms render as "not set up yet", never as ₹0', async () => {
    currentAdmin = makeAdmin({ sales_conversions: conversions(), sales_rep_config: [], profiles: STUDENTS });
    const html = await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toContain('Your terms aren’t set up yet');
    expect(html).not.toContain('₹0');
    // The work is still shown — only the money is withheld.
    expect(html).toContain('Riya Sharma');
  });

  it('DAY ONE: terms stated, zero conversions → shows ₹8,000, never ₹0 or a crash', async () => {
    // Exactly what Anshul sees the first time he opens this page, before he
    // has converted anybody. The founder smoke test checks this at step 4.
    // The unit layer proves computePayslip pays the fixed fee with no
    // conversions; nothing had proved the SCREEN renders it.
    currentAdmin = makeAdmin({ sales_conversions: [], sales_rep_config: TERMS, profiles: [] });
    const html = await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toContain('₹8,000');
    expect(html).toContain('No conversions yet this month');
    expect(html).toContain('Your fixed fee is unaffected');
    // The empty month must not read as "your terms are missing".
    expect(html).not.toContain('aren’t set up yet');
  });

  it('a failed conversions read renders as a failure, never as an empty month', async () => {
    currentAdmin = makeAdmin({ sales_conversions: new Error('db down'), sales_rep_config: TERMS, profiles: [] });
    const html = await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toContain('couldn’t load your earnings');
    expect(html).not.toContain('₹8,000');
  });

  it('a rep can only ever read their OWN payslip — the id comes from the session', async () => {
    currentAdmin = makeAdmin({ sales_conversions: [], sales_rep_config: TERMS, profiles: [] });
    // Even with a rep id in the query string, the read is scoped to the session.
    await render(SalesEarningsPage({ searchParams: Promise.resolve({ m: '2026-09', rep: 'neelam' } as any) }) as any);
    const convQuery = currentAdmin.asked.find((a: any) => a.table === 'sales_conversions');
    expect(convQuery.filters).toContainEqual(['rep_id', 'anshul']);
    expect(JSON.stringify(convQuery.filters)).not.toContain('neelam');
  });
});

describe('/sales/followups — promises and first calls', () => {
  const CFG = [{
    rep_id: 'anshul', active: true, employment_type: 'part_time',
    work_days: [1, 3, 4, 5, 6, 7], work_start_ist: '17:00:00', work_end_ist: '22:00:00',
    max_capacity_units: 40, max_new_per_day: 8, first_contact_sla_minutes: 120,
    unavailable_until: null, capacity_override: null, override_until: null,
  }];

  it('renders overdue, today and upcoming from real follow-up rows', async () => {
    const now = Date.parse('2026-09-16T12:00:00.000Z'); // 17:30 IST, inside shift
    vi.setSystemTime(now);
    currentAdmin = makeAdmin({
      sales_followup: [
        { id: 1, student_id: 's1', owner_id: 'anshul', due_at: '2026-09-15T10:00:00.000Z', reason: 'Promised a callback', channel: 'phone', created_at: SEP },
        { id: 2, student_id: 's2', owner_id: 'anshul', due_at: '2026-09-16T14:00:00.000Z', reason: 'Fee discussion', channel: 'phone', created_at: SEP },
        { id: 3, student_id: 's3', owner_id: 'anshul', due_at: '2026-09-20T10:00:00.000Z', reason: 'After her mock', channel: 'whatsapp', created_at: SEP },
      ],
      lead_outreach: [],
      sales_rep_config: CFG,
      profiles: STUDENTS,
    });
    const html = await render(SalesFollowupsPage() as any);
    expect(html).toContain('Promised a callback');
    expect(html).toContain('Fee discussion');
    expect(html).toContain('After her mock');
    expect(html).toMatch(/1 promise you’re late on/);
    vi.useRealTimers();
  });

  it('an unreadable follow-up list says so — never "nothing due"', async () => {
    currentAdmin = makeAdmin({
      sales_followup: new Error('read failed'), lead_outreach: [], sales_rep_config: CFG, profiles: [],
    });
    const html = await render(SalesFollowupsPage() as any);
    expect(html).toContain('couldn’t load your promises');
    expect(html).not.toContain('Nothing promised for today');
  });

  it('a lead uncalled past the SLA is flagged; one still inside it is not', async () => {
    // 17:00 IST assignment, now 20:30 IST → 210 working minutes, SLA 120.
    vi.setSystemTime(Date.parse('2026-09-16T15:00:00.000Z'));
    currentAdmin = makeAdmin({
      sales_followup: [],
      lead_outreach: [
        { student_id: 's1', assigned_at: '2026-09-16T11:30:00.000Z', first_contact_at: null, status: 'not_contacted' },
        { student_id: 's2', assigned_at: '2026-09-16T14:45:00.000Z', first_contact_at: null, status: 'not_contacted' },
      ],
      sales_rep_config: CFG,
      profiles: STUDENTS,
    });
    const html = await render(SalesFollowupsPage() as any);
    expect(html).toContain('call first');
    expect((html.match(/call first/g) ?? []).length).toBe(1);
    vi.useRealTimers();
  });

  it('a lead with no assignment time is "before we started timing", not 0 minutes', async () => {
    currentAdmin = makeAdmin({
      sales_followup: [],
      lead_outreach: [{ student_id: 's1', assigned_at: null, first_contact_at: null, status: 'not_contacted' }],
      sales_rep_config: CFG, profiles: STUDENTS,
    });
    const html = await render(SalesFollowupsPage() as any);
    expect(html).toContain('Assigned before we started timing');
    expect(html).not.toContain('0 working min');
  });

  it('never surfaces a lead the student asked us not to call', async () => {
    currentAdmin = makeAdmin({ sales_followup: [], lead_outreach: [], sales_rep_config: CFG, profiles: [] });
    await render(SalesFollowupsPage() as any);
    const leadQuery = currentAdmin.asked.find((a: any) => a.table === 'lead_outreach');
    expect(leadQuery.filters).toContainEqual(['owner_id', 'anshul']);
  });
});

describe('/admin/sales/payroll — the founder’s number, with its rows', () => {
  it('shows the same total the counsellor sees, from the same rows', async () => {
    currentAdmin = makeAdmin({
      profiles: profilesFor([{ id: 'anshul', full_name: 'Anshul Yadav', email: 'anshul@careerrai.in' }], STUDENTS),
      sales_conversions: conversions(),
      sales_rep_config: TERMS,
      sales_followup: [],
      lead_outreach: [],
    });
    const html = await render(PayrollPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    // The identical figure the rep's own page renders. One ledger, one rule.
    expect(html).toContain('₹8,300');
    expect(html).toContain('Anshul Yadav');
    // Drill-down on the same page: every conversion behind the number.
    expect(html).toContain('Riya Sharma');
    expect(html).toContain('Aditi Rao');
    expect(html).toContain('Every conversion behind that number');
  });

  it('DAY ONE: a rep with terms and no conversions still appears, owed ₹8,000', async () => {
    // The founder smoke test's step 5. A rep who has sold nothing is still
    // owed their fixed fee, so they must not be filtered off the payroll
    // screen — the filter keeps reps who have terms OR conversions, and this
    // pins the OR rather than trusting it.
    currentAdmin = makeAdmin({
      profiles: profilesFor([{ id: 'anshul', full_name: 'Anshul Yadav' }], []),
      sales_conversions: [], sales_rep_config: TERMS, sales_followup: [], lead_outreach: [],
    });
    const html = await render(PayrollPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toContain('Anshul Yadav');
    expect(html).toContain('₹8,000');
    expect(html).toContain('10% per conversion');
    expect(html).not.toContain('Terms not set');
  });

  it('a rep with no stated terms shows "terms not set", not ₹0', async () => {
    currentAdmin = makeAdmin({
      profiles: profilesFor([{ id: 'anshul', full_name: 'Anshul Yadav' }], STUDENTS),
      sales_conversions: conversions(), sales_rep_config: [], sales_followup: [], lead_outreach: [],
    });
    const html = await render(PayrollPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toContain('Terms not set');
    expect(html).toMatch(/fixed and incentive missing|incentive and fixed missing/);
  });

  it('reports the refund on the payroll screen too', async () => {
    currentAdmin = makeAdmin({
      profiles: profilesFor([{ id: 'anshul', full_name: 'Anshul Yadav' }], STUDENTS),
      sales_conversions: conversions(), sales_rep_config: TERMS, sales_followup: [], lead_outreach: [],
    });
    const html = await render(PayrollPage({ searchParams: Promise.resolve({ m: '2026-09' }) }) as any);
    expect(html).toMatch(/1 refunded/);
    expect(html).toContain('₹999');
  });
});
