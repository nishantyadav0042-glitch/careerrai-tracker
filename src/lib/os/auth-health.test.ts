import { describe, it, expect } from 'vitest';
import {
  classifyAuthWindow, authException, AUTH_WINDOW_MINUTES, AUTH_MIN_SAMPLE,
} from '@/lib/os/auth-health';

const NOW = Date.parse('2025-09-04T18:30:00.000Z');
const w = (requested: number, verified: number) => ({ requested, verified, windowMinutes: AUTH_WINDOW_MINUTES });

describe('classifyAuthWindow', () => {
  // The regression this whole module exists for. Incident #70: 4 Sep, 21 codes
  // requested, 0 verified, six hours before anyone noticed. If this ever stops
  // returning 'outage', the alarm is gone again.
  it('calls the 4 September shape an outage', () => {
    expect(classifyAuthWindow(w(21, 0))).toBe('outage');
  });

  it('stays quiet when too few students tried to conclude anything', () => {
    expect(classifyAuthWindow(w(AUTH_MIN_SAMPLE - 1, 0))).toBe('idle');
    expect(classifyAuthWindow(w(0, 0))).toBe('idle');
  });

  it('fires the moment the sample is big enough and nothing works', () => {
    expect(classifyAuthWindow(w(AUTH_MIN_SAMPLE, 0))).toBe('outage');
  });

  it('does not fire on a normal night', () => {
    expect(classifyAuthWindow(w(23, 20))).toBe('healthy');
    // One student giving up out of six is life, not an incident.
    expect(classifyAuthWindow(w(6, 5))).toBe('healthy');
  });

  it('does not cry degraded on a small sample with one straggler', () => {
    // 1/10 is a terrible rate but ten attempts cannot tell a broken gateway
    // from one confused student retrying — below the degraded sample bar.
    expect(classifyAuthWindow(w(10, 1))).toBe('healthy');
  });

  it('calls a collapsed-but-not-dead rate degraded', () => {
    expect(classifyAuthWindow(w(40, 4))).toBe('degraded');
    expect(classifyAuthWindow(w(40, 12))).toBe('healthy');
  });
});

describe('authException', () => {
  it('returns nothing when there is nothing to say', () => {
    expect(authException(w(30, 27), NOW)).toBeNull();
    expect(authException(w(2, 0), NOW)).toBeNull();
  });

  it('escalates an outage as critical, founder-owned, with no fake self-heal', () => {
    const e = authException(w(21, 0), NOW)!;
    expect(e.code).toBe('auth_otp_outage');
    expect(e.severity).toBe('critical');
    expect(e.owner).toBe('founder');
    expect(e.domain).toBe('system');
    expect(e.recovery).toEqual({ attempted: false, status: 'none' });
  });

  it('degradation is high, not critical — it does not wake anyone at 3am', () => {
    expect(authException(w(40, 4), NOW)!.severity).toBe('high');
  });

  it('carries the counts as evidence and drills down to the exact events', () => {
    const e = authException(w(21, 0), NOW)!;
    expect(e.evidence.requested).toBe(21);
    expect(e.evidence.verified).toBe(0);
    // SCALE-CONTRACT rule 6: a count that cannot be drilled into is a chart.
    expect(e.destination).toContain('/admin/analytics');
    expect(e.evidence.since).toBe('2025-09-04T17:30:00.000Z');
    expect(decodeURIComponent(e.destination)).toContain('2025-09-04T17:30');
  });

  it('keeps one identity across recomputes of the same ongoing outage', () => {
    const a = authException(w(21, 0), NOW);
    const b = authException(w(34, 0), NOW + 14 * 60 * 1000);
    expect(a!.id).toBe(b!.id);
  });

  it('never puts a phone number or a code in the escalation text', () => {
    const e = authException(w(21, 0), NOW)!;
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/\+?91\d{10}/);
    expect(text).not.toMatch(/\b\d{6}\b/);
  });
});
