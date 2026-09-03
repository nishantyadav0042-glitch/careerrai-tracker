import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CALL_OUTCOMES,
  CONNECTED_OUTCOMES,
  LEAD_STATUSES,
  isCallOutcome,
  isConnectedOutcome,
  planDisposition,
  MAX_CONSECUTIVE_NO_ANSWER,
  HOT_DAILY_RETRY_LIMIT,
} from './sales-disposition';

// A fixed "now": 20 Aug 2026 06:00 UTC = 11:30 IST (before the 17:00 IST
// same-day-retry cutoff).
const NOW = Date.UTC(2026, 7, 20, 6, 0, 0);
// Same day, 13:00 UTC = 18:30 IST (after the cutoff).
const EVENING = Date.UTC(2026, 7, 20, 13, 0, 0);

describe('vocabulary', () => {
  it('every call outcome maps to a legal stored status', () => {
    for (const o of CALL_OUTCOMES) {
      const plan = planDisposition(o, { prevMisses: 0, hot: false, callbackAtLocal: '2026-08-21T18:00', nowMs: NOW });
      expect(LEAD_STATUSES).toContain(plan.status);
    }
  });

  it('type guards agree with the lists', () => {
    expect(isCallOutcome('no_answer')).toBe(true);
    expect(isCallOutcome('follow_up')).toBe(false); // stored status, not a disposition
    expect(isConnectedOutcome('no_answer')).toBe(false);
    for (const o of CONNECTED_OUTCOMES) expect(isConnectedOutcome(o)).toBe(true);
  });
});

