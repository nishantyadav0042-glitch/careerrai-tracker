import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── B3b #4 — onboarding-morning: source failure messages NOBODY ───────────
//
// READ → DERIVED DECISION → SIDE EFFECT:
//   profiles      → who is a candidate            → gates everything
//   daily_reports → loggedDays.size, which decides
//                   BOTH whether to send AND
//                   `dayNumber = size + 1`        → the push, AND THE NUMBER
//                                                   INSIDE THE MESSAGE
//   notifications → "already sent this morning?"  → duplicate push
//
// The middle row is why this job needed migrating more than its send-count
// suggests. `loggedDays.size` is not only a gate — it becomes `dayNumber`, and
// `dayNumber` is rendered to the student as which day of the 7-day arc they are
// on. A partially-failed read does not merely under-send: it tells a student
// they are on day 2 when they are on day 5. That is an infrastructure failure
// becoming a student-facing CLAIM, which is precisely what the invariant
// forbids — and it is why "the read is chunked, so it is safe" is not enough.

const dispatch = vi.fn(() => Promise.resolve('sent'));
const sendDailyReminder = vi.fn(() => Promise.resolve());
const sendAdminAlert = vi.fn(() => Promise.resolve());

vi.mock('@/lib/notification-os', () => ({
  dispatch: (...a: unknown[]) => { void a; return dispatch(); },
  ACTIVATION_DAYS: [0, 1, 2, 3, 5, 7, 10, 14],
  activationCopy: () => ({ title: 't', body: 'b' }),
  BUDGET_ACTIVE: 3, BUDGET_SETUP: 3, dreamCollegeLabel: () => 'IIM',
}));
vi.mock('@/lib/notification-engine', () => ({ onboardingCopy: () => ({ title: 't', body: 'b' }) }));
vi.mock('@/lib/email', () => ({
  sendDailyReminder: () => sendDailyReminder(),
  sendAdminAlert: () => sendAdminAlert(),
}));
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, run: () => Promise<Response>) => run(),
}));

type Mode = 'ok' | 'error' | 'null-no-error' | 'throw';
let mode: Record<string, Mode> = {};
let population = 6;

const twoDaysAgo = () => new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

function studentRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, full_name: `Student ${i}`, email: `s${i}@example.test`,
    notif_prefs: {},
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    onboarding_completed: true,
    onboarding_last_activity_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    dream_colleges: null,
  }));
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const m: Mode = mode[table] ?? 'ok';
      let selected = '';
      const answer = () => {
        if (m === 'throw') throw new Error(`${table} exploded`);
        if (m === 'error') return Promise.resolve({ data: null, error: { message: `${table} timeout` } });
        if (m === 'null-no-error') return Promise.resolve({ data: null, error: null });
        if (table === 'profiles') return Promise.resolve({ data: studentRows(population), error: null });
        if (table === 'daily_reports') {
          // One past logged day each: inside the 7-day arc (size >= 1, < 7)
          // and not logged today, which is the state that SHOULD be messaged.
          void selected;
          return Promise.resolve({
            data: studentRows(population).map((s) => ({ student_id: s.id, report_date: twoDaysAgo() })),
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      };
      const chain: Record<string, unknown> = {};
      for (const k of ['eq', 'gte', 'lte', 'in', 'contains', 'limit', 'order', 'is', 'not']) {
        chain[k] = () => chain;
      }
      chain.select = (cols?: string) => { selected = cols ?? ''; return chain; };
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
  const url = 'https://x/api/cron/onboarding-morning';
  return POST({ nextUrl: new URL(url), url, method: 'POST', headers: new Headers() } as never);
}

beforeEach(() => {
  vi.resetModules();
  dispatch.mockClear(); sendDailyReminder.mockClear(); sendAdminAlert.mockClear();
  mode = {};
  population = 6;
});

const FAILURES: [string, Mode][] = [
  ['an explicit error', 'error'],
  ['data: null with NO error — the incident shape', 'null-no-error'],
  ['a thrown exception', 'throw'],
];

describe('any source unavailable → nobody is messaged', () => {
  for (const table of ['profiles', 'daily_reports', 'notifications']) {
    for (const [name, m] of FAILURES) {
      it(`${table}: ${name}`, async () => {
        mode = { [table]: m };
        const res = await run();
        const body = await res.json();
        expect(dispatch, `${table} failed and a push still went out`).not.toHaveBeenCalled();
        expect(sendDailyReminder).not.toHaveBeenCalled();
        expect(res.status).toBe(503);
        expect(body.ok).toBe(false);
        expect(body.skipped).toBe('source_unavailable');
        expect(body.sent).toBe(0);
      });
    }
  }

  it('at 2,000 students a failure still messages nobody (gate 7)', async () => {
    population = 2000;
    mode = { daily_reports: 'null-no-error' };
    const res = await run();
    expect(dispatch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });
});

describe('the job is not inert — positive controls', () => {
  it('with every source available it still messages students', async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(dispatch).toHaveBeenCalled();
    expect(body.sent).toBeGreaterThan(0);
  });

  it('at 2,000 students a successful read still messages (gate 7)', async () => {
    population = 2000;
    const res = await run();
    expect(res.status).toBe(200);
    expect(dispatch).toHaveBeenCalled();
  });
});

describe('staging semantics are UNCHANGED — read safety only', () => {
  const src = () => readFileSync(join(process.cwd(), 'src/app/api/cron/onboarding-morning/route.ts'), 'utf8');

  it('the 14-day candidate window is intact', () => {
    expect(src()).toContain('Date.now() - 14 * 86_400_000');
  });
  it('students with no logs are still left to the activation ladder', () => {
    expect(src()).toContain('loggedDays.size === 0');
  });
  it('graduation is still at 7 logged days', () => {
    expect(src()).toContain('loggedDays.size >= 7');
  });
  it('the day number is still size + 1 — the claim inside the message', () => {
    expect(src()).toContain('loggedDays.size + 1');
  });
  it('"today" is still the IST calendar date', () => {
    expect(src()).toContain("new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })");
  });
});
