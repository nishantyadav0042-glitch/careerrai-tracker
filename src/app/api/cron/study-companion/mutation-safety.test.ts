import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── B3b #2 — study-companion: source failure dispatches NOTHING ────────────
//
// Five population-scaled reads feed this job, and every one of them could turn
// a failure into a push to the whole cohort. The worst was the dedup read:
//
//     admin.from('notifications').select('user_id').in('user_id', ids)…
//     const alreadySent = new Set((sentToday ?? []).map(n => n.user_id));
//
// An unavailable read left `alreadySent` EMPTY, which reads as "nobody has been
// messaged yet today", so a broken query re-pushed every eligible student.
// Same class as check-red-flags' duplicate alert, at cohort scale.
//
// Founder constraint for this migration: read safety ONLY. No change to what
// counts as "today", the cadence, the 21-day window, eligibility, copy or
// timing. The last describe block pins that.

const dispatch = vi.fn(() => Promise.resolve('sent'));

vi.mock('@/lib/notification-os', () => ({
  dispatch: (...args: unknown[]) => { void args; return dispatch(); },
  BUDGET_ACTIVE: 3, BUDGET_SETUP: 3, BUDGET_RECOVERY: 3,
  dreamCollegeLabel: () => 'IIM',
}));
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, run: () => Promise<Response>) => run(),
}));

type Mode = 'ok' | 'error' | 'null-no-error' | 'throw';
let mode: Record<string, Mode> = {};
let population = 6;

function studentRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    full_name: `Student ${i}`,
    notif_prefs: {},
    // Old enough to be past the activation arc, so the ordinary slots apply.
    created_at: '2026-01-01T00:00:00Z',
    is_working_professional: false,
    self_reported_weakest_section: 'QA',
    self_reported_weak_topic: null,
    study_target_hours: 6,
    hours_available: 6,
    weekend_hours_available: 6,
    dream_colleges: null,
  }));
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const m: Mode = mode[table] ?? 'ok';
      // Paging: fetchAll asks for .range(from, to) per page; a fake that ignores
      // it would hand back the whole roster on every page and never terminate.
      let rng: [number, number] | null = null;
      const page = <T,>(rows: T[]) => (rng ? rows.slice(rng[0], rng[1] + 1) : rows);
      const answer = () => {
        if (m === 'throw') throw new Error(`${table} exploded`);
        if (m === 'error') return Promise.resolve({ data: null, error: { message: `${table} timeout` } });
        if (m === 'null-no-error') return Promise.resolve({ data: null, error: null });
        if (table === 'profiles') return Promise.resolve({ data: page(studentRows(population)), error: null });
        // Every other table genuinely empty: nobody logged, nobody has been
        // messaged today. That is the state in which this job SHOULD push.
        return Promise.resolve({ data: [], error: null });
      };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'gte', 'lte', 'in', 'contains', 'limit', 'order', 'is', 'not']) {
        chain[k] = () => chain;
      }
      chain.range = (from: number, to: number) => { rng = [from, to]; return chain; };
      chain.maybeSingle = answer;
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        try { return Promise.resolve(answer()).then(res, rej); }
        catch (e) { return Promise.reject(e).catch(rej); }
      };
      return chain;
    },
  }),
}));

async function run(slot = 'morning') {
  const { POST } = await import('./route');
  // The route reads `request.nextUrl.searchParams`, which is a NextRequest
  // property — a plain Request has no `nextUrl`, so the first harness threw
  // before reaching any of the logic under test and every case "failed" for
  // the wrong reason.
  const url = `https://x/api/cron/study-companion?slot=${slot}`;
  return POST({ nextUrl: new URL(url), url, method: 'POST', headers: new Headers() } as never);
}

beforeEach(() => {
  vi.resetModules();
  dispatch.mockClear();
  mode = {};
  population = 6;
});

const FAILURES: [string, Mode][] = [
  ['an explicit error', 'error'],
  ['data: null with NO error — the incident shape', 'null-no-error'],
  ['a thrown exception', 'throw'],
];

// Every source this job reads. A failure in ANY of them must stop the slot:
// streaks decide the copy, reports decide who looks inactive, coverage decides
// the tip, and the dedup read decides who has already been messaged today.
const SOURCES = ['profiles', 'streak_data', 'daily_reports', 'notifications', 'topic_coverage'];

describe('any source unavailable → zero dispatches', () => {
  for (const table of SOURCES) {
    for (const [name, m] of FAILURES) {
      it(`${table}: ${name} → nothing is pushed`, async () => {
        mode = { [table]: m };
        const res = await run();
        const body = await res.json();
        expect(dispatch, `${table} failed and a push still went out`).not.toHaveBeenCalled();
        expect(res.status).toBe(503);
        expect(body.skipped).toBe('source_unavailable');
        expect(body.sent).toBe(0);
        expect(body.ok).toBe(false);
      });
    }
  }

  it('the dedup read specifically — a failure must not RE-push the cohort', async () => {
    // The old code treated an unavailable dedup read as "nobody messaged yet".
    mode = { notifications: 'null-no-error' };
    const res = await run();
    expect(dispatch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });

  it('at 2,000 students a failure still pushes nothing (gate 7)', async () => {
    population = 2000;
    mode = { daily_reports: 'null-no-error' };
    const res = await run();
    expect(dispatch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });
});

describe('the job is not inert — positive controls', () => {
  it('with every source available, it still pushes', async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(dispatch).toHaveBeenCalled();
    expect(body.sent).toBeGreaterThan(0);
  });

  it('at 2,000 students a successful read still pushes (gate 7)', async () => {
    population = 2000;
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.candidates).toBe(2000);
    expect(dispatch).toHaveBeenCalled();
  });
});

describe('behaviour is UNCHANGED — this migration is read safety only', () => {
  const src = () =>
    readFileSync(join(process.cwd(), 'src/app/api/cron/study-companion/route.ts'), 'utf8');

  it('"today" is still the IST calendar date this file deliberately kept', () => {
    // The file's own header defers moving this to the study day, calling it a
    // behaviour change for the whole notification cadence that deserves its own
    // verification. B3b must not sneak it in.
    expect(src()).toContain(
      "const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });");
  });

  it('the report window is still 21 days', () => {
    expect(src()).toContain('now.getTime() - 21 * 86_400_000');
  });

  it('the dedup query still filters on this slot and today', () => {
    expect(src()).toContain("eq('type', companionType(slot))");
    expect(src()).toContain("gte('created_at', todayStart)");
  });

  it('coverage is still fetched only for the slots that need it', () => {
    expect(src()).toContain('needsCoverage');
  });
});
