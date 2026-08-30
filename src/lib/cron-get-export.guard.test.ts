import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// ── EVERY SCHEDULED CRON MUST ANSWER GET ────────────────────────────────────
//
// Incidents #55 and #56 were both filed as "declared in vercel.json on such a
// date and had NEVER run". Both were the same defect, and it was this one:
// Vercel Cron invokes with GET, these two routes exported only POST, Next
// answered 405, and the handler body never executed.
//
// What made it invisible for days is that `withCronTracking` lives INSIDE the
// handler. No body, no cron_runs row — so a job that was being called every
// day and rejected every day is indistinguishable in our own telemetry from a
// job nobody ever scheduled. We diagnosed it twice as a scheduling problem and
// built a GitHub Actions fallback for it, which is not what was wrong.
//
// Of 41 crons in vercel.json exactly two lacked the export, and they were
// exactly the two that had never run.

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  crons?: Array<{ path: string; schedule: string }>;
};

/** `/api/cron/study-companion?slot=kickoff` -> src/app/api/cron/study-companion/route.ts */
const routeFile = (p: string) => `src/app${p.split('?')[0]}/route.ts`;

const ANSWERS_GET = /export\s+(?:async\s+function\s+GET\b|\{[^}]*\bPOST as GET\b[^}]*\}|const\s+GET\b)/;

describe('every cron declared in vercel.json answers GET', () => {
  const crons = (vercel.crons ?? []).filter((c) => c.path.startsWith('/api/'));

  it('vercel.json actually declares crons (the list is not silently empty)', () => {
    expect(crons.length).toBeGreaterThan(30);
  });

  it.each(crons.map((c) => [c.path, c.schedule] as const))(
    '%s (%s) exports a GET handler',
    (path) => {
      const file = routeFile(path);
      expect(existsSync(file), `${file} does not exist — vercel.json points at a route that is not there`).toBe(true);
      expect(readFileSync(file, 'utf8')).toMatch(ANSWERS_GET);
    },
  );
});
