import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── B3b #6 — weekly-digest: source failure produces ZERO side effects ──
//
//   profiles(buddies)  -> recipients      -> who gets a digest -> gates all
//   profiles(students) -> studentsByBuddy -> whose scores      -> the roster
//   daily_reports      -> computeSummary()-> score + band +
//                                            redFlags PER NAMED
//                                            STUDENT            -> in-app row AND
//                                                                 EMAIL to mentor
//
// The strongest false-claim case in the whole migration. A failed daily_reports
// read gave every student `reps = []`, and computeSummary on an empty week
// yields a bottom-band score plus "Fewer than 4 reports this week". The mentor
// then received, BY EMAIL, a per-student line of the form
//
//     Priya: 25/100 (Needs intervention) - Arjun: 25/100 (Needs intervention) ...
//
// for their entire roster. Named students, numeric scores, delivered outside
// the product where it cannot be corrected — from one dead query.

const dispatch = vi.fn(() => Promise.resolve('sent'));
const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
const sendEmail = vi.fn(() => Promise.resolve());

vi.mock('@/lib/notification-os', async (orig) => {
  const actual = await orig<typeof import('@/lib/notification-os')>();
  return { ...actual, dispatch: (...a: unknown[]) => { void a; return dispatch(); } };
});
vi.mock('@/lib/email', () => ({
  sendBuddyWeeklyDigest: () => sendEmail(), sendDailyReminder: () => sendEmail(),
  sendAdminAlert: () => sendEmail(), sendRedFlagAlert: () => sendEmail(),
}));
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, run: () => Promise<Response>) => run(),
}));

type Mode = 'ok' | 'error' | 'null-no-error' | 'throw';
let mode: Record<string, Mode> = {};
let population = 6;

const dayAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, full_name: `Student ${i}`, email: `s${i}@example.test`,
    notif_prefs: {}, buddy_id: `s${i % 3}`,
    created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    onboarding_completed: true,
    onboarding_step_reached: 2,
    onboarding_last_activity_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }));
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const m: Mode = mode[table] ?? 'ok';
      let chunk: string[] | null = null;
      // Paging: fetchAll asks for .range(from, to) per page; a fake that ignores
      // it would hand back the whole roster on every page and never terminate.
      let rng: [number, number] | null = null;
      const page = <T,>(rows: T[]) => (rng ? rows.slice(rng[0], rng[1] + 1) : rows);
      const answer = () => {
        if (m === 'throw') throw new Error(`${table} exploded`);
        if (m === 'error') return Promise.resolve({ data: null, error: { message: `${table} timeout` } });
        if (m === 'null-no-error') return Promise.resolve({ data: null, error: null });
        const all = rows(population);
        if (table === 'profiles') {
          return Promise.resolve({ data: page(chunk ? all.filter((r) => chunk!.includes(r.id)) : all), error: null });
        }
        if (table === 'daily_reports') {
          const scope = chunk ? all.filter((r) => chunk!.includes(r.id)) : all;
          // Logged yesterday: a healthy roster, so the positive control proves
          // the job still acts rather than passing by never acting.
          return Promise.resolve({
            data: scope.map((r) => ({ student_id: r.id, report_date: dayAgo(1) })), error: null });
        }
        return Promise.resolve({ data: [], error: null });
      };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'gte', 'lte', 'contains', 'limit', 'order', 'is', 'not']) {
        chain[k] = () => chain;
      }
      chain.range = (from: number, to: number) => { rng = [from, to]; return chain; };
      chain.in = (_c: string, vals: unknown) => {
        if (Array.isArray(vals) && typeof vals[0] === 'string' && vals[0].startsWith('s')) chunk = vals as string[];
        return chain;
      };
      chain.insert = insert;
      chain.maybeSingle = answer;
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        try { return Promise.resolve(answer()).then(res, rej); }
        catch (e) { return Promise.reject(e).catch(rej); }
      };
      return chain;
    },
  }),
}));

async function run() {
  const { POST } = await import('./route');
  const url = 'https://x/api/cron/weekly-digest';
  return POST({ nextUrl: new URL(url), url, method: 'POST', headers: new Headers() } as never);
}

const noSideEffects = () => {
  expect(dispatch, 'a push went out on a failed read').not.toHaveBeenCalled();
  expect(insert, 'a row was written on a failed read').not.toHaveBeenCalled();
  expect(sendEmail, 'an email was sent on a failed read').not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetModules();
  dispatch.mockClear(); insert.mockClear(); sendEmail.mockClear();
  mode = {};
  population = 6;
});

const FAILURES: [string, Mode][] = [
  ['an explicit error', 'error'],
  ['data: null with NO error — the incident shape', 'null-no-error'],
  ['a thrown exception', 'throw'],
];

describe('any source unavailable → zero side effects', () => {
  for (const table of ['profiles', 'daily_reports']) {
    for (const [name, m] of FAILURES) {
      it(`${table}: ${name}`, async () => {
        mode = { [table]: m };
        const res = await run();
        const body = await res.json();
        noSideEffects();
        expect(res.status).toBe(503);
        expect(body.ok).toBe(false);
        expect(body.skipped).toBe('source_unavailable');
        expect(body.sent).toBe(0);
      });
    }
  }

  it('at 2,000 students a failure still produces nothing (gate 7)', async () => {
    population = 2000;
    mode = { daily_reports: 'null-no-error' };
    const res = await run();
    noSideEffects();
    expect(res.status).toBe(503);
  });
});

describe('the job is not inert — positive controls', () => {
  it('with every source available it still acts', async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sent).toBeGreaterThan(0);
  });

  it('at 2,000 students a successful read still acts (gate 7)', async () => {
    population = 2000;
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBeGreaterThan(0);
  });
});

describe('behaviour is UNCHANGED — read safety only', () => {
  const src = () => readFileSync(join(process.cwd(), 'src/app/api/cron/weekly-digest/route.ts'), 'utf8');
  it('the digest still scores over a 7-day period', () => {
    expect(src()).toContain('computeSummary(reps, 7)');
  });
  it('the digest line format is unchanged', () => {
    expect(src()).toContain('${s.score}/100 (${s.band})');
  });
  it('the window still comes from the trailing-window authority', () => {
    expect(src()).toContain('trailingWindow(getLogDateString()).start');
  });
  it('buddies with no students are still skipped', () => {
    expect(src()).toContain('if (!myStudents.length) return false;');
  });
});
