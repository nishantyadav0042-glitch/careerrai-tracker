import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── Incident #64 — no unbounded read of a table that can exceed 1,000 rows ──
//
// 2 Sep 2026. The Command Center said STUDENTS 1000 for three days while 1,036
// real students existed. PostgREST caps every response at max-rows (Supabase
// default 1000) and returns the first thousand rows of an unbounded select
// with NO error. The tile counted what it was given. A client `.limit(20000)`
// does not help — max-rows is applied after it.
//
// The same shape existed in 134 reads. Several were already truncated for
// weeks: student_events (237k rows), notifications (100k), topic_coverage
// (50k), funnel_events (19k), decision_log (4k), daily_routines (1.9k),
// student_dna (1,038). And every cron that iterated "all students" skipped
// whichever ~40 sorted last under heap order — a set that is not stable across
// days, so the same student could be reminded on Monday and not Tuesday.
//
// ── WHAT THIS GUARD PINS ───────────────────────────────────────────────────
//
// A read of a POPULATION-SCALED table with nothing bounding it: no .limit
// below the cap, no .range, no .in(ids), no count/head, no single row, and
// not wrapped in fetchAll / readAllRows / readRowsForIds. Tables are listed
// by evidence (row counts read from production on 2 Sep 2026), not by name.
//
// ── THE BASELINE SHRINKS, NEVER GROWS ──────────────────────────────────────
//
// Same discipline as population-read.guard: the offenders that remain are
// listed by file. A NEW file fails the build; a migrated file left in the list
// fails the build too, so the list can only ever get shorter. Do NOT add a
// file here to make a build pass — wrap the read in fetchAll.

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Tables that can exceed PostgREST max-rows. Counts: production, 2 Sep 2026. */
const BIG_TABLES = [
  'profiles',            // 1,058
  'daily_reports',       //   617, +~20/day
  'student_events',      // 237,605
  'notifications',       // 100,586
  'student_engagement',  //   952
  'streak_data',         //   258
  'student_submissions', //   179
  'lead_outreach',       //   124
  'student_payments',    //    42
  'submission_votes',    //    78
  'daily_routines',      // 1,920
  'student_dna',         // 1,038
  'topic_coverage',      // 50,102
  'funnel_events',       // 18,901
  'decision_log',        // 4,162
  'otp_send_events',     // 1,478
  'routine_task_completions', // 607
  'mock_debriefs',       //    33
  'founder_outreach',    //   198
  'session_requests',    //     1
  'client_errors',       //   276
] as const;

/** Reads bounded by something other than "however many rows there are". */
const BOUNDED = [
  '.range(', '.in(', 'count:', '.single(', '.maybeSingle(',
  ".eq('id'", ".eq('student_id'", ".eq('user_id'", '.head', '.rpc(',
];
const WRITES = ['.insert(', '.update(', '.delete(', '.upsert('];
const WRAPPERS = ['fetchAll(', 'readAllRows<', 'readAllRows(', 'readRowsForIds'];

/**
 * Files that still hold an unbounded population read, as of the migration on
 * 2 Sep 2026. REMOVE an entry when its file is migrated; never add one.
 *
 * Started at 43 files / 75 reads (after the 88-read migration that closed the
 * incident). Most of what remains reads a table that is small TODAY
 * (student_payments 42, lead_outreach 124, submission_votes 78) or a bounded
 * subset (premium-only, refund_requested, has-buddy). They are listed, not
 * excused: the table that is small today is the one that quietly crosses the
 * cap the week nobody is looking.
 */
const KNOWN_UNBOUNDED: readonly string[] = [
  'src/app/admin/buddies/roster/page.tsx',
  'src/app/admin/buddy-funnel/page.tsx',
  'src/app/admin/sales-performance/page.tsx',
  'src/app/admin/student-success/page.tsx',
  'src/app/admin/students/pipeline/page.tsx',
  'src/app/api/admin/challenges/route.ts',
  'src/app/api/admin/daily-pick-stats/route.ts',
  'src/app/api/admin/distribute-leads/route.ts',
  'src/app/api/admin/enrol-book/route.ts',
  'src/app/api/admin/integration-metrics/route.ts',
  'src/app/api/admin/kohli-push/route.ts',
  'src/app/api/admin/leads-export/route.ts',
  'src/app/api/community/daily-slot/route.ts',
  'src/app/api/cron/buddy-brief/route.ts',
  'src/app/api/cron/buddy-checkin/route.ts',
  'src/app/api/cron/buddy-escalation/route.ts',
  'src/app/api/cron/builder-recovery/route.ts',
  'src/app/api/cron/daily-reminder/route.ts',
  'src/app/api/cron/expedify-flush/route.ts',
  'src/app/api/cron/expire-subscriptions/route.ts',
  'src/app/api/cron/notification-reach-watch/route.ts',
  'src/app/api/cron/onboarding-morning/route.ts',
  'src/app/api/cron/push-recovery/route.ts',
  'src/app/api/cron/reconcile-decisions/route.ts',
  'src/app/api/cron/reconcile-payments/route.ts',
  'src/app/api/cron/renewal-reminders/route.ts',
  'src/app/api/cron/weekly-digest/route.ts',
  'src/lib/buddy-match.ts',
  'src/lib/daily-pick-runner.ts',
  'src/lib/mentor-doors.ts',
  'src/lib/os/activation-funnel.ts',
  'src/lib/os/founder-digest.ts',
  'src/lib/os/founder-inbox.ts',
  'src/lib/os/mentor-ops.ts',
  'src/lib/os/revenue-ops.ts',
  'src/lib/os/sacred-guard.ts',
  'src/lib/os/universal-search.ts',
  'src/lib/sales-board.ts',
  'src/lib/sales-control-tower.ts',
  'src/lib/sales-data-quality.ts',
  'src/lib/sales-portfolio.ts',
  'src/lib/urgency-score.ts',
];

