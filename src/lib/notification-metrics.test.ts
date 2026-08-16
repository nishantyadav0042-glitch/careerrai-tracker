import { describe, it, expect } from 'vitest';
import { METRIC_DEFINITIONS, computeReachabilitySnapshot } from './notification-metrics';

describe('METRIC_DEFINITIONS — the one canonical registry, every metric fully specified', () => {
  it('every metric has all required fields, none blank', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(def.name, `${key}.name`).toBe(key);
      expect(def.formula, `${key}.formula`).toBeTruthy();
      expect(def.sourceTable, `${key}.sourceTable`).toBeTruthy();
      expect(def.denominator, `${key}.denominator`).toBeTruthy();
      expect(def.timezone, `${key}.timezone`).toBeTruthy();
      expect(def.window, `${key}.window`).toBeTruthy();
      expect(def.knownLimitations, `${key}.knownLimitations`).toBeTruthy();
    }
  });

  it('covers every metric the founder\'s spec named', () => {
    const required = [
      'permission_granted', 'active_subscription', 'reachable', 'provider_dead', 'recovery_required',
      'eligible', 'send_attempted', 'provider_accepted', 'provider_failed', 'device_received',
      'delivery_unknown', 'clicked', 'app_opened', 'action_completed', 'duplicate_suppressed',
      'untracked_send', 'consent_violation',
    ];
    for (const name of required) expect(METRIC_DEFINITIONS, name).toHaveProperty(name);
  });

  it('action_completed is explicit about never claiming "acted"', () => {
    expect(METRIC_DEFINITIONS.action_completed.knownLimitations).toMatch(/acted/i);
  });
});

describe('computeReachabilitySnapshot — the single source dashboards must call', () => {
  function fakeAdmin(profiles: Record<string, unknown>[]) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: () => ({
              not: () => Promise.resolve({ data: profiles }),
            }),
          }),
        }),
      }),
    };
  }

  it('reachable = permission_granted AND active_subscription, exactly', async () => {
    const admin = fakeAdmin([
      { notif_prefs: { push: true }, push_subscription: { x: 1 }, push_died_at: null, push_recovery_attempted_at: null, push_recovery_last_error: null },
      { notif_prefs: { push: true }, push_subscription: null, push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: null, push_recovery_last_error: null },
      { notif_prefs: { push: false }, push_subscription: null, push_died_at: null, push_recovery_attempted_at: null, push_recovery_last_error: null },
    ]);
    const snap = await computeReachabilitySnapshot(admin, () => '2026-08-16T15:00:00Z');
    expect(snap.totalStudents).toBe(3);
    expect(snap.permissionGranted).toBe(2);
    expect(snap.reachable).toBe(1);
    expect(snap.providerDead).toBe(1);
    expect(snap.recoveryRequired).toBe(1);
    expect(snap.reachablePct).toBe(50);
  });

  it('reachablePct is null (not NaN, not 0) when nobody has granted permission — never divide by zero silently', async () => {
    const admin = fakeAdmin([
      { notif_prefs: { push: false }, push_subscription: null, push_died_at: null, push_recovery_attempted_at: null, push_recovery_last_error: null },
    ]);
    const snap = await computeReachabilitySnapshot(admin, () => '2026-08-16T15:00:00Z');
    expect(snap.reachablePct).toBeNull();
  });

  it('recovery states are correctly broken out: required vs attempted vs failed vs recovered', async () => {
    const admin = fakeAdmin([
      { notif_prefs: { push: true }, push_subscription: null, push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: null, push_recovery_last_error: null }, // required
      { notif_prefs: { push: true }, push_subscription: null, push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: '2026-08-16T00:00:00Z', push_recovery_last_error: null }, // attempted (unknown outcome)
      { notif_prefs: { push: true }, push_subscription: null, push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: '2026-08-16T00:00:00Z', push_recovery_last_error: 'subscribe_threw:AbortError' }, // failed
      { notif_prefs: { push: true }, push_subscription: { x: 1 }, push_died_at: null, push_recovery_attempted_at: '2026-08-16T00:00:00Z', push_recovery_last_error: null }, // recovered
    ]);
    const snap = await computeReachabilitySnapshot(admin, () => '2026-08-16T15:00:00Z');
    expect(snap.recoveryRequired).toBe(1);
    expect(snap.recoveryAttempted).toBe(1);
    expect(snap.recoveryFailed).toBe(1);
    expect(snap.recovered).toBe(1);
  });
});
