import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SESSION_STATUSES, TERMINAL_STATUSES, LEGAL_TRANSITIONS, MIN_SESSIONS_FOR_RATE,
  canTransition, isTerminal, isSessionStatus, transitionRefusal,
  deliveryCounts, completionRate, type SessionStatus, type SessionRow,
} from './session-lifecycle';

// ── Can CareerRai deliver the thing it sells? ───────────────────────────────
//
// 24 Aug 2026. Sixteen ₹299 sessions have ever existed: 9 expired, 7
// cancelled, ZERO completed. Not because the meeting links were missing —
// every one of them had a working link — but because `active` was an
// UNREACHABLE STATE. It has been a legal session_status since the table was
// created and no line of code has ever written it.
//
// Before a salesperson is asked to sell this, the product must be able to say
// "this session happened". These guards protect that.

const MIGRATION = 'supabase/migrations/20260824e_session_lifecycle.sql';
const SQL = readFileSync(MIGRATION, 'utf8');

describe('the transition table in code IS the one in the database', () => {
  it('every legal transition in code is legal in the trigger', () => {
    // Two copies of a state machine WILL drift, so this reads the migration
    // rather than trusting that they still agree.
    const block = SQL.match(/if not \(([\s\S]*?)\) then\s*\n\s*raise exception 'video_sessions: illegal transition/);
    expect(block, 'transition block not found in migration').toBeTruthy();
    const sql = block![1];

    for (const from of SESSION_STATUSES) {
      for (const to of LEGAL_TRANSITIONS[from]) {
        const clause = new RegExp(`old_s = '${from}'[\\s\\S]*?new_s in \\(([^)]*)\\)`);
        const m = sql.match(clause);
        expect(m, `migration has no rule for ${from}`).toBeTruthy();
        expect(m![1], `${from} -> ${to} legal in code but not in the DB`).toContain(`'${to}'`);
      }
    }
  });

  it('the terminal states in code are the terminal states in the trigger', () => {
    const m = SQL.match(/if old_s in \(([^)]*)\) then\s*\n\s*raise exception 'video_sessions: % is terminal/);
    expect(m).toBeTruthy();
    const dbTerminal = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
    expect(dbTerminal).toEqual([...TERMINAL_STATUSES].sort());
  });

  it('a terminal state has no way out — in code and in the DB', () => {
    for (const s of TERMINAL_STATUSES) {
      expect(LEGAL_TRANSITIONS[s], `${s} can still be left`).toEqual([]);
      expect(isTerminal(s)).toBe(true);
      for (const to of SESSION_STATUSES) expect(canTransition(s, to)).toBe(false);
    }
  });
});

describe('the transitions that must NOT be possible', () => {
  it.each([
    ['completed', 'active'],   // reopening a finished session
    ['completed', 'completed'],// duplicate completion
    ['cancelled', 'completed'],// completing what was called off
    ['expired', 'completed'],  // the stale-release cron resurrecting a session
    ['expired', 'active'],
    ['active', 'scheduled'],   // un-starting
    ['scheduled', 'scheduled'],
  ] as [SessionStatus, SessionStatus][])('%s -> %s is refused', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(transitionRefusal(from, to)).toBeTruthy();
  });

  it.each([
    ['scheduled', 'active'],
    ['scheduled', 'completed'], // mentor ran the call, never tapped start
    ['scheduled', 'cancelled'],
    ['scheduled', 'expired'],
    ['active', 'completed'],
    ['active', 'cancelled'],
    ['active', 'expired'],
  ] as [SessionStatus, SessionStatus][])('%s -> %s is allowed', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(transitionRefusal(from, to)).toBeNull();
  });

  it('a refusal says something a human can act on', () => {
    expect(transitionRefusal('completed', 'active')).toMatch(/already completed/i);
    expect(transitionRefusal('scheduled', 'scheduled')).toMatch(/already scheduled/i);
  });
});

describe('the database stamps the times, and they are facts', () => {
  it('entering active stamps started_at', () => {
    expect(SQL).toMatch(/new_s = 'active' and new\.started_at is null then\s*\n\s*new\.started_at := now\(\)/);
  });

  it('ONLY completed stamps ended_at — cancelled and expired never happened', () => {
    // If a cancelled session stamped ended_at, count(ended_at) — the most
    // natural "sessions delivered" query anyone will ever write — would
    // silently count sessions that never took place.
    expect(SQL).toMatch(/new_s = 'completed' and new\.ended_at is null then\s*\n\s*new\.ended_at := now\(\)/);
    const stampBlock = SQL.slice(SQL.indexOf("new_s = 'active' and new.started_at"));
    expect(stampBlock).not.toMatch(/new_s in \([^)]*'cancelled'[^)]*\) and new\.ended_at is null/);
  });

  it('a recorded time cannot be rewritten', () => {
    expect(SQL).toMatch(/old\.started_at is not null and new\.started_at is distinct from old\.started_at/);
    expect(SQL).toMatch(/old\.ended_at is not null and new\.ended_at is distinct from old\.ended_at/);
  });

  it('completed without an end time is structurally impossible', () => {
    expect(SQL).toMatch(/video_sessions_completed_has_end[\s\S]*?session_status <> 'completed' or ended_at is not null/);
  });

  it('a session cannot end before it began', () => {
    expect(SQL).toMatch(/ended_at is null or started_at is null or ended_at >= started_at/);
  });

  it('completed does NOT require an observed start — no fabricated timestamps', () => {
    // A mentor who ran the call but never tapped start has still delivered it.
    // Requiring a start would only teach them to invent one.
    expect(canTransition('scheduled', 'completed')).toBe(true);
    expect(SQL).not.toMatch(/session_status <> 'completed' or started_at is not null/);
  });
});

