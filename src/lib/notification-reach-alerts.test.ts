import { describe, it, expect } from 'vitest';
import { detectReachAnomalies, alertableSurfaces, type SurfaceWindow } from './notification-reach-alerts';

const W = (o: Partial<SurfaceWindow> = {}): SurfaceWindow => ({
  surface: 'android_pwa', capableStudents: 300,
  newSubscriptions: 30, prevNewSubscriptions: 30,
  verifiedEndpoints: 120, prevVerifiedEndpoints: 120,
  sendAttempted: 500, providerAccepted: 480, swReceived: 440,
  died: 5, prevDied: 5, ...o,
});

describe('the 10 August collapse — replayed', () => {
  it('fires P0 on the exact shape that went unnoticed for three weeks', () => {
    // Real production shape. iOS Safari PWA converted through July
    // (6 subscriptions, 13–23 Jul), then the App Store route shipped and
    // acquisition went to zero while the surface still had active students.
    const ios: SurfaceWindow = W({
      surface: 'ios_pwa', capableStudents: 200,
      newSubscriptions: 0, prevNewSubscriptions: 6,
    });
    const found = detectReachAnomalies([ios]);
    const stop = found.find((a) => a.kind === 'surface_acquisition_stopped');
    expect(stop, 'the 10 Aug collapse MUST fire').toBeDefined();
    expect(stop!.severity).toBe('P0');
    expect(stop!.stage, 'must name the broken stage, not just "notifications down"')
      .toBe('permission → subscription');
  });

  it('an overall average would have hidden it — per-surface is why this works', () => {
    // Android kept converting normally the whole time. Summed together the
    // funnel looks healthy, which is precisely why nobody saw it.
    const android = W({ surface: 'android_pwa', newSubscriptions: 30, prevNewSubscriptions: 28 });
    const ios = W({ surface: 'ios_pwa', capableStudents: 200, newSubscriptions: 0, prevNewSubscriptions: 6 });
    expect(detectReachAnomalies([android])).toEqual([]);
    expect(detectReachAnomalies([android, ios]).some((a) => a.surface === 'ios_pwa')).toBe(true);
  });
});

describe('it does not cry wolf', () => {
  it('a healthy funnel produces no alerts at all', () => {
    expect(detectReachAnomalies([W(), W({ surface: 'desktop_pwa' })])).toEqual([]);
  });

  it('a tiny surface cannot trip the acquisition alarm', () => {
    // 13 students swing wildly week to week. An alert that fires on noise gets
    // muted, which is worse than no alert.
    expect(detectReachAnomalies([W({ capableStudents: 13, newSubscriptions: 0, prevNewSubscriptions: 6 })]))
      .toEqual([]);
  });

  it('a surface that never converted does not "stop" converting', () => {
    expect(detectReachAnomalies([W({ newSubscriptions: 0, prevNewSubscriptions: 0 })])).toEqual([]);
  });

  it('rate checks stay silent below meaningful volume', () => {
    const low = W({ sendAttempted: 10, providerAccepted: 1, swReceived: 0 });
    expect(detectReachAnomalies([low]).some((a) => a.kind === 'provider_rejection_spike')).toBe(false);
  });

  it('the iOS wrapper is excluded before detection — it converts zero BY ARCHITECTURE', () => {
    // Alerting daily on a structurally incapable surface is exactly how an
    // alert channel becomes noise and gets ignored.
    const wrapper = W({ surface: 'ios_wrapper', capableStudents: 208, newSubscriptions: 0, prevNewSubscriptions: 4 });
    expect(detectReachAnomalies([wrapper]).length, 'raw detection would fire').toBeGreaterThan(0);
    expect(alertableSurfaces([wrapper]), 'but it must be filtered out first').toEqual([]);
  });
});

describe('every stage of the chain has its own alarm', () => {
  it('reach falling is P0 and names the endpoint stage', () => {
    const a = detectReachAnomalies([W({ verifiedEndpoints: 90, prevVerifiedEndpoints: 120 })]);
    const hit = a.find((x) => x.kind === 'reach_dropped');
    expect(hit?.severity).toBe('P0');
    expect(hit?.stage).toBe('healthy endpoint');
  });

  it('reachable students receiving nothing is P0 — the cron/eligibility side', () => {
    const a = detectReachAnomalies([W({ sendAttempted: 0, providerAccepted: 0, swReceived: 0 })]);
    expect(a.find((x) => x.kind === 'sends_stopped')?.stage).toBe('eligible send');
  });

  it('provider rejection and receipt collapse are separate alarms', () => {
    const rej = detectReachAnomalies([W({ sendAttempted: 500, providerAccepted: 200, swReceived: 190 })]);
    expect(rej.some((x) => x.kind === 'provider_rejection_spike')).toBe(true);
    const rec = detectReachAnomalies([W({ sendAttempted: 500, providerAccepted: 480, swReceived: 100 })]);
    expect(rec.find((x) => x.kind === 'receipt_rate_dropped')?.stage).toBe('service worker receive');
  });

  it('UNMEASURED send data never raises an alarm — null is not zero', () => {
    // A failed query must not be able to page someone at 3am claiming nothing
    // was sent. Distrust earned once is not recovered.
    const unmeasured = W({ sendAttempted: null, providerAccepted: null, swReceived: null });
    expect(detectReachAnomalies([unmeasured])).toEqual([]);
  });

  it('a death spike is caught', () => {
    expect(detectReachAnomalies([W({ died: 40, prevDied: 5 })]).some((x) => x.kind === 'death_spike')).toBe(true);
  });

  it('every anomaly names a stage — none says only "notifications are down"', () => {
    const all = detectReachAnomalies([
      W({ newSubscriptions: 0, prevNewSubscriptions: 20 }),
      W({ surface: 'desktop_pwa', verifiedEndpoints: 10, prevVerifiedEndpoints: 100, sendAttempted: 0, providerAccepted: 0 }),
    ]);
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.stage.length, `${a.kind} has no stage`).toBeGreaterThan(3);
      expect(a.detail).toContain(a.surface);
    }
  });
});
