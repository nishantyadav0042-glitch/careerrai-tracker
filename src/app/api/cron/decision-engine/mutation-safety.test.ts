import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── B3b #5 — decision-engine: source failure notifies NOBODY ───────────────
//
// Six population reads. READ → DERIVED VALUE → DECISION → SIDE EFFECT:
//
//   profiles         → students          → who is considered   → gates all
//   streak_data      → daysSinceLastLog  → computeStudentState → recovery push
//   daily_reports    → loggedDaysTotal   → onboarding_arc?     → arc hand-off
//   topic_coverage   → coverage[]        → revision/earned     → push
//   daily_routines×2 → first task        → mission_changed     → push
//   notifications    → alreadySentToday  → dedup               → DUPLICATE push
//
// HONEST BLAST RADIUS. Unlike check-red-flags, a failed read here did not
// manufacture a false claim: the detectors fail closed by construction
// (`detectMissionChanged` needs both sides non-null, `detectRecovery(null)` is
// null, and a null `daysSinceLastLog` becomes 'plan_ready', which this route
// skips as owned elsewhere). So the pre-migration failure mode was SILENT
// TOTAL SUPPRESSION reported as a normal day — `{ notified: 0, ownedElsewhere:
// everyone }`, identical to a genuinely quiet cohort.
//
// The one exception is the dedup read, which manufactures a side effect: an
// unavailable result reads as "nothing sent today" and duplicates go out. That
// is the Phase 11 production bug (10–20 duplicate inactive_recovery/day)
// reachable again by a dead query rather than by two schedulers racing.

const dispatch = vi.fn(() => Promise.resolve('sent'));

vi.mock('@/lib/notification-os', async (orig) => {
  const actual = await orig<typeof import('@/lib/notification-os')>();
  return { ...actual, dispatch: (...a: unknown[]) => { void a; return dispatch(); } };
});
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, run: () => Promise<Response>) => run(),
}));
vi.mock('@/lib/prep-memory-data', () => ({
  computePrepMemory: () => Promise.resolve({ weeklyEvolution: [] }),
}));

type Mode = 'ok' | 'error' | 'null-no-error' | 'throw';
let mode: Record<string, Mode> = {};
let population = 6;

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAgoDay = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function studentRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, notif_prefs: {}, is_repeater: false, is_working_professional: false,
    // Joined long ago and logging daily → state 'active', so the coverage
    // detectors run rather than the recovery ladder.
    created_at: daysAgoIso(60), onboarding_completed: true,
  }));
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const m: Mode = mode[table] ?? 'ok';
      // The mock must honour the chunk the way the real query does. The first
      // version ignored it and returned EVERY student's rows for each of the
      // 20 chunks at 2,000 students — 320,000 rows for daily_reports alone, and
      // both gate-7 cases timed out. That would have read as "chunking is too
      // slow at scale" when it was the stub generating quadratic data.
      let chunk: string[] | null = null;
      // Paging: fetchAll asks for .range(from, to) per page; a fake that ignores
      // it would hand back the whole roster on every page and never terminate.
      let rng: [number, number] | null = null;
      const page = <T,>(rows: T[]) => (rng ? rows.slice(rng[0], rng[1] + 1) : rows);
      const answer = () => {
        if (m === 'throw') throw new Error(`${table} exploded`);
        if (m === 'error') return Promise.resolve({ data: null, error: { message: `${table} timeout` } });
        if (m === 'null-no-error') return Promise.resolve({ data: null, error: null });
        const all = studentRows(population);
        if (table === 'profiles') return Promise.resolve({ data: page(all), error: null });
        const ids = chunk ? all.filter((s) => chunk!.includes(s.id)) : all;
        if (table === 'streak_data') {
          // Logged yesterday → daysSinceLastLog 1 → 'active'.
          return Promise.resolve({
            data: ids.map((s) => ({ student_id: s.id, last_log_date: daysAgoDay(1) })), error: null });
        }
        if (table === 'daily_reports') {
          // >= 7 logged days so nobody is diverted into onboarding_arc.
          return Promise.resolve({
            data: ids.flatMap((s) => Array.from({ length: 8 }, (_, d) =>
              ({ student_id: s.id, report_date: daysAgoDay(d + 1) }))), error: null });
        }
        if (table === 'topic_coverage') {
          // Studied once, long ago → revision genuinely due. This is the state
          // in which the engine SHOULD notify, so the positive control proves
          // the migration did not simply switch the job off.
          return Promise.resolve({
            data: ids.map((s) => ({
              student_id: s.id, topic: 'Percentages', status: 'practicing',
              updated_at: daysAgoIso(120),
            })), error: null });
        }
        return Promise.resolve({ data: [], error: null });
      };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'gte', 'lte', 'contains', 'limit', 'order', 'is', 'not']) {
        chain[k] = () => chain;
      }
      chain.range = (from: number, to: number) => { rng = [from, to]; return chain; };
      chain.in = (_col: string, vals: unknown) => {
        if (Array.isArray(vals) && typeof vals[0] === 'string' && vals[0].startsWith('s')) {
          chunk = vals as string[];
        }
        return chain;
      };
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
  const url = 'https://x/api/cron/decision-engine';
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