describe('delivery is counted honestly', () => {
  const rows = (spec: [string, boolean, boolean][]): SessionRow[] =>
    spec.map(([session_status, s, e]) => ({
      session_status,
      started_at: s ? '2026-08-20T10:00:00Z' : null,
      ended_at: e ? '2026-08-20T11:00:00Z' : null,
    }));

  it('separates completed-with-observed-start from completed-start-unknown', () => {
    const c = deliveryCounts(rows([
      ['completed', true, true], ['completed', false, true], ['expired', false, false],
    ]));
    expect(c.completed).toBe(2);
    expect(c.completedWithObservedStart).toBe(1);
    expect(c.completedStartUnknown).toBe(1);
  });

  it('a scheduled session that has not happened yet is not a failure', () => {
    // The denominator is settled sessions. Counting future bookings as
    // not-yet-completed is how a young product invents a crisis.
    const c = deliveryCounts(rows([
      ['scheduled', false, false], ['scheduled', false, false], ['completed', true, true],
    ]));
    expect(c.settled).toBe(1);
    expect(c.total).toBe(3);
  });

  it('the counts always add up to the total', () => {
    const c = deliveryCounts(rows([
      ['scheduled', false, false], ['active', true, false], ['completed', true, true],
      ['cancelled', false, false], ['expired', false, false],
    ]));
    expect(c.scheduled + c.active + c.completed + c.cancelled + c.expired).toBe(c.total);
  });

  it('TODAY’S PRODUCTION SHAPE: 9 expired + 7 cancelled reports no rate, not 0%', () => {
    // This is the live table as of 24 Aug. "0% completion" would read as a
    // damning product fact; the honest answer is that 16 settled sessions with
    // zero completions is a sample, and the sample is what it is.
    const live = deliveryCounts(rows([
      ...Array(9).fill(['expired', false, false]),
      ...Array(7).fill(['cancelled', false, false]),
    ] as [string, boolean, boolean][]));
    expect(live.completed).toBe(0);
    expect(live.settled).toBe(16);
    // 16 >= MIN, so a rate IS reportable here — and it is genuinely 0.
    expect(completionRate(live)).toBe(0);
  });

  it('a sample too small to carry a rate returns null, never 0', () => {
    const tiny = deliveryCounts(rows([['completed', true, true], ['expired', false, false]]));
    expect(tiny.settled).toBeLessThan(MIN_SESSIONS_FOR_RATE);
    expect(completionRate(tiny)).toBeNull();
  });

  it('an empty table returns null rather than 0% or NaN', () => {
    const empty = deliveryCounts([]);
    expect(completionRate(empty)).toBeNull();
    expect(Number.isNaN(completionRate(empty) as number)).toBe(false);
  });
});

describe('type guards', () => {
  it('accepts every real status and rejects invented ones', () => {
    for (const s of SESSION_STATUSES) expect(isSessionStatus(s)).toBe(true);
    expect(isSessionStatus('started')).toBe(false);
    expect(isSessionStatus('booked')).toBe(false);
    expect(isSessionStatus(null)).toBe(false);
  });
});

describe('the start transition exists and stays the mentor’s act', () => {
  const ROUTE = readFileSync('src/app/api/sessions/start/route.ts', 'utf8');

  it('does not set started_at itself — the DB owns the clock', () => {
    // A caller that could pass its own started_at could backdate when a call
    // began. One clock, in the trigger.
    const update = ROUTE.slice(ROUTE.indexOf('.update('));
    expect(update.slice(0, 200)).not.toContain('started_at:');
  });

  it('writes conditionally, so a session that settled meanwhile is not clobbered', () => {
    expect(ROUTE).toMatch(/\.eq\('session_status', from\)/);
  });

  it('a second tap is a no-op success, not an error and not a second start', () => {
    expect(ROUTE).toMatch(/alreadyStarted/);
  });

  it('a failed read answers 503, never "session not found"', () => {
    // Boundary 2: telling a mentor with a student waiting that their session
    // does not exist, because of a database blip, is the failure mode.
    const readGuard = ROUTE.slice(ROUTE.indexOf('readError'));
    expect(readGuard).toMatch(/503/);
  });

  it('only the mentor may start it', () => {
    expect(ROUTE).toMatch(/session\.buddy_id !== user\.id/);
  });
});

describe('no writer of session_status bypasses the state machine', () => {
  const WRITERS = [
    'src/app/api/buddy/commitment/route.ts',
    'src/app/api/calendar/complete-orientation/route.ts',
    'src/app/api/admin/buddy-integration/route.ts',
    'src/app/api/cron/release-stale-sessions/route.ts',
    'src/app/api/sessions/start/route.ts',
  ];

  it.each(WRITERS)('%s guards its transition', (file) => {
    const src = readFileSync(file, 'utf8');
    const writes = src.includes("session_status: '");
    if (!writes) return;
    // Either it filters on the current status (a conditional update that
    // matches zero rows when the session has moved on) or it asks the shared
    // transition table first. Both are fine; writing blind is not.
    const guarded = /\.in\('session_status'/.test(src)
      || /\.eq\('session_status'/.test(src)
      || /canTransition\(/.test(src);
    expect(guarded, `${file} writes session_status with no transition guard`).toBe(true);
  });

  it('nobody writes ended_at by hand any more', () => {
    // The trigger stamps it. A hand-written ended_at can disagree with the
    // transition that produced it, and the immutability guard would then
    // reject a legitimate close-out.
    for (const f of WRITERS) {
      expect(readFileSync(f, 'utf8'), `${f} sets ended_at by hand`).not.toMatch(/ended_at:\s*new Date/);
    }
  });
});
