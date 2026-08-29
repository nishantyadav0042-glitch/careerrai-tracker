import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── For every scheduled event: who can possibly fire it? ───────────────────
//
// Not "which cron do we think fires it". Every firer, enumerated from the
// files that actually schedule things.
//
// WHY THIS EXISTS. On 27 Aug the answer turned out to be: 36 cron routes, all
// fired by Vercel, and TWELVE of them fired a SECOND time by the GitHub
// fallback — at the IDENTICAL MINUTE. The fallback was not a fallback. It was
// a concurrent second producer, and every one of those twelve defended itself
// with a read-then-send dedup that two simultaneous runs can both pass.
//
// That is not a hypothetical. weekly-digest ran that way and double-sent to
// every mentor, every Monday: 13 of 26 rows in production were duplicates
// before it got a dedup at all. The other eleven were the same shape and had
// simply not been caught yet — GitHub's cron is usually minutes late, so the
// race usually resolved by luck.
//
// The fix is that a fallback must run AFTER the thing it backs up. With a gap,
// the read-based dedup is sound: the second run sees the first run's rows and
// stands down. With no gap, no read-based dedup can be sound, because both
// runs read before either writes.

const CRON_DIR = 'src/app/api/cron';
const FALLBACK = '.github/workflows/cron-fallback.yml';
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Minimum minutes a fallback must trail the primary. Long enough that a slow
 *  primary run has finished and written its rows before the backup looks. */
const MIN_GAP_MINUTES = 15;

const vercelCrons: Array<{ path: string; schedule: string }> =
  JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? [];
const fallback = readFileSync(FALLBACK, 'utf8');

const routeOf = (p: string) => p.replace('/api/cron/', '').split('?')[0];
const vercelByRoute = new Map<string, string>();
for (const c of vercelCrons) vercelByRoute.set(routeOf(c.path), c.schedule.trim());

/** The fallback's `- cron: 'X'  # route[+route]` lines. */
const fallbackEntries = [...fallback.matchAll(/- cron: '([^']+)'\s*#\s*(.+)/g)]
  .flatMap(([, schedule, comment]) =>
    comment.split(/[+,]/).map((r) => ({ route: r.trim(), schedule: schedule.trim() })));

const minutes = (cron: string): number | null => {
  const [m, h] = cron.split(/\s+/);
  return /^\d+$/.test(m) && /^\d+$/.test(h) ? Number(m) + 60 * Number(h) : null;
};

describe('the fallback list and the dispatcher cannot drift apart', () => {
  // The workflow routes by matching the cron STRING. Change a schedule without
  // changing its case label and the fallback silently stops backing anything
  // up — it falls through to the error branch and nobody is reminded.
  const schedules = [...fallback.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
  const caseLabels = [...fallback.matchAll(/"([0-9*/ ,-]+)"\)/g)].map((m) => m[1]);

  it('every scheduled time has a dispatcher branch', () => {
    expect(schedules.filter((s) => !caseLabels.includes(s))).toEqual([]);
  });

  it('every dispatcher branch has a scheduled time', () => {
    expect(caseLabels.filter((c) => !schedules.includes(c))).toEqual([]);
  });

  it('the lists are non-trivial', () => {
    expect(schedules.length).toBeGreaterThan(8);
  });
});

describe('a fallback runs AFTER the thing it backs up', () => {
  it('finds the dual-scheduled routes (the guard is a guard)', () => {
    const dual = fallbackEntries.filter((e) => vercelByRoute.has(e.route));
    expect(dual.length).toBeGreaterThan(8);
  });

  it.each(fallbackEntries.filter((e) => vercelByRoute.has(e.route)))(
    '$route trails its primary by a real margin',
    ({ route, schedule }) => {
      const primary = minutes(vercelByRoute.get(route)!);
      const backup = minutes(schedule);
      expect(primary, `${route}: primary schedule is not a fixed time`).not.toBeNull();
      expect(backup, `${route}: fallback schedule is not a fixed time`).not.toBeNull();
      const gap = backup! - primary!;
      expect(
        gap,
        `${route} fires on BOTH schedulers ${gap === 0 ? 'at the SAME MINUTE' : `only ${gap} min apart`}. ` +
        'Two runs then read "nobody has been told" before either writes, and both send — which is exactly ' +
        'how every mentor got two weekly digests. A backup must trail the primary, not race it.',
      ).toBeGreaterThanOrEqual(MIN_GAP_MINUTES);
    },
  );

  it('no fallback time collides with any OTHER primary cron', () => {
    const primaryTimes = new Set(vercelCrons.map((c) => c.schedule.trim()));
    const collisions = fallbackEntries.filter((e) => primaryTimes.has(e.schedule));
    expect(
      [...new Set(collisions.map((c) => `${c.route} @ ${c.schedule}`))],
      'A fallback moved onto a minute some other primary cron already occupies — the race was relocated, not removed.',
    ).toEqual([]);
  });
});