// ── The vocabulary lives in TWO places: this module and the DB CHECK. ──
// This guard reads the migration and fails if they ever drift apart again —
// the exact defect of P0-B, where code wrote 'no_answer' and the CHECK
// (written before the dialer existed) rejected it.
describe('code and database share ONE status vocabulary', () => {
  it('the CHECK constraint in the migration lists exactly LEAD_STATUSES', () => {
    // 20260903a supersedes 20260824b: it re-creates the same constraint with
    // 'messaged' added. The guard always reads the NEWEST definition of the CHECK.
    const sql = readFileSync('supabase/migrations/20260903a_messaged_outcome.sql', 'utf8');
    const checkBlock = sql.match(/check \(status in \(([\s\S]*?)\)\)/i);
    expect(checkBlock).not.toBeNull();
    const dbValues = [...checkBlock![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(dbValues).toEqual([...LEAD_STATUSES].sort());
  });

  it('both API routes take their vocabulary from this module, not a local list', () => {
    const log = readFileSync('src/app/api/sales/log/route.ts', 'utf8');
    const outreach = readFileSync('src/app/api/admin/outreach/route.ts', 'utf8');
    expect(log).toContain("from '@/lib/sales-disposition'");
    expect(outreach).toContain('LEAD_STATUSES');
    // No resurrected hand-rolled vocabulary next to the canonical one.
    expect(log).not.toMatch(/const (VALID|CONNECTED)\s*=\s*\[/);
  });
});

describe('planDisposition — the cadence engine', () => {
  it('callback → follow_up at the exact IST time the student asked for', () => {
    const p = planDisposition('callback', { prevMisses: 3, hot: false, callbackAtLocal: '2026-08-21T18:30', nowMs: NOW });
    expect(p.status).toBe('follow_up');
    expect(p.callbackAt).toBe('2026-08-21T13:00:00.000Z'); // 18:30 IST
    expect(p.nextActionAt).toBe(p.callbackAt);
    expect(p.noAnswerCount).toBe(0); // a connected call resets the miss counter
  });

  it('interested → gentle follow-up in 2 days, late morning IST', () => {
    const p = planDisposition('interested', { prevMisses: 2, hot: false, nowMs: NOW });
    expect(p.status).toBe('interested');
    expect(p.nextActionAt).toBe('2026-08-22T05:30:00.000Z'); // 22 Aug 11:00 IST
    expect(p.noAnswerCount).toBe(0);
  });

  it('no_answer on a hot lead → tomorrow morning, never lost', () => {
    const p = planDisposition('no_answer', { prevMisses: 0, hot: true, nowMs: NOW });
    expect(p.status).toBe('no_answer');
    expect(p.noAnswerCount).toBe(1);
    expect(p.nextActionAt).toBe('2026-08-21T04:30:00.000Z'); // 21 Aug 10:00 IST
  });

  it('first no_answer before 5 PM IST → evening retry the same day', () => {
    const p = planDisposition('no_answer', { prevMisses: 0, hot: false, nowMs: NOW });
    expect(p.noAnswerCount).toBe(1);
    expect(p.nextActionAt).toBe('2026-08-20T13:00:00.000Z'); // today 18:30 IST
  });

  it('no_answer in the evening → tomorrow evening', () => {
    const p = planDisposition('no_answer', { prevMisses: 0, hot: false, nowMs: EVENING });
    expect(p.nextActionAt).toBe('2026-08-21T12:30:00.000Z'); // 21 Aug 18:00 IST
  });

  it('fourth no_answer → going cold, +3 days', () => {
    const p = planDisposition('no_answer', { prevMisses: 3, hot: false, nowMs: NOW });
    expect(p.noAnswerCount).toBe(4);
    expect(p.nextActionAt).toBe('2026-08-23T12:30:00.000Z'); // 23 Aug 18:00 IST
  });

  it('messaged → status messaged, no clock, misses untouched (2 Sep 2026)', () => {
    // A message is answered by the student's next move, not a scheduled
    // call: attention brings them back if they open the app, rotation after
    // 21 silent days. A clock here would double the day.
    const plan = planDisposition('messaged', { prevMisses: 2, hot: true, nowMs: Date.parse('2026-09-02T10:00:00Z') });
    expect(plan.status).toBe('messaged');
    expect(plan.nextActionAt).toBeNull();
    expect(plan.callbackAt).toBeNull();
    expect(plan.noAnswerCount).toBe(2);
  });

  it('converted, not_interested and dnd close the lead — no re-queue clock', () => {
    // dnd is the strongest close: "stop calling me" must never produce a
    // next_action_at, or the queue would re-surface a student who explicitly
    // asked to be left alone.
    for (const o of ['converted', 'not_interested', 'dnd'] as const) {
      const p = planDisposition(o, { prevMisses: 1, hot: true, nowMs: NOW });
      expect(p.status).toBe(o);
      expect(p.nextActionAt).toBeNull();
      expect(p.callbackAt).toBeNull();
    }
  });

  it('dnd is a CONNECTED outcome — the note naming who said it is mandatory', () => {
    // isConnectedOutcome gates the mandatory-note rule in /api/sales/log.
    expect(isConnectedOutcome('dnd')).toBe(true);
  });
});

// ── The client may not pretend success (the other half of P0-B) ──
describe('disposition clients advance only on a confirmed write', () => {
  it.each(['src/components/call-deck.tsx', 'src/components/sales-log.tsx'])('%s checks res.ok and the response shape', (file) => {
    const s = readFileSync(file, 'utf8');
    expect(s).toMatch(/res\.ok/);
    expect(s).toMatch(/json\?\.ok === true/);
  });

  it('QuickLog sends the disposition vocabulary under the outcome key', () => {
    const s = readFileSync('src/components/sales-log.tsx', 'utf8');
    expect(s).toMatch(/outcome:/); // body key the API actually reads
    expect(s).not.toMatch(/key: 'follow_up'/); // stored status is not a disposition
  });
});

// ── The contact ceiling (29 Aug 2026) ───────────────────────────────────────
//
// The regression these pin was measured, not imagined: before the ceiling, a
// 30-day simulation of a student who NEVER answered produced 31 calls for a
// hot lead and 13 for an ordinary one, because the `hot` branch rolled to
// tomorrow morning regardless of how many times it had already done so.

/** Walk the cadence engine for `days`, always reporting no_answer. */
function simulateSilence(days: number, hot: boolean): number {
  let misses = 0;
  let t = Date.UTC(2026, 7, 30, 5, 0); // 10:30 IST
  const end = t + days * 86_400_000;
  let calls = 0;
  while (t < end && calls < 200) {
    const p = planDisposition('no_answer', { prevMisses: misses, hot, nowMs: t });
    misses = p.noAnswerCount;
    calls++;
    if (!p.nextActionAt) break;              // the ceiling stopped it
    const next = Date.parse(p.nextActionAt);
    if (next <= t) break;
    t = next;
  }
  return calls;
}

describe('a student who never answers is eventually left alone', () => {
  it('a HOT lead is no longer called every single day forever', () => {
    // The exact defect: 31 calls in 30 days. If this number ever climbs back
    // above the ceiling, the daily-roll bug has returned.
    expect(simulateSilence(30, true)).toBe(MAX_CONSECUTIVE_NO_ANSWER);
  });

  it('an ordinary lead is capped too', () => {
    expect(simulateSilence(30, false)).toBe(MAX_CONSECUTIVE_NO_ANSWER);
  });

  it('the cap still holds over a much longer horizon', () => {
    expect(simulateSilence(365, true)).toBe(MAX_CONSECUTIVE_NO_ANSWER);
    expect(simulateSilence(365, false)).toBe(MAX_CONSECUTIVE_NO_ANSWER);
  });

  it('at the ceiling the clock is cleared, so nothing can reschedule it', () => {
    const p = planDisposition('no_answer', {
      prevMisses: MAX_CONSECUTIVE_NO_ANSWER - 1, hot: true, nowMs: NOW,
    });
    expect(p.noAnswerCount).toBe(MAX_CONSECUTIVE_NO_ANSWER);
    expect(p.nextActionAt).toBeNull();
    // Still 'no_answer' — we record what happened, we do not invent a refusal
    // the student never made.
    expect(p.status).toBe('no_answer');
  });

  it('below the ceiling a hot lead is still chased hard', () => {
    const p = planDisposition('no_answer', { prevMisses: 0, hot: true, nowMs: NOW });
    expect(p.nextActionAt).not.toBeNull();
    expect(Date.parse(p.nextActionAt!)).toBeGreaterThan(NOW);
  });

  it('hot urgency expires into normal spacing rather than lasting forever', () => {
    const early = planDisposition('no_answer', { prevMisses: 0, hot: true, nowMs: NOW });
    const late = planDisposition('no_answer', {
      prevMisses: HOT_DAILY_RETRY_LIMIT, hot: true, nowMs: NOW,
    });
    // Once the daily allowance is spent, the next attempt is further out than
    // the "tomorrow morning" a fresh hot lead gets.
    expect(Date.parse(late.nextActionAt!)).toBeGreaterThan(Date.parse(early.nextActionAt!));
  });

  // The cap is on SILENCE, not on conversation. A student who picks up and
  // talks has not been silenced by us, and capping real dialogue would be a
  // rule invented without evidence.
  it('answering resets the count — the ceiling counts CONSECUTIVE misses', () => {
    const answered = planDisposition('interested', {
      prevMisses: MAX_CONSECUTIVE_NO_ANSWER - 1, hot: false, nowMs: NOW,
    });
    expect(answered.noAnswerCount).toBe(0);
    expect(answered.nextActionAt).not.toBeNull();
  });

  it('a connected outcome is never capped by the no-answer ceiling', () => {
    const p = planDisposition('interested', { prevMisses: 99, hot: false, nowMs: NOW });
    expect(p.nextActionAt, 'a conversation is not silence').not.toBeNull();
  });
});
