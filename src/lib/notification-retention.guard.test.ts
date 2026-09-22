import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTIFICATION_RETENTION_RULES, NOTIFICATION_RETENTION_ENABLED_KEY,
  NOTIFICATION_SWEEP_MIN_KEEP_DAYS, SWEEPABLE_COMPANION_TYPES,
  BELL_PAGE_SIZE, STUDENT_360_PUSHED_LIMIT, notificationSweepEnabled,
} from './notification-retention';
import { COMPANION_SLOTS, companionType } from './companion';
import { SWEEP_BATCH, runRetentionSweep, notificationCutoffIso } from './telemetry-retention';

// ── DELETING WHAT A STUDENT CAN SEE ─────────────────────────────────────────
//
// The telemetry sweep destroys instrumentation; the worst it can do is blind
// us. This one destroys rows in a student's notification tray, and the table
// it works in also holds payment receipts, session reminders and buddy
// escalations. So the question these tests ask is narrower and harder than
// "does the sweep work": can this code, or any future edit of it, reach a row
// that is not a Study Companion notification?
//
// The answer must be no in TWO places independently — here and in the
// database — because a guard that lives only in the caller is a guard that a
// bad deploy removes.

vi.mock('./server-config', () => ({ getServerConfig: vi.fn(async () => null) }));
const { getServerConfig } = await import('./server-config');

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = read('supabase/migrations/20260922a_notification_retention.sql');

describe('what may be swept', () => {
  it('sweeps companion types and nothing else', () => {
    for (const rule of NOTIFICATION_RETENTION_RULES) {
      expect(rule.types.length, 'a rule with no types is a bug, not "sweep everything"').toBeGreaterThan(0);
      for (const t of rule.types) {
        expect(t, `${t} is not a companion slot`).toMatch(/^companion_[a-z]+$/);
      }
    }
  });

  it('never reaches a notification that carries money, a commitment or a person', () => {
    // Every other type live in production on 22 Sep 2026. None of these is a
    // cadence nudge: each one is a receipt, an appointment, an escalation or a
    // human message, and deleting one destroys something the student or the
    // team is entitled to still have.
    const NEVER = [
      'founder_ping', 'buddy_evening', 'push_recovery_digested', 'plan_extended',
      'activation', 'daily_insight', 'onboarding_morning', 'inactive_recovery',
      'onboarding_evening', 'daily_heartbeat', 'new_signup', 'log_recovery',
      'whatsapp_backfill', 'builder_recovery', 'welcome_verify', 'red_flag',
      'onboarding_done', 'buddy_brief', 'push_death_alerted', 'escalation',
      'chat', 'revision_due', 'weekly_digest', 'student_logged', 'timetable_refresh',
      'founder_alert_sent', 'session_reminder', 'session_tomorrow', 'renewal_reminder',
    ];
    const sweepable = new Set(NOTIFICATION_RETENTION_RULES.flatMap((r) => [...r.types]));
    for (const t of NEVER) {
      expect(sweepable.has(t), `${t} is not a Study Companion slot and must never be swept`).toBe(false);
    }
  });

  it('accounts for every companion slot, live and retired', () => {
    // Not because an unlisted slot would be deleted — keep-by-default means it
    // would be KEPT, which is the safe failure. This fails when a slot is
    // renamed or added, so nobody discovers months later that the sweep has
    // been quietly missing a quarter of the cadence.
    const sweepable = new Set(NOTIFICATION_RETENTION_RULES.flatMap((r) => [...r.types]));
    for (const slot of COMPANION_SLOTS) {
      expect(sweepable.has(companionType(slot)), `${slot} is a companion slot with no retention rule`).toBe(true);
    }
    expect([...sweepable].sort()).toEqual([...SWEEPABLE_COMPANION_TYPES].sort());
  });

  it('covers both delivery halves exactly once', () => {
    expect(NOTIFICATION_RETENTION_RULES.map((r) => r.delivery).sort()).toEqual(['pushed', 'unpushed']);
  });
});

