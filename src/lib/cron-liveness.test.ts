import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findSilentCrons, describeSilentCrons, maxSilentHours } from './cron-liveness';

const NOW = Date.parse('2026-08-29T19:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('a declared job that has never run is caught', () => {
  // THE REGRESSION. Both of these were real, both went unnoticed for days,
  // and both were found by a human thinking to ask rather than by any alarm.
  it('reproduces Incident #55 — outcome-sweep declared and never executed', () => {
    const silent = findSilentCrons(
      [{ path: '/api/cron/outcome-sweep', schedule: '45 1 * * *' }],
      [], // nothing has ever run
      NOW,
    );
    expect(silent).toHaveLength(1);
    expect(silent[0].lastRunIso, 'never run, not merely late').toBeNull();
    expect(describeSilentCrons(silent)).toContain('NEVER RUN');
  });

  it('reproduces Incident #56 — purge-session-handoffs, hourly, never executed', () => {
    const silent = findSilentCrons(
      [{ path: '/api/cron/purge-session-handoffs', schedule: '20 * * * *' }],
      [{ path: '/api/cron/other-job', lastRunIso: hoursAgo(1) }],
      NOW,
    );
    expect(silent.map((s) => s.path)).toEqual(['/api/cron/purge-session-handoffs']);
  });

  it('never-run jobs sort above merely-stalled ones', () => {
    const silent = findSilentCrons(
      [
        { path: '/api/cron/stalled', schedule: '0 3 * * *' },
        { path: '/api/cron/never', schedule: '0 3 * * *' },
      ],
      [{ path: '/api/cron/stalled', lastRunIso: hoursAgo(100) }],
      NOW,
    );
    expect(silent[0].path, 'a deployment that never took effect is the worse problem').toBe('/api/cron/never');
  });
});

describe('healthy jobs are not reported', () => {
  it('an hourly job that ran an hour ago is fine', () => {
    expect(findSilentCrons(
      [{ path: '/api/cron/h', schedule: '20 * * * *' }],
      [{ path: '/api/cron/h', lastRunIso: hoursAgo(1) }], NOW,
    )).toEqual([]);
  });

  it('a daily job that ran yesterday is fine — late is not dead', () => {
    expect(findSilentCrons(
      [{ path: '/api/cron/d', schedule: '30 2 * * *' }],
      [{ path: '/api/cron/d', lastRunIso: hoursAgo(25) }], NOW,
    )).toEqual([]);
  });

  it('a weekly job quiet for six days is fine', () => {
    expect(findSilentCrons(
      [{ path: '/api/cron/w', schedule: '0 8 * * 0' }],
      [{ path: '/api/cron/w', lastRunIso: hoursAgo(6 * 24) }], NOW,
    )).toEqual([]);
  });

  // A route called with several ?slot= values shares one deployment; any slot
  // running proves the route is alive.
  it('a multi-slot route is matched on its path, not its query string', () => {
    expect(findSilentCrons(
      [
        { path: '/api/cron/study-companion?slot=kickoff', schedule: '30 2 * * *' },
        { path: '/api/cron/study-companion?slot=spark', schedule: '30 5 * * *' },
      ],
      [{ path: '/api/cron/study-companion', lastRunIso: hoursAgo(2) }], NOW,
    )).toEqual([]);
  });

  // PRODUCTION SHAPE. cron_runs stores the path the scheduler actually called,
  // query string and all. Matching raw strings would miss every slot and report
  // a healthy route as never-run — a false alarm that would train the founder
  // to ignore this alert. Caught by running the detector against the real
  // table, not by the fixtures above.
  it('run rows carrying a query string still match their declared route', () => {
    expect(findSilentCrons(
      [
        { path: '/api/cron/study-companion?slot=kickoff', schedule: '30 2 * * *' },
        { path: '/api/cron/study-companion?slot=log', schedule: '0 16 * * *' },
      ],
      [
        { path: '/api/cron/study-companion?slot=kickoff', lastRunIso: hoursAgo(17) },
        { path: '/api/cron/study-companion?slot=log', lastRunIso: hoursAgo(3) },
      ],
      NOW,
    ), 'the freshest slot proves the route is alive').toEqual([]);
  });
});

describe('a job that has stopped is caught', () => {
  it('an hourly job quiet for six hours has stopped', () => {
    const s = findSilentCrons(
      [{ path: '/api/cron/h', schedule: '20 * * * *' }],
      [{ path: '/api/cron/h', lastRunIso: hoursAgo(6) }], NOW,
    );
    expect(s).toHaveLength(1);
    expect(s[0].hoursSilent).toBe(6);
    expect(describeSilentCrons(s)).toContain('SILENT 6h');
  });

  it('a daily job quiet for two days has stopped', () => {
    expect(findSilentCrons(
      [{ path: '/api/cron/d', schedule: '30 2 * * *' }],
      [{ path: '/api/cron/d', lastRunIso: hoursAgo(48) }], NOW,
    )).toHaveLength(1);
  });
});

describe('thresholds match the shape of the schedule', () => {
  it.each([
    ['20 * * * *', 3],        // hourly
    ['*/15 * * * *', 3],      // sub-hourly
    ['0 */6 * * *', 12],      // every N hours
    ['30 2 * * *', 36],       // daily
    ['0 8 * * 0', 9 * 24],    // weekly
  ])('%s tolerates %i hours of silence', (schedule, limit) => {
    expect(maxSilentHours(schedule)).toBe(limit);
  });
});

// The check is worthless if it silently stops covering the crons we add.
describe('every declared cron is actually covered', () => {
  it('reads the real vercel.json and classifies every entry', () => {
    const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? []) as
      { path: string; schedule: string }[];
    expect(crons.length).toBeGreaterThan(30);
    for (const c of crons) {
      expect(maxSilentHours(c.schedule), `${c.path} (${c.schedule}) has no threshold`).toBeGreaterThan(0);
    }
  });

  it('with an empty run table, EVERY declared cron is reported', () => {
    const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? []) as
      { path: string; schedule: string }[];
    const silent = findSilentCrons(crons, [], NOW);
    const distinctPaths = new Set(crons.map((c) => c.path.split('?')[0]));
    expect(silent.length, 'nothing may be silently exempt').toBe(distinctPaths.size);
  });
});
