import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import {
  RETENTION_RULES, WRITE_ONLY_EVENTS, SCREEN_EVENTS, PERF_READER_DAYS,
  RETENTION_KILL_SWITCH_KEY, SWEEP_BATCH, cutoffIso, runRetentionSweep,
} from './telemetry-retention';
import { BUDDY_INTEREST_LOOKBACK_DAYS } from './os/buddy-interest';

// ── DELETING PRODUCTION DATA, GUARDED ───────────────────────────────────────
//
// This sweep is the only code in the repo that destroys rows on purpose. The
// mistake it must never make is not "deleted too much telemetry" — it is
// deleting a row the LEARNING LOOP reads. `app_open` feeds the activation
// funnel that compares July's cohort to September's with no time filter at
// all; ageing those rows out would break the company's one measurement
// silently, and nothing would go red for months.
//
// So these tests are adversarial about one thing above all: what may be swept.

vi.mock('./server-config', () => ({ getServerConfig: vi.fn(async () => null) }));
const { getServerConfig } = await import('./server-config');

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Every source file's code, comments stripped, keyed by path. */
const SOURCES: [string, string][] = walk(SRC).map((p) => [p, codeOnly(readFileSync(p, 'utf8'))]);

describe('what may be swept', () => {
  it('never sweeps an event the learning loop reads', () => {
    // The activation funnel (os/activation-funnel.ts) reads app_open across ALL
    // of history on purpose. Notification reach, the OTP forensics and the
    // Daily Pick watch read the others. None of them may ever appear in a rule.
    const LEARNING_LOOP = [
      'app_open', 'push_enabled', 'push_click', 'push_ask_shown', 'push_setup_guidance_shown',
      'daily_slot_served', 'daily_pick_open', 'auth_otp_requested', 'auth_otp_verified',
      'pay_checkout_opened', 'purchase_attributed', 'completion_write',
    ];
    const sweepable = new Set(RETENTION_RULES.flatMap((r) => [...(r.events ?? [])]));
    for (const e of LEARNING_LOOP) {
      expect(sweepable.has(e), `${e} feeds a measurement and must never be swept`).toBe(false);
    }
  });

  it('never sweeps student_events wholesale — a rule must name its events', () => {
    // `events: null` means "every row in this table". That is fine for
    // perf_events and catastrophic for student_events.
    for (const rule of RETENTION_RULES) {
      if (rule.table === 'student_events') {
        expect(rule.events, 'student_events rules must be explicit').not.toBeNull();
        expect((rule.events ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it('the events it calls write-only really have no reader', () => {
    // THE POINT OF THIS TEST. If someone starts reading `tap` next month, the
    // sweep would delete the data underneath them two weeks later. This fails
    // the moment a query mentions one of these names.
    //
    // A READER is a file that QUERIES the table and names the event — that is
    // the thing the sweep can break. Emitting the event is not reading it, so
    // the components that fire `tap` are irrelevant here; what matters is
    // whether anything selects on it. Files that only insert are excluded by
    // name, and `?` deliberately over-reports: a false offender costs a
    // conversation, a missed one costs the data.
    const WRITERS = ['api/events/track', 'api/timetable/parse', 'api/routine/', 'lib/activate-payment.ts'];
    const SELF = ['lib/journey.ts', 'os/timeline.ts', 'telemetry-retention.ts'];
    const offenders: string[] = [];
    for (const event of WRITE_ONLY_EVENTS) {
      for (const [path, code] of SOURCES) {
        const rel = path.replace(/\\/g, '/');
        if ([...WRITERS, ...SELF].some((a) => rel.includes(a))) continue;
        if (!code.includes("from('student_events')")) continue;
        if (new RegExp(`['"\`]${event}['"\`]`).test(code)) offenders.push(`${event} in ${path.replace(SRC, 'src')}`);
      }
    }
    expect(offenders, `these events now have a reader — remove them from WRITE_ONLY_EVENTS before the sweep eats the data:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('keeps every window longer than the reader it has to survive', () => {
    const screens = RETENTION_RULES.find((r) => r.events === SCREEN_EVENTS);
    expect(screens, 'the screen rule must exist').toBeDefined();
    // Imported, not copied: widen buddy-interest and this fails here rather
    // than going missing in production.
    expect(screens!.keepDays).toBeGreaterThan(BUDDY_INTEREST_LOOKBACK_DAYS + 14);

    const perf = RETENTION_RULES.find((r) => r.table === 'perf_events');
    expect(perf!.keepDays).toBeGreaterThan(PERF_READER_DAYS + 7);
  });

  it('every rule carries a stated reason', () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.because.length, `${rule.table} rule needs a reason`).toBeGreaterThan(30);
      expect(rule.keepDays).toBeGreaterThanOrEqual(14);
    }
  });
});

describe('the rails live in the database, not the caller', () => {
  const sql = codeOnly(readFileSync(join(process.cwd(), 'supabase/migrations/20260908a_telemetry_retention.sql'), 'utf8'));

  it('refuses any table but the two telemetry tables', () => {
    expect(sql).toMatch(/is not sweepable/);
    expect(sql).toMatch(/p_table = 'student_events'/);
    expect(sql).toMatch(/p_table = 'perf_events'/);
  });

  it('refuses to sweep student_events without an explicit event list', () => {
    expect(sql).toMatch(/requires an explicit event list/);
  });

  it('refuses a cutoff younger than a week', () => {
    expect(sql).toMatch(/interval '7 days'/);
    expect(sql).toMatch(/cutoff must be at least 7 days old/);
  });

  it('is service_role only', () => {
    expect(sql).toMatch(/revoke all on function public\.sweep_telemetry[^;]*from anon/);
    expect(sql).toMatch(/revoke all on function public\.sweep_telemetry[^;]*from authenticated/);
    expect(sql).toMatch(/grant execute on function public\.sweep_telemetry[^;]*to service_role/);
  });

  it('pins search_path, as a security definer function must', () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path/);
  });
});

describe('the sweep itself', () => {
  const calls: Record<string, unknown>[] = [];
  const db = (perCall: number[]) => {
    let i = 0;
    return {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, ...args });
        return { data: perCall[i++] ?? 0, error: null };
      },
      from: () => ({
        select: () => ({
          lt: () => Object.assign(Promise.resolve({ count: 7, error: null }), { in: async () => ({ count: 7, error: null }) }),
        }),
      }),
    } as never;
  };

  beforeEach(() => { calls.length = 0; vi.mocked(getServerConfig).mockResolvedValue(null); });

  it('the kill switch stops it dead', async () => {
    vi.mocked(getServerConfig).mockResolvedValue('off');
    const r = await runRetentionSweep(db([100]));
    expect(r.state).toBe('ENGINE_DISABLED');
    expect(calls, 'nothing may be deleted while the switch is off').toEqual([]);
    expect(RETENTION_KILL_SWITCH_KEY).toBe('TELEMETRY_RETENTION_ENABLED');
  });

  it('a dry run deletes nothing', async () => {
    const r = await runRetentionSweep(db([100]), { dryRun: true });
    expect(r.state).toBe('DRY_RUN');
    expect(calls, 'a dry run must never call the delete function').toEqual([]);
    expect(r.deleted).toBe(7 * RETENTION_RULES.length);
  });

  it('stops a rule as soon as a batch comes back short', async () => {
    const r = await runRetentionSweep(db([SWEEP_BATCH, 5]));
    const first = calls.filter((c) => c.p_table === RETENTION_RULES[0].table && c.p_events === RETENTION_RULES[0].events);
    expect(first).toHaveLength(2);
    expect(r.lines[0].deleted).toBe(SWEEP_BATCH + 5);
    expect(r.lines[0].more, 'it finished, so there is no more').toBe(false);
  });

  it('reports `more` when the budget runs out, so the next run resumes', async () => {
    const r = await runRetentionSweep(db(Array(20).fill(SWEEP_BATCH)), { maxBatches: 3 });
    expect(r.lines[0].more).toBe(true);
    expect(r.lines[0].deleted).toBe(3 * SWEEP_BATCH);
  });

  it('passes the event list and a cutoff of the right age', async () => {
    const now = new Date('2026-09-08T00:00:00Z');
    await runRetentionSweep(db([0]), { now });
    for (const [i, rule] of RETENTION_RULES.entries()) {
      const call = calls.find((c) => c.p_table === rule.table && c.p_events === (rule.events ?? null));
      expect(call, `rule ${i} must reach the database`).toBeDefined();
      const ageDays = (now.getTime() - Date.parse(call!.p_cutoff as string)) / 86_400_000;
      expect(ageDays).toBe(rule.keepDays);
    }
  });

  it('surfaces an error instead of reporting a clean sweep', async () => {
    const failing = {
      rpc: async () => ({ data: null, error: { message: 'permission denied' } }),
      from: () => ({ select: () => ({ lt: () => Object.assign(Promise.resolve({ count: 0, error: null }), { in: async () => ({ count: 0, error: null }) }) }) }),
    } as never;
    const r = await runRetentionSweep(failing);
    expect(r.ok).toBe(false);
    expect(r.lines[0].error).toBe('permission denied');
  });

  it('cutoffIso is the plain subtraction it looks like', () => {
    const now = Date.parse('2026-09-08T12:00:00Z');
    expect(cutoffIso({ table: 'perf_events', events: null, keepDays: 21, because: 'x' }, now))
      .toBe('2026-08-18T12:00:00.000Z');
  });
});