describe('every dual-fired route can survive being run twice', () => {
  /**
   * A route fired by two schedulers needs SOME defence. Declared per route so
   * a new dual-scheduled job cannot inherit silence by default.
   */
  const DEFENCE: Record<string, string> = {
    'onboarding-morning': 'onboarding_morning is in notifications_once_per_day_per_type — the DB refuses the second row (23505).',
    'daily-reminder': 'activation and onboarding_evening are both in the per-day unique index.',
    'decision-engine': 'emits revision_due / topic_earned / mission_changed / weekly_evolved, all in the per-day index.',
    'buddy-brief': 'reads the day\'s buddy_brief rows before sending; with the gap the second run sees the first run\'s rows.',
    'session-tomorrow': 'per-session dedup on data->>session_id, and the read fails CLOSED (dedupFailed breaks the loop).',
    'buddy-escalation': 'reads existing escalation rows for the same message before sending.',
    'nishant-weekly': 'founder_ping is weekly; the cron reads the last 6 days before sending.',
    'weekly-digest': 'reads the week\'s weekly_digest rows through the Truth Boundary and returns 503 if that read is unavailable.',
    'check-red-flags': 'reads the day\'s red_flag rows per mentor before sending.',
    'expire-subscriptions': 'the expiry UPDATE is status-guarded, so the second run changes no rows and sends nothing.',
    'renewal-reminders': 'reads existing renewal_reminder rows and fails closed on a read error.',
    'sales-ready': 'writes no notifications — it moves CRM lane state, which is idempotent by status guard.',
    'outcome-sweep': 'writes no notifications; sweep_intervention_outcomes() selects only rows whose window column IS NULL and whose window has elapsed, so the second run of a day matches nothing.',
  };

  it('every dual-fired route has a declared defence', () => {
    const dual = [...new Set(fallbackEntries.filter((e) => vercelByRoute.has(e.route)).map((e) => e.route))];
    const undeclared = dual.filter((r) => !(r in DEFENCE));
    expect(
      undeclared,
      'This job is scheduled by BOTH schedulers and nothing here says what stops it running twice:\n  ' +
        undeclared.join('\n  '),
    ).toEqual([]);
  });

  it('the declared list contains no route that is no longer dual-fired', () => {
    const dual = new Set(fallbackEntries.filter((e) => vercelByRoute.has(e.route)).map((e) => e.route));
    const stale = Object.keys(DEFENCE).filter((r) => !dual.has(r));
    expect(stale, `no longer dual-scheduled — remove:\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  it('every dual-fired route actually exists', () => {
    const routes = new Set(readdirSync(CRON_DIR));
    const missing = Object.keys(DEFENCE).filter((r) => !routes.has(r));
    expect(missing, `the fallback calls a route that does not exist:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('no route is scheduled by the fallback without a primary', () => {
    // A job whose ONLY firer is the backup is not backed up by anything.
    const orphans = fallbackEntries
      .filter((e) => !vercelByRoute.has(e.route))
      .map((e) => e.route);
    expect(orphans, `fired only by the fallback:\n  ${orphans.join('\n  ')}`).toEqual([]);
  });
});

describe('nothing else in the repo can fire a cron route', () => {
  it('no workflow other than the declared fallback calls /api/cron', () => {
    const others = readdirSync('.github/workflows')
      .filter((f) => f !== 'cron-fallback.yml')
      .filter((f) => /api\/cron\//.test(readFileSync(join('.github/workflows', f), 'utf8')));
    expect(
      others,
      'A third scheduler would be a third producer for events that already have two:\n  ' + others.join('\n  '),
    ).toEqual([]);
  });

  it('no application code calls a cron route', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name.name) || /\.test\./.test(name.name)) continue;
        if (p.startsWith(CRON_DIR)) continue;
        if (/['"`]\/api\/cron\//.test(strip(readFileSync(p, 'utf8')))) hits.push(p);
      }
    };
    walk('src');
    expect(
      hits,
      'Application code that calls a cron endpoint is a third firer nobody counts:\n  ' + hits.join('\n  '),
    ).toEqual([]);
  });
});
