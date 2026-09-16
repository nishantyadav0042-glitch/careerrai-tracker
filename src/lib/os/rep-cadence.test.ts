import { describe, it, expect } from 'vitest';
import {
  readCadence, readDay, burstReason, cadenceException,
  IMPOSSIBLE_GAP_SECONDS, BURST_RATIO, BURST_MIN_ROWS,
} from './rep-cadence';

/** n rows spaced `gapSeconds` apart, starting at a fixed instant. */
const spaced = (n: number, gapSeconds: number, channel = 'whatsapp', startMs = 1_757_000_000_000) =>
  Array.from({ length: n }, (_, i) => ({ atMs: startMs + i * gapSeconds * 1000, channel }));

describe('a record logged faster than the act it claims', () => {
  // ── THE REAL BURST, 8 Sep 2026 ────────────────────────────────────────────
  //
  // 19:27:45 → 19:29:51: twenty-two WhatsApp rows, gaps of 3–6 seconds, one
  // template text across all of them. These are the exact observed gaps.
  it('catches the 8 Sep WhatsApp burst', () => {
    const gaps = [5, 4, 6, 4, 9, 4, 6, 5, 4, 5, 15, 6, 16, 8, 6, 3, 3, 4, 5, 4, 3];
    let t = 1_757_000_000_000;
    const rows = [{ atMs: t, channel: 'whatsapp' }];
    for (const g of gaps) { t += g * 1000; rows.push({ atMs: t, channel: 'whatsapp' }); }

    const r = readCadence('whatsapp', rows);
    expect(r.rows).toBe(22);
    expect(r.isBurst).toBe(true);
    expect(r.medianGapSeconds).toBeLessThanOrEqual(6);
    expect(r.impossibleRatio).toBeGreaterThan(0.8);
  });

  // ── THE REPS WHO ARE DOING THE WORK ───────────────────────────────────────
  //
  // Both counsellors' PHONE cadence, measured 1–15 Sep: Anshul 146s median
  // with 2% impossible, Neelam 125s median with 0%. Neither may ever trip
  // this, on any day, or the detector is worse than useless — it would put a
  // founder in a room accusing someone who was working.
  it('clears a real calling day at Anshul-like pace', () => {
    const r = readCadence('phone', spaced(120, 146, 'phone'));
    expect(r.isBurst).toBe(false);
    expect(r.impossibleGaps).toBe(0);
  });

  it('clears a real calling day at Neelam-like pace', () => {
    const r = readCadence('phone', spaced(60, 125, 'phone'));
    expect(r.isBurst).toBe(false);
  });

  it('clears a genuinely busy day with a handful of quick corrections', () => {
    // 60 honest rows plus 5 rapid ones = 5/64 gaps impossible ≈ 8%.
    const rows = [...spaced(60, 120, 'phone'), ...spaced(5, 3, 'phone', 1_757_000_000_000 + 60 * 120_000 + 200_000)];
    const r = readCadence('phone', rows);
    expect(r.impossibleRatio).toBeLessThan(BURST_RATIO);
    expect(r.isBurst).toBe(false);
  });

  it('clears Anshul-like WhatsApp use — 32s median, 2% impossible', () => {
    expect(readCadence('whatsapp', spaced(48, 32)).isBurst).toBe(false);
  });
});

describe('the thresholds refuse to accuse on thin evidence', () => {
  it('ignores a tiny sample even when every gap is impossible', () => {
    const r = readCadence('whatsapp', spaced(BURST_MIN_ROWS - 1, 2));
    expect(r.impossibleRatio).toBe(1);
    expect(r.isBurst).toBe(false);   // a person fixing typos, not a burst
  });

  it('fires the moment the sample is big enough and the pace is impossible', () => {
    expect(readCadence('whatsapp', spaced(BURST_MIN_ROWS, 2)).isBurst).toBe(true);
  });

  it('treats the boundary gap as possible, not impossible', () => {
    const r = readCadence('whatsapp', spaced(40, IMPOSSIBLE_GAP_SECONDS));
    expect(r.impossibleGaps).toBe(0);
    expect(r.isBurst).toBe(false);
  });

  it('reports no gaps and no burst for a single row', () => {
    const r = readCadence('phone', spaced(1, 0, 'phone'));
    expect(r.gaps).toBe(0);
    expect(r.medianGapSeconds).toBeNull();
    expect(r.isBurst).toBe(false);
  });

  it('handles rows arriving out of order', () => {
    const rows = spaced(20, 120, 'phone').reverse();
    expect(readCadence('phone', rows).impossibleGaps).toBe(0);
  });
});

describe('gaps are measured within one channel, never across', () => {
  it('does not manufacture a burst from interleaved calls and messages', () => {
    // A rep who messages between calls produces tiny cross-channel gaps that
    // mean nothing. Reading them together would flag honest work.
    const rows = [];
    for (let i = 0; i < 30; i++) {
      rows.push({ atMs: 1_757_000_000_000 + i * 120_000, channel: 'phone' });
      rows.push({ atMs: 1_757_000_000_000 + i * 120_000 + 2_000, channel: 'whatsapp' });
    }
    for (const r of readDay(rows)) expect(r.isBurst).toBe(false);
  });

  it('skips rows with no channel — a skip claims no timed action', () => {
    const rows = [...spaced(30, 1, null as unknown as string), ...spaced(20, 120, 'phone')];
    const readings = readDay(rows);
    expect(readings.map((r) => r.channel)).toEqual(['phone']);
  });

  it('flags only the offending channel on a mixed day', () => {
    const rows = [...spaced(40, 150, 'phone'), ...spaced(40, 4, 'whatsapp')];
    const readings = readDay(rows);
    expect(readings.find((r) => r.channel === 'whatsapp')?.isBurst).toBe(true);
    expect(readings.find((r) => r.channel === 'phone')?.isBurst).toBe(false);
  });
});

describe('what the founder actually reads', () => {
  const reading = readCadence('whatsapp', spaced(99, 6));

  it('describes the clock, never the person', () => {
    const s = burstReason('Neelam', reading, '2026-09-08');
    expect(s).toContain('99 whatsapp rows');
    expect(s).toContain('cannot complete that fast');
    // The words a data-integrity alert must not put in a founder's mouth.
    for (const forbidden of ['lazy', 'lying', 'fraud', 'cheating', 'dishonest', 'fake']) {
      expect(s.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('emits an exception that drills down to the exact rows', () => {
    const e = cadenceException({
      repId: 'r1', repName: 'Neelam', day: '2026-09-08', reading, detectedAtMs: 1_757_900_000_000,
    });
    expect(e.code).toBe('rep_cadence_burst');
    expect(e.severity).toBe('high');
    expect(e.entity).toEqual({ kind: 'sales_rep', id: 'r1', label: 'Neelam' });
    // Founder rule 6: an exception you cannot drill into is a chart.
    expect(e.destination).toContain('rep=r1');
    expect(e.destination).toContain('/admin/sales-performance');
    expect(e.evidence.rows).toBe(99);
    expect(e.evidence.threshold_seconds).toBe(IMPOSSIBLE_GAP_SECONDS);
  });

  it('keys the id so the same burst does not reappear as new each recompute', () => {
    const mk = () => cadenceException({
      repId: 'r1', repName: 'Neelam', day: '2026-09-08', reading, detectedAtMs: Date.now(),
    }).id;
    expect(mk()).toBe(mk());
    expect(mk()).toBe('rep-cadence:r1:2026-09-08:whatsapp');
  });
});