describe('the windows survive their readers', () => {
  it('every window clears the database rail', () => {
    for (const rule of NOTIFICATION_RETENTION_RULES) {
      expect(rule.keepDays).toBeGreaterThanOrEqual(NOTIFICATION_SWEEP_MIN_KEEP_DAYS);
    }
  });

  it("the unpushed window is several times the student's bell", () => {
    // The bell shows BELL_PAGE_SIZE rows with no time filter. Four companion
    // slots a day means that page is BELL_PAGE_SIZE / 4 days deep.
    const bellDays = BELL_PAGE_SIZE / 4;
    const unpushed = NOTIFICATION_RETENTION_RULES.find((r) => r.delivery === 'unpushed')!;
    expect(unpushed.keepDays).toBeGreaterThanOrEqual(bellDays * 2);
  });

  it('the bell still reads what this window was sized against', () => {
    // If someone widens the bell to 100 rows, the 14-day window stops being
    // three times its depth and this fails HERE rather than in production.
    const bell = read('src/components/notification-bell.tsx');
    expect(bell, `notification-bell no longer limits to ${BELL_PAGE_SIZE}`).toContain(`.limit(${BELL_PAGE_SIZE})`);
  });

  it('student-360 still reads pushed rows only, and still caps at the limit we sized for', () => {
    const s360 = read('src/lib/student-360.ts');
    expect(s360).toContain(`.limit(${STUDENT_360_PUSHED_LIMIT})`);
    expect(s360, 'student-360 now reads unpushed rows too — the 14-day window is no longer safe for it')
      .toContain("not('pushed_at', 'is', null)");
  });

  it('the pushed window outlives every analytics reader', () => {
    // momentum, mission-queue, notification-health and call-queue all read
    // seven days or less. 45 is six times the longest of them.
    const pushed = NOTIFICATION_RETENTION_RULES.find((r) => r.delivery === 'pushed')!;
    expect(pushed.keepDays).toBeGreaterThanOrEqual(7 * 6);
  });

  it('every rule says out loud what reader it survives', () => {
    for (const rule of NOTIFICATION_RETENTION_RULES) {
      expect(rule.because.length, 'a window without a stated reader is a guess').toBeGreaterThan(40);
    }
  });
});

describe('the database keeps its own rails', () => {
  it('refuses a type that is not a companion slot', () => {
    expect(MIGRATION).toMatch(/\^companion_\[a-z\]\+\$/);
    expect(MIGRATION).toContain('is not a companion type and may never be swept');
  });

  it('requires an explicit type list', () => {
    expect(MIGRATION).toContain('an explicit type list is required');
  });

  it('requires the delivery half to be named', () => {
    expect(MIGRATION).toMatch(/p_delivery not in \('pushed', 'unpushed'\)/);
  });

  it('refuses a cutoff younger than the policy minimum', () => {
    expect(MIGRATION).toContain(`interval '${NOTIFICATION_SWEEP_MIN_KEEP_DAYS} days'`);
  });

  it('never deletes a row the decision engine still references', () => {
    // decision_log's FK is NO ACTION: one referenced row would raise and take
    // the whole batch with it, so this is both a correctness and a liveness rail.
    expect(MIGRATION).toMatch(/not exists \(select 1 from public\.decision_log/);
  });

  it('is service_role only', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(MIGRATION).toContain(`from ${role};`);
    }
    expect(MIGRATION).toContain('grant execute on function public.sweep_notifications(text[], text, timestamptz, integer) to service_role;');
  });
});

