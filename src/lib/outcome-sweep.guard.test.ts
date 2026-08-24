import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── What the student actually did next ──────────────────────────────────────
//
// The ledger records the rep's act. The sweep records the student's response,
// read from daily_reports — never from the rep. That split is the ONLY reason
// the outcome columns can be evidence rather than self-assessment.
//
// Verified functionally against careerrai-test before production (17 probes):
// a 10-day-old intervention measured d1/d3/d7/sustained/streak correctly, a
// 2-day-old one measured d1 and left d3/d7 NULL, a 2-hour-old one was left
// entirely untouched, a measured window could not be rewritten, and a second
// sweep changed nothing.

const MIGRATION = 'supabase/migrations/20260824f_outcome_sweep.sql';
const SQL = readFileSync(MIGRATION, 'utf8');
const CRON = readFileSync('src/app/api/cron/outcome-sweep/route.ts', 'utf8');

const WINDOWS: [string, string][] = [
  ['logged_d1', '1 day'],
  ['logged_d3', '3 days'],
  ['logged_d7', '7 days'],
];

describe('an unelapsed window is NEVER written', () => {
  // The defect this prevents: writing `false` into a window that has not
  // elapsed is not a conservative default. It is a fabricated negative that
  // would permanently understate every intervention measured near the present,
  // and it can never be corrected because the outcome is immutable once set.
  it.each(WINDOWS)('%s is gated on its own window having elapsed', (col, window) => {
    const guard = new RegExp(
      `${col} = coalesce\\(l\\.${col},\\s*\\n?\\s*case when l\\.occurred_at < now\\(\\) - interval '${window}'`,
    );
    expect(SQL, `${col} is written without checking that ${window} has passed`).toMatch(guard);
  });

  it('the 7-day outcomes all wait a full 7 days', () => {
    for (const col of ['sustained_7d', 'streak_resumed', 'session_booked', 'session_completed']) {
      expect(SQL, `${col} may be measured early`).toMatch(
        new RegExp(`${col} = coalesce\\(l\\.${col},\\s*\\n?\\s*case when l\\.occurred_at < now\\(\\) - interval '7 days'`),
      );
    }
  });

  it('candidates are only selected once some window has matured', () => {
    // Otherwise every fresh intervention would be swept, stamped with an
    // outcome_measured_at, and look measured while carrying no measurement.
    const where = SQL.slice(SQL.indexOf('from public.intervention_ledger l'), SQL.indexOf('order by l.occurred_at'));
    for (const [, window] of WINDOWS) {
      expect(where).toContain(`now() - interval '${window}'`);
    }
  });
});

describe('a measured outcome is a fact about the past', () => {
  it('every outcome column is written through coalesce(existing, new)', () => {
    for (const col of ['logged_same_day', 'logged_d1', 'logged_d3', 'logged_d7',
                       'sustained_7d', 'streak_resumed', 'session_booked', 'session_completed']) {
      expect(SQL, `${col} can be overwritten by a re-sweep`).toMatch(
        new RegExp(`${col} = coalesce\\(l\\.${col},`),
      );
    }
  });

  it('and the DATABASE enforces it too, not merely the sweep', () => {
    // "The code is careful" is not an invariant. This is the table the funding
    // conversation will be argued from.
    expect(SQL).toMatch(/intervention_outcome_immutable_guard/);
    expect(SQL).toMatch(/is already measured and cannot be changed/);
  });

  it('the intervention record itself cannot be rewritten', () => {
    expect(SQL).toMatch(/the intervention record itself is append-only/);
    for (const col of ['student_id', 'rep_id', 'occurred_at', 'state_before']) {
      expect(SQL).toMatch(new RegExp(`new\\.${col} <> old\\.${col}`));
    }
  });
});

