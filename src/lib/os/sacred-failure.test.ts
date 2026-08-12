import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { burstsFrom, SACRED_FAILURE_THRESHOLD } from './sacred-failure';

// ── The alarm that should have fired on 12 August ───────────────────────────
//
// A student pressed "Save log" roughly 25 times into an Internal Server Error
// at 22:53 IST. Nothing alerted anyone. The founder found it from a screenshot.
//
// These tests replay that night: the same failure shape, and the assertion that
// the alarm fires — plus the noise cases where it must stay quiet, because a
// pager that cries wolf gets muted, and a muted pager is worse than none.

const at = (min: number) => new Date(Date.UTC(2026, 7, 12, 17, min, 0)).toISOString();

const logFail = (min: number, student: string) => ({
  fingerprint: 'sacred:log_daily',
  message: 'invalid input syntax for type integer: "4.6"',
  student_id: student,
  created_at: at(min),
});

describe('the 12 August night, replayed', () => {
  it('FIRES on the real burst — Abhishek retrying into a 500', () => {
    const rows = [27, 27, 28, 28, 28].map((m, i) => logFail(m, `abhishek`));
    const [burst] = burstsFrom(rows);
    expect(burst).toBeDefined();
    expect(burst.action).toBe('log_daily');
    expect(burst.count).toBe(5);
    expect(burst.studentsHit).toBe(1);
    expect(burst.lastMessage).toContain('4.6');
  });

  it('fires on the SECOND failure — about twenty seconds in, not the next morning', () => {
    expect(burstsFrom([logFail(27, 'a'), logFail(27, 'b')])).toHaveLength(1);
  });

  it('reports how many DISTINCT students are hit — 1 is unlucky, 5 is an outage', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((s, i) => logFail(20 + i, s));
    expect(burstsFrom(rows)[0].studentsHit).toBe(5);
  });
});

describe('it stays quiet when it should', () => {
  it('one lone failure is not an alarm — a dead phone is not an outage', () => {
    expect(burstsFrom([logFail(27, 'a')])).toEqual([]);
    expect(SACRED_FAILURE_THRESHOLD).toBe(2);
  });

  it('ignores client-side and unrelated rows entirely', () => {
    const noise = [
      { fingerprint: 'TypeError:undefined', message: 'x', student_id: 'a', created_at: at(1) },
      { fingerprint: null, message: 'y', student_id: 'b', created_at: at(2) },
      { fingerprint: 'sacred:not_a_real_action', message: 'z', student_id: 'c', created_at: at(3) },
    ];
    expect(burstsFrom(noise)).toEqual([]);
  });

  it('does not merge different actions into one false alarm', () => {
    const rows = [
      logFail(10, 'a'),
      { fingerprint: 'sacred:payment_order', message: 'razorpay down', student_id: 'b', created_at: at(11) },
    ];
    // One of each — neither reaches the threshold on its own.
    expect(burstsFrom(rows)).toEqual([]);
  });

  it('separates simultaneous outages so the founder sees BOTH', () => {
    const rows = [
      logFail(10, 'a'), logFail(11, 'b'),
      { fingerprint: 'sacred:payment_order', message: 'razorpay down', student_id: 'c', created_at: at(12) },
      { fingerprint: 'sacred:payment_order', message: 'razorpay down', student_id: 'd', created_at: at(13) },
    ];
    const bursts = burstsFrom(rows);
    expect(bursts.map((b) => b.action).sort()).toEqual(['log_daily', 'payment_order']);
  });
});

describe('the wiring is real, not just a helper nobody calls', () => {
  it('the three sacred routes record their failures', () => {
    for (const f of [
      'src/app/api/logging/log-daily/route.ts',
      'src/app/api/payments/create-order/route.ts',
      'src/app/api/auth/verify-phone-otp/route.ts',
    ]) {
      expect(readFileSync(f, 'utf8'), `${f} does not report its failures`).toContain('recordSacredFailure');
    }
  });

  it('the alert engine actually reads them', () => {
    const guard = readFileSync('src/lib/os/sacred-guard.ts', 'utf8');
    expect(guard).toContain('burstsFrom');
    expect(guard).toContain("eq('source', 'server')");
    // Critical, so it interrupts rather than waiting for the daily batch.
    expect(guard).toContain("id: `sacred-fail:");
  });

  it('recording a failure can never break the request it is reporting on', () => {
    const src = readFileSync('src/lib/os/sacred-failure.ts', 'utf8');
    // The whole insert sits inside try/catch, and callers use `void`.
    expect(src).toMatch(/try \{[\s\S]*client_errors[\s\S]*\} catch \{/);
    const route = readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8');
    expect(route).toContain('void recordSacredFailure(');
  });
});