describe('the sweep itself', () => {
  const calls: Record<string, unknown>[] = [];
  const db = (perCall: number[]) => {
    let i = 0;
    const count = () => {
      const q = Promise.resolve({ count: 11, error: null }) as never as Record<string, unknown>;
      for (const m of ['lt', 'in', 'is', 'not']) (q as never as Record<string, unknown>)[m] = () => q;
      return q;
    };
    return {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, ...args });
        return { data: perCall[i++] ?? 0, error: null };
      },
      from: () => ({ select: count }),
    } as never;
  };
  const notifCalls = () => calls.filter((c) => c.fn === 'sweep_notifications');

  beforeEach(() => { calls.length = 0; vi.mocked(getServerConfig).mockReset(); });

  /** Telemetry engine on (absent = on), notifications per the argument. */
  const config = (notifications: string | null) =>
    vi.mocked(getServerConfig).mockImplementation(async (key: string) =>
      key === NOTIFICATION_RETENTION_ENABLED_KEY ? notifications : null);

  it('is off until someone turns it on', async () => {
    expect(notificationSweepEnabled(null)).toBe(false);
    expect(notificationSweepEnabled('')).toBe(false);
    expect(notificationSweepEnabled('off')).toBe(false);
    expect(notificationSweepEnabled('false')).toBe(false);
    expect(notificationSweepEnabled('on')).toBe(true);
    expect(notificationSweepEnabled(' TRUE ')).toBe(true);
  });

  it('an absent switch deletes no notification — the telemetry sweep still runs', async () => {
    config(null);
    const r = await runRetentionSweep(db([100]));
    expect(notifCalls(), 'the switch is absent, so nothing in the tray may be touched').toEqual([]);
    expect(r.lines.some((l) => l.table === 'notifications')).toBe(false);
    expect(calls.length, 'the telemetry engine must be unaffected').toBeGreaterThan(0);
  });

  it('passes the type list, the delivery half and a cutoff of the right age', async () => {
    config('on');
    const now = new Date('2026-09-22T00:00:00Z');
    await runRetentionSweep(db([0]), { now });
    for (const rule of NOTIFICATION_RETENTION_RULES) {
      const call = notifCalls().find((c) => c.p_delivery === rule.delivery);
      expect(call, `the ${rule.delivery} rule must reach the database`).toBeDefined();
      expect(call!.p_types).toEqual(rule.types);
      const ageDays = (now.getTime() - Date.parse(call!.p_cutoff as string)) / 86_400_000;
      expect(ageDays).toBe(rule.keepDays);
      expect(call!.p_limit).toBe(SWEEP_BATCH);
    }
  });

  it('a dry run counts and deletes nothing', async () => {
    config('on');
    const r = await runRetentionSweep(db([100]), { dryRun: true });
    expect(notifCalls(), 'a dry run must never call the delete function').toEqual([]);
    const notif = r.lines.filter((l) => l.table === 'notifications');
    expect(notif).toHaveLength(NOTIFICATION_RETENTION_RULES.length);
    expect(notif.every((l) => l.deleted === 11)).toBe(true);
  });

  it('stops a rule as soon as a batch comes back short', async () => {
    config('on');
    await runRetentionSweep(db([0, 0, 0, SWEEP_BATCH, 5]));
    expect(notifCalls().filter((c) => c.p_delivery === 'unpushed')).toHaveLength(2);
  });

  it('reports `more` when the budget runs out, so the next run resumes', async () => {
    config('on');
    const r = await runRetentionSweep(db(Array(40).fill(SWEEP_BATCH)), { maxBatches: 2 });
    const line = r.lines.find((l) => l.table === 'notifications' && l.delivery === 'unpushed')!;
    expect(line.more).toBe(true);
    expect(line.deleted).toBe(2 * SWEEP_BATCH);
  });

  it('surfaces an error instead of reporting a clean sweep', async () => {
    config('on');
    const failing = {
      rpc: async (fn: string) => (fn === 'sweep_notifications'
        ? { data: null, error: { message: 'permission denied' } }
        : { data: 0, error: null }),
      from: () => ({ select: () => {
        const q = Promise.resolve({ count: 0, error: null }) as never as Record<string, unknown>;
        for (const m of ['lt', 'in', 'is', 'not']) q[m] = () => q;
        return q;
      } }),
    } as never;
    const r = await runRetentionSweep(failing);
    expect(r.ok).toBe(false);
    expect(r.lines.find((l) => l.table === 'notifications')!.error).toBe('permission denied');
  });

  it('notificationCutoffIso is the plain subtraction it looks like', () => {
    const now = Date.parse('2026-09-22T12:00:00Z');
    expect(notificationCutoffIso(
      { types: ['companion_log'], delivery: 'unpushed', keepDays: 14, because: 'x' }, now,
    )).toBe('2026-09-08T12:00:00.000Z');
  });
});