describe('the same-day log is context, never an outcome', () => {
  it('every outcome window starts strictly AFTER the day of the call', () => {
    // report_date is a DATE. A same-day log may well have happened hours
    // before the rep dialled — counting it would credit the intervention with
    // a log that preceded it.
    const outcomeWindows = [...SQL.matchAll(/and r\.report_date > s\.d0 and r\.report_date <= s\.d0 \+ (\d)/g)];
    expect(outcomeWindows.length).toBeGreaterThanOrEqual(3);

    // logged_same_day is the ONLY read that uses `= s.d0`, and it is not one
    // of the d1/d3/d7 outcomes.
    const sameDayReads = [...SQL.matchAll(/r\.report_date = s\.d0/g)];
    expect(sameDayReads.length).toBe(1);
  });
});

describe('the rep cannot reach these columns', () => {
  it('the sweep reads only product-observed tables', () => {
    const fn = SQL.slice(SQL.indexOf('create or replace function public.sweep_intervention_outcomes'));
    expect(fn).toContain('public.daily_reports');
    expect(fn).toContain('public.video_sessions');
    // sales_activity is what a HUMAN claims happened. If an outcome were ever
    // derived from it, the ledger would be measuring reps by their own
    // reports.
    expect(fn, 'an outcome is being derived from a self-reported table').not.toContain('sales_activity');
    expect(fn).not.toContain('lead_outreach');
  });

  it('students and anonymous callers cannot run it', () => {
    expect(SQL).toMatch(/revoke all on function public\.sweep_intervention_outcomes\(int\) from public, anon, authenticated/);
    expect(SQL).toMatch(/grant execute on function public\.sweep_intervention_outcomes\(int\) to service_role/);
  });
});

describe('the sweep claims no causality', () => {
  it('no column or comment says the rep caused anything', () => {
    // The founder's standing rule: report "student logged within 3 days of
    // intervention", never "rep caused activation".
    const forbidden = /\b(caused_|caused by|attribution_score|rep_impact|conversion_credit)\b/i;
    expect(SQL).not.toMatch(forbidden);
    expect(CRON).not.toMatch(forbidden);
  });

  it('the sweep introduces no score, rank or formula', () => {
    // Explicitly out of scope: no second scoring formula, no priority engine.
    expect(SQL).not.toMatch(/\bscore\b/i);
    expect(SQL).not.toMatch(/\brank\b/i);
  });
});

describe('the cron reports its own limits', () => {
  it('a failed sweep is loud, not silent', () => {
    // A ledger that quietly stops being measured still LOOKS complete: every
    // row keeps its NULLs, and "not yet measurable" is indistinguishable from
    // "nobody measured".
    expect(CRON).toMatch(/status: 500/);
    expect(CRON).toMatch(/console\.error/);
  });

  it('a truncated run says so rather than reading as "all done"', () => {
    expect(CRON).toMatch(/moreWaiting/);
  });

  it('runs after the 5:30am IST study-day boundary, so yesterday is complete', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
    const cron = vercel.crons.find((c) => c.path === '/api/cron/outcome-sweep');
    expect(cron, 'outcome-sweep is not scheduled').toBeTruthy();
    const [minute, hour] = cron!.schedule.split(' ');
    // Vercel crons are UTC. The study day rolls at 00:00 UTC (5:30am IST), so
    // any run after that hour sees a complete previous study day.
    const utcMinutes = Number(hour) * 60 + Number(minute);
    expect(utcMinutes).toBeGreaterThan(0);
    expect(utcMinutes).toBeLessThan(6 * 60);
  });
});

describe('the sweep does not scale by loading the world', () => {
  it('the work is one set-based statement, not a per-row loop in TypeScript', () => {
    // Doing this row by row would mean pulling every intervention and every
    // student's log history into a serverless function — the ~5k wall the
    // architecture gate recorded.
    expect(CRON).toMatch(/\.rpc\('sweep_intervention_outcomes'/);
    expect(CRON).not.toMatch(/from\('daily_reports'\)/);
    expect(CRON).not.toMatch(/for \(const/);
  });

  it('the run is bounded and the bound is visible', () => {
    expect(SQL).toMatch(/limit p_limit/);
    expect(CRON).toMatch(/p_limit: 500/);
  });
});
