import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Every cron must be observable ───────────────────────────────────────────
//
// weekly-plan-reconcile told 655 students they had studied nothing and logged
// ok:true. It was diagnosable at all only because it happened to use
// withCronTracking. Seventeen other crons — including every dangerous writer:
// check-red-flags (sends notifications), sales-ready (CRM state), compute-dna
// (churn scores), all three reconcile-* jobs — recorded nothing at all. They
// could have been failing daily and no row anywhere would have said so.
//
// A job that mutates student state without leaving a trace is not a job, it is
// a rumour.

const DIR = 'src/app/api/cron';
const crons = readdirSync(DIR).filter((n) => existsSync(join(DIR, n, 'route.ts')));

describe('every cron records that it ran', () => {
  it('there are crons to check — the scan is not vacuously empty', () => {
    expect(crons.length).toBeGreaterThan(20);
  });

  it('no cron route mutates or reports without run tracking', () => {
    const untracked = crons.filter(
      (n) => !readFileSync(join(DIR, n, 'route.ts'), 'utf8').includes('withCronTracking'),
    );
    expect(untracked, 'these crons would fail invisibly').toEqual([]);
  });

  it('the auth check stays OUTSIDE the tracked span', () => {
    // An unauthorised probe is not a run. Counting one would fill cron_runs
    // with noise and hide the real failures among it.
    for (const n of crons) {
      const src = readFileSync(join(DIR, n, 'route.ts'), 'utf8');
      const auth = src.indexOf('authorizedCron');
      const track = src.indexOf('withCronTracking(');
      if (auth === -1 || track === -1) continue;
      expect(auth, `${n}: auth must be checked before tracking starts`).toBeLessThan(track);
    }
  });
});

describe('every scheduled job has code, and every scheduled job is tracked', () => {
  // Resolve against the real route file. An earlier version of this guard
  // assumed every scheduled job lives under /api/cron and reported
  // security-monitor as a phantom — it exists, under /api/admin. The guard was
  // wrong, not the config, and a guard that mislocates a file will happily
  // accuse working code.
  const scheduled = [
    ...new Set(
      ((JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: { path: string }[] }).crons ?? [])
        .map((c) => c.path.split('?')[0]),
    ),
  ];

  it('every scheduled path resolves to a route file', () => {
    const missing = scheduled.filter((p) => !existsSync(join('src/app', p, 'route.ts')));
    expect(missing, 'scheduled but 404s on every fire').toEqual([]);
  });

  it('every scheduled job records its runs, wherever it lives', () => {
    const untracked = scheduled.filter(
      (p) => !readFileSync(join('src/app', p, 'route.ts'), 'utf8').includes('withCronTracking'),
    );
    expect(untracked, 'scheduled and invisible').toEqual([]);
  });
});