const SOURCES = ['profiles', 'streak_data', 'daily_reports', 'topic_coverage',
                 'daily_routines', 'notifications'];

describe('any source unavailable → zero dispatches', () => {
  for (const table of SOURCES) {
    for (const [name, m] of FAILURES) {
      it(`${table}: ${name} → nobody is notified`, async () => {
        mode = { [table]: m };
        const res = await run();
        const body = await res.json();
        expect(dispatch, `${table} failed and a notification still went out`).not.toHaveBeenCalled();
        expect(res.status).toBe(503);
        expect(body.ok).toBe(false);
        expect(body.skipped).toBe('source_unavailable');
        expect(body.notified).toBe(0);
      });
    }
  }

  it('a dead source must not look like a quiet cohort', async () => {
    // The pre-migration failure: every student became 'plan_ready' and the run
    // answered { notified: 0, ownedElsewhere: everyone } — byte-identical to a
    // day on which nothing was genuinely due.
    mode = { streak_data: 'null-no-error' };
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.ownedElsewhere).toBeUndefined();
  });

  it('the dedup read failing must not re-send today (Phase 11 regression)', async () => {
    mode = { notifications: 'error' };
    const res = await run();
    expect(dispatch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });

  it('at 2,000 students a failure still notifies nobody (gate 7)', async () => {
    population = 2000;
    mode = { topic_coverage: 'null-no-error' };
    const res = await run();
    expect(dispatch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });
});

describe('the engine is not inert — positive controls', () => {
  it('with every source available it still notifies', async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(dispatch).toHaveBeenCalled();
    expect(body.notified).toBeGreaterThan(0);
  });

  it('at 2,000 students a successful read still notifies (gate 7)', async () => {
    population = 2000;
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(2000);
    expect(dispatch).toHaveBeenCalled();
  });
});

describe('engine semantics are UNCHANGED — read safety only', () => {
  const src = () => readFileSync(join(process.cwd(), 'src/app/api/cron/decision-engine/route.ts'), 'utf8');

  it('the states owned by other crons are unchanged', () => {
    expect(src()).toContain("state === 'building_plan' || state === 'plan_ready' || state === 'onboarding_arc'");
  });
  it('the recovery branch still covers slipping/inactive/dark', () => {
    expect(src()).toContain("state === 'slipping' || state === 'inactive' || state === 'dark'");
  });
  it('the detector set and DAILY_CAP are unchanged', () => {
    const b = src();
    for (const d of ['detectRevisionDue', 'detectTopicEarned', 'detectMissionChanged', 'detectWeeklyEvolved']) {
      expect(b).toContain(d);
    }
    expect(b).toContain('DAILY_CAP');
  });
  it('budgets still split active vs recovery', () => {
    expect(src()).toContain("dailyBudget: state === 'active' ? BUDGET_ACTIVE : BUDGET_RECOVERY");
  });
  it('the 21-day report window and IST "today" are unchanged', () => {
    expect(src()).toContain('Date.now() - 21 * 86_400_000');
    expect(src()).toContain("new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })");
  });
  it('the dedup type list is still a literal enum set, not population-scaled', () => {
    expect(src()).toContain("'revision_due', 'topic_earned', 'mission_changed', 'weekly_evolved', 'inactive_recovery'");
  });
});