/** Scope: the operator surfaces and the crons — everything that reads a
 *  population. Student-facing routes read by their own id and are covered
 *  by the schema and truth guards. */
const ROOTS = ['app/admin', 'app/api/admin', 'app/api/cron', 'app/sales', 'app/api/community', 'lib'];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

/** Strip comments, so a file EXPLAINING the pattern is not accused of it. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The read expression from `.from(...)` to the end of its statement or array element. */
function segmentAfter(src: string, at: number): string {
  const seg = src.slice(at, at + 1200);
  let end = seg.length;
  for (const tok of [';', '\n  ]', '\n    ]', '\n]']) {
    const i = seg.indexOf(tok);
    if (i !== -1) end = Math.min(end, i);
  }
  return seg.slice(0, end);
}

export function unboundedReads(): Map<string, number> {
  const found = new Map<string, number>();
  const tableRe = new RegExp(`\\.from\\(\\s*'(${BIG_TABLES.join('|')})'\\s*\\)`, 'g');
  for (const root of ROOTS) {
    for (const abs of walk(join(SRC, root))) {
      const path = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
      const code = strip(readFileSync(abs, 'utf8'));
      for (const m of code.matchAll(tableRe)) {
        const before = code.slice(0, m.index);
        // Inside a paging wrapper? The wrapper token must be the last one
        // before this read with no statement boundary in between.
        const w = Math.max(...WRAPPERS.map((t) => before.lastIndexOf(t)));
        if (w !== -1 && !before.slice(w).includes(';')) continue;
        const seg = segmentAfter(code, m.index!);
        if (WRITES.some((t) => seg.includes(t))) continue;
        // A client limit BELOW the cap is a bound; at or above it, PostgREST
        // truncates anyway, so it is not.
        const lim = /\.limit\(\s*(\d[\d_]*)\s*\)/.exec(seg);
        if (lim && Number(lim[1].replace(/_/g, '')) < 1000) continue;
        if (BOUNDED.some((t) => seg.includes(t))) continue;
        found.set(path, (found.get(path) ?? 0) + 1);
      }
    }
  }
  return found;
}

describe('Incident #64 — no unbounded read of a population-scaled table', () => {
  it('finds the pattern at all (the guard is not vacuous)', () => {
    expect(unboundedReads().size).toBeGreaterThan(0);
  });

  it('no NEW file reads a big table without a bound', () => {
    const novel = [...unboundedReads().keys()].filter((f) => !KNOWN_UNBOUNDED.includes(f)).sort();
    expect(
      novel,
      'A read of a table that can exceed 1,000 rows has no bound. PostgREST will\n' +
      'return the first thousand rows and no error. Wrap it:\n' +
      "  const { data } = await fetchAll(() => admin.from('...')...)\n" +
      'or, in a cron, readAllRows(label, () => ...). Do NOT add the file to\n' +
      'KNOWN_UNBOUNDED to make this pass.\n' + novel.join('\n'),
    ).toEqual([]);
  });

  it('the baseline is not stale — migrated files must leave the list', () => {
    const current = unboundedReads();
    const fixedButStillListed = KNOWN_UNBOUNDED.filter((f) => !current.has(f));
    expect(
      fixedButStillListed,
      'These are migrated (or deleted) but still listed. Remove them — a stale\n' +
      'entry silently re-permits the pattern in that file later.\n' + fixedButStillListed.join('\n'),
    ).toEqual([]);
  });

  it('the count only ever falls', () => {
    // 75 reads across 43 files on 2 Sep 2026, after the migration. If this
    // number needs raising, a new unbounded read was added somewhere the file
    // list did not catch — find it, do not raise the number.
    const total = [...unboundedReads().values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(75);
  });

  it('the surfaces that showed the incident stay migrated', () => {
    // The tile that read 1000, the loaders every dashboard card derives from,
    // the crons that iterate the whole roster, and the student-facing peer
    // base. If any of these reappears, the incident is back.
    for (const f of [
      'src/app/admin/page.tsx',
      'src/lib/admin-filters.ts',
      'src/lib/momentum.ts',
      'src/lib/mission-queue.ts',
      'src/lib/notification-health.ts',
      'src/lib/lis-health.ts',
      'src/app/api/cron/compute-dna/route.ts',
      'src/app/api/cron/daily-heartbeat/route.ts',
      'src/app/api/cron/daily-insight/route.ts',
      'src/app/api/cron/log-yesterday-reminder/route.ts',
      'src/app/api/cron/weekly-plan-reconcile/route.ts',
      'src/app/api/cron/check-red-flags/route.ts',
      'src/app/api/cron/decision-engine/route.ts',
      'src/app/api/cron/nishant-weekly/route.ts',
      'src/app/api/cron/study-companion/route.ts',
      'src/lib/os/peer-cohort-data.ts',
    ]) {
      expect(unboundedReads().has(f), `${f} reads a big table without a bound again`).toBe(false);
    }
  });

  it('the population loader is paged, not limited', () => {
    // A `.limit(N)` on getRealStudents would be the tempting one-line "fix"
    // and would reproduce the incident at N — or at 1000, whichever is lower.
    const src = strip(readFileSync(join(SRC, 'lib/admin-filters.ts'), 'utf8'));
    const fn = src.slice(src.indexOf('export async function getRealStudents'), src.indexOf('export interface LoggedTodayRow'));
    expect(fn).toContain('fetchAll(');
    expect(fn).not.toMatch(/\.limit\(/);
  });
});
