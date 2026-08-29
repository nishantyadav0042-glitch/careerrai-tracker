import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── The two rules must not be routed around ─────────────────────────────────
//
// This guard DISCOVERS its own scope. The last four times a guard in this repo
// was written against a hardcoded file list, a writer appeared outside the list
// and the guard passed while the invariant broke (ENGINEERING-MEMORY). So it
// greps for the writers at test time and asserts the search was not vacuous.
//
// It also does NOT ban strings. Banning the word "employment_type" would fire
// on this file's own comments — the exact failure logged four times. What it
// checks is a CALL: does each writer of the table invoke the authority?

/**
 * Source with comments removed.
 *
 * Load-bearing, not tidiness. The first version of this guard reported
 * /api/sales/log as an ownership writer because that file contains the line
 * "owner_id is deliberately absent: ownership is written ONLY by the atomic
 * RPC" — a comment stating it does the right thing, read by the guard as
 * evidence it does the wrong one. That is the fourth time in this repo a
 * guard has fired on prose. Every check below runs on code only.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function grepFiles(pattern: string): string[] {
  try {
    const out = execSync(`grep -rl --include=*.ts --include=*.tsx -e ${JSON.stringify(pattern)} src/`, { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return []; // grep exits 1 on no match
  }
}

/** Files that WRITE sales_rep_config (insert/update/upsert), tests excluded. */
function configWriters(): string[] {
  return grepFiles("from('sales_rep_config')")
    .filter((f) => !f.includes('.test.'))
    .filter((f) => {
      // A read-only consumer (getTeamCapacity, the tower rollup) is not a
      // writer and is deliberately not required to call the statement rule.
      return /from\('sales_rep_config'\)[\s\S]{0,200}?\.(insert|update|upsert)\(/.test(code(f));
    });
}

/**
 * Files that write lead OWNERSHIP.
 *
 * Ownership, not any write: /api/sales/log and /api/admin/outreach both upsert
 * lead_outreach, but they write status, callbacks and notes — they never move a
 * student to a different rep, so a capacity question would be meaningless
 * there. The discriminator is `owner_id` appearing in a written payload.
 */
function bulkOwnershipWriters(): string[] {
  return grepFiles("from('lead_outreach')")
    .filter((f) => !f.includes('.test.'))
    .filter((f) => {
      return /from\('lead_outreach'\)[\s\S]{0,400}?\.(upsert|insert|update)\([\s\S]{0,300}?owner_id/.test(code(f));
    });
}

describe('employment_type cannot be routed around', () => {
  it('finds the writers at all — a guard that greps nothing proves nothing', () => {
    expect(configWriters().length).toBeGreaterThanOrEqual(2);
    expect(bulkOwnershipWriters().length).toBeGreaterThanOrEqual(1);
  });

  it('every writer of sales_rep_config asks whether part-time was described', () => {
    const offenders = configWriters().filter((f) => !/checkEmploymentStatement\s*\(/.test(code(f)));
    expect(offenders, `these write sales_rep_config without calling checkEmploymentStatement(): ${offenders.join(', ')}`).toEqual([]);
  });

  it('no route moves students to a rep without asking a stated ceiling', () => {
    // The routes ANSWER differently and that is deliberate:
    // /api/admin/distribute-leads refuses, because nobody named the
    // recipient; /api/admin/reassign-lead assigns anyway and states the
    // consequence, because admin override is unconditional by a decision that
    // predates this work. What none of them may do is not ask.
    //
    // An earlier version of this check accepted a bare getTeamCapacity() call
    // as sufficient. It was vacuous: deleting the enforcement from
    // distribute-leads while leaving the capacity READ in place still passed.
    // Verified by injecting exactly that.
    //
    // TWO CEILINGS SINCE 29 AUG 2026, because there are two questions (see the
    // note above portfolioIntakeLimit in sales-rep-provisioning.ts):
    //
    //   repAllocationLimit    may this rep take more LIVE WORK now?
    //   portfolioIntakeLimit  may this seat be responsible for more PEOPLE?
    //
    // Either satisfies this guard; NEITHER does not. Widening it to "one of
    // two" is the whole risk in this test, which is why the next one pins the
    // two apart — an ownership writer that consults the wrong ceiling would
    // pass here and fail there.
    const offenders = bulkOwnershipWriters()
      .filter((f) => !/repAllocationLimit\s*\(|portfolioIntakeLimit\s*\(/.test(code(f)));
    expect(offenders, `these change lead ownership without consulting a stated ceiling: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the live-work ceiling and the portfolio ceiling are not interchangeable', () => {
    // The bug this prevents is subtle and was real for five days: enrolling a
    // book through repAllocationLimit caps a seat at ~200 students, because
    // 'never_contacted' consumes a capacity unit and max_capacity_units is
    // CHECKed at 200 — while the operating model is ~1,000 students per seat.
    // Gating live work through portfolioIntakeLimit is the mirror error: it
    // would hand a part-timer unlimited same-day work.
    const enrol = 'src/app/api/admin/enrol-book/route.ts';
    const liveWork = 'src/app/api/admin/distribute-leads/route.ts';

    expect(code(enrol), 'enrol-book must gate on the PORTFOLIO ceiling').toMatch(/portfolioIntakeLimit\s*\(/);
    expect(code(enrol), 'enrol-book must not gate a book on live-work capacity').not.toMatch(/repAllocationLimit\s*\(/);

    expect(code(liveWork), 'distribute-leads must gate on the LIVE-WORK ceiling').toMatch(/repAllocationLimit\s*\(/);
    expect(code(liveWork), 'distribute-leads must not hand out live work against the portfolio ceiling').not.toMatch(/portfolioIntakeLimit\s*\(/);
  });

  it('a bulk enrolment never stamps assigned_at, which would fake an SLA breach per student', () => {
    // assigned_at starts the first-contact clock. Stamping it while enrolling
    // the back catalogue would report every imported student as a breach by
    // lunchtime. firstContactSla() renders a null assigned_at as 'unknown' and
    // tallies it separately, which is the honest answer.
    const enrol = code('src/app/api/admin/enrol-book/route.ts');
    // Take the written payload as a fixed window after the upsert call rather
    // than trying to balance parentheses with a regex — a lazy `\)` stops at
    // the first `)` inside the map callback and silently matches nothing,
    // which is how this guard passed while proving nothing on its first run.
    const from = enrol.indexOf("from('lead_outreach')");
    const at = from < 0 ? -1 : enrol.indexOf('.upsert(', from);
    const upsertBlock = at < 0 ? '' : enrol.slice(at, at + 300);
    expect(upsertBlock, 'the enrolment upsert was not found — this guard would be vacuous').toContain('owner_id');
    expect(upsertBlock, 'enrol-book must not set assigned_at').not.toContain('assigned_at');
  });
});

describe('the sales role is one door, not several', () => {
  it('no surface narrows the sales team to role=sales and silently drops admins', () => {
    // /admin/sales-performance used `.eq('role','sales')` then took `[0]`,
    // which showed exactly one rep's book on a page whose whole purpose is to
    // show a rep's book — the second hire was invisible with no indication
    // anyone was missing. Every staff read is `in ('sales','admin')`.
    const offenders = grepFiles(".eq('role', 'sales')")
      .filter((f) => !f.includes('.test.'))
      .filter((f) => /\.eq\('role', 'sales'\)/.test(code(f)));
    expect(offenders, `these read the sales team through a narrower filter than the rest of the app: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every admin API route is gated on role=admin — a rep may not walk in through the API', () => {
    // Phase 5 asks for direct API access to be tested, not just page access.
    // requireAdmin() protects the PAGES; these are the routes behind them, and
    // a sales rep holds a perfectly valid session cookie.
    const routes = execSync('ls src/app/api/admin/*/route.ts', { encoding: 'utf8' })
      .split('\n').map((x) => x.trim()).filter(Boolean);
    expect(routes.length).toBeGreaterThanOrEqual(20);
    const ungated = routes.filter((f) => {
      const src = code(f);
      return !/isRequestAdmin\s*\(|requireAdminCtx\s*\(|requireAdmin\s*\(/.test(src)
        && !/role\s*!==\s*'admin'/.test(src)
        // A cron-only route is gated on the shared secret, not on a session —
        // it has no human caller to have a role.
        && !/CRON_SECRET|authorizedCron\s*\(/.test(src);
    });
    expect(ungated, `these admin routes have no admin gate: ${ungated.join(', ')}`).toEqual([]);
  });

  it('the sales door is opened by role, never by employment type', () => {
    // A part-time rep is a rep. If employment_type ever reached an
    // authorization decision it would be a second, weaker sales role.
    const authz = code('src/lib/sales-authz.ts');
    const adminAuth = code('src/lib/admin-auth.ts');
    expect(/employment/i.test(authz)).toBe(false);
    expect(/employment/i.test(adminAuth)).toBe(false);
  });
});
