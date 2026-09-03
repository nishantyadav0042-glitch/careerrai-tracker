import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import { istYesterdayWindow, repDaySnapshot, teamYesterday, isTypedRemark } from './sales-yesterday';

/**
 * ── YESTERDAY, AS A NUMBER THE WHOLE COMPANY AGREES ON ──────────────────────
 *
 * Founder order, 3 Sep: each rep sees yesterday's own work every open; the
 * founder sees both compiled on the tower. What these pin:
 *
 *   - the IST day boundary (the number one wrong-timezone bug away from
 *     lying to the whole team every morning)
 *   - per-rep isolation (a rep must never wear another rep's numbers)
 *   - the typed-remark distinction (system auto-notes are not the rep's words)
 *   - the founder's compiled line is the SUM of what the reps themselves see
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

function db(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
  );
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => (vs as unknown[]).includes(r[c])); return q; },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
      lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return q; },
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: (t[table] ?? []).filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null }).then(ok),
    };
    return q;
  };
  return { t, admin: { from } };
}

const REP_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const REP_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const act = (actor: string, created: string, status: string, extra: Row = {}): Row =>
  ({ actor_id: actor, created_at: created, status, student_id: extra.student_id ?? `stu-${Math.random()}`, note: null, callback_at: null, ...extra });

// ── THE IST DAY BOUNDARY ────────────────────────────────────────────────────

describe('istYesterdayWindow — the day the sales team actually lives in', () => {
  it('just past IST midnight, "yesterday" is the day that ended minutes ago', () => {
    // 2026-09-03T18:45Z = 00:15 IST on 4 Sep. Yesterday = IST 3 Sep.
    const w = istYesterdayWindow(Date.parse('2026-09-03T18:45:00Z'));
    expect(w.startIso).toBe('2026-09-02T18:30:00.000Z');
    expect(w.endIso).toBe('2026-09-03T18:30:00.000Z');
    expect(w.label).toBe('2026-09-03');
  });

  it('just BEFORE IST midnight the same UTC evening, yesterday is one day earlier', () => {
    // 2026-09-03T18:15Z = 23:45 IST on 3 Sep. Yesterday = IST 2 Sep — a UTC
    // implementation gets this exact case wrong.
    const w = istYesterdayWindow(Date.parse('2026-09-03T18:15:00Z'));
    expect(w.label).toBe('2026-09-02');
    expect(w.endIso).toBe('2026-09-02T18:30:00.000Z');
  });

  it('mid-morning IST is the ordinary case', () => {
    // 2026-09-04T04:00Z = 09:30 IST on 4 Sep → yesterday is IST 3 Sep.
    const w = istYesterdayWindow(Date.parse('2026-09-04T04:00:00Z'));
    expect(w.label).toBe('2026-09-03');
  });
});

// ── ONE REP'S DAY ───────────────────────────────────────────────────────────

const WINDOW = { startIso: '2026-09-02T18:30:00.000Z', endIso: '2026-09-03T18:30:00.000Z', label: '2026-09-03' };

describe('repDaySnapshot', () => {
  it('counts only THIS rep, only inside the window, and splits by outcome', async () => {
    const { admin } = db({
      sales_activity: [
        act(REP_A, '2026-09-03T05:00:00Z', 'interested', { note: 'Wants CAT strategy call Monday', student_id: 's1' }),
        act(REP_A, '2026-09-03T06:00:00Z', 'no_answer', { note: 'Did not pick up', student_id: 's2' }),
        act(REP_A, '2026-09-03T07:00:00Z', 'callback', { note: 'Exam this week', callback_at: '2026-09-05T09:00:00Z', student_id: 's3' }),
        act(REP_A, '2026-09-03T08:00:00Z', 'no_answer', { note: 'Did not pick up', student_id: 's2' }), // second try, same student
        act(REP_B, '2026-09-03T05:30:00Z', 'converted', { note: 'Paid!', student_id: 's9' }),           // ANOTHER rep
        act(REP_A, '2026-09-02T10:00:00Z', 'interested', { note: 'old', student_id: 's4' }),            // day before
        act(REP_A, '2026-09-03T19:00:00Z', 'interested', { note: 'today', student_id: 's5' }),          // day after
        act(REP_A, '2026-09-03T09:00:00Z', 'reassigned', { student_id: 's6' }),                          // bookkeeping, not work
      ],
    });
    const s = await repDaySnapshot(admin, REP_A, WINDOW);

    expect(s.attempts, 'four in-window work rows').toBe(4);
    expect(s.studentsTouched, 's2 dialed twice is ONE student').toBe(3);
    expect(s.byOutcome).toEqual({ interested: 1, no_answer: 2, callback: 1 });
    expect(s.callbacksSet).toBe(1);
    expect(s.remarksTyped, 'two typed remarks; the auto "Did not pick up" pair is not the rep\'s words').toBe(2);
  });

  it('a rep who recorded nothing gets an honest zero, not an error', async () => {
    const { admin } = db({ sales_activity: [] });
    const s = await repDaySnapshot(admin, REP_A, WINDOW);
    expect(s.attempts).toBe(0);
    expect(s.studentsTouched).toBe(0);
  });
});

describe('isTypedRemark — the rep\'s words vs the system\'s', () => {
  it('rejects every auto-note shape and empty text', () => {
    expect(isTypedRemark('no_answer', 'Did not pick up')).toBe(false);
    expect(isTypedRemark('skipped', 'Skipped: student wrote back')).toBe(false);
    expect(isTypedRemark('messaged', 'Sent a WhatsApp message')).toBe(false); // legacy one-tap rows
    expect(isTypedRemark('interested', '')).toBe(false);
    expect(isTypedRemark('interested', null)).toBe(false);
  });
  it('accepts genuine words, even on a no-answer', () => {
    expect(isTypedRemark('interested', 'Wants mentor for DILR')).toBe(true);
    expect(isTypedRemark('no_answer', 'Phone switched off, will try evening')).toBe(true);
    expect(isTypedRemark('messaged', 'Sent the mock-analysis offer')).toBe(true);
  });
});

// ── THE FOUNDER'S COMPILED LINE ─────────────────────────────────────────────

describe('teamYesterday', () => {
  it('one row per ACTIVE seat, and the combined line is the sum of the rep rows', async () => {
    const { admin } = db({
      sales_rep_config: [
        { rep_id: REP_A, active: true },
        { rep_id: REP_B, active: true },
        { rep_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', active: false }, // archived seat
      ],
      profiles: [
        { id: REP_A, full_name: 'Neelam' },
        { id: REP_B, full_name: 'Anshul' },
      ],
      sales_activity: [
        act(REP_A, '2026-09-03T05:00:00Z', 'interested', { note: 'w', student_id: 's1' }),
        act(REP_A, '2026-09-03T06:00:00Z', 'no_answer', { note: 'Did not pick up', student_id: 's2' }),
        act(REP_B, '2026-09-03T07:00:00Z', 'converted', { note: 'Paid for session', student_id: 's3' }),
        { actor_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', created_at: '2026-09-03T08:00:00Z', status: 'interested', student_id: 's4', note: 'x', callback_at: null },
      ],
    });
    // now = 09:30 IST on 4 Sep → yesterday = IST 3 Sep, matching WINDOW.
    const t = await teamYesterday(admin, Date.parse('2026-09-04T04:00:00Z'));

    expect(t.reps.map((r) => r.repName).sort()).toEqual(['Anshul', 'Neelam']);
    expect(t.reps.find((r) => r.repName === 'Neelam')!.attempts).toBe(2);
    expect(t.reps.find((r) => r.repName === 'Anshul')!.attempts).toBe(1);
    expect(t.combined.attempts, 'combined = sum of the two visible reps; the archived seat is nobody').toBe(3);
    expect(t.combined.byOutcome).toEqual({ interested: 1, no_answer: 1, converted: 1 });
    expect(t.combined.remarksTyped).toBe(2);
  });
});

// ── THE SURFACES AND THE MANDATE, PINNED IN SOURCE ──────────────────────────

describe('both surfaces render from the ONE snapshot authority', () => {
  it('the rep workspace mounts the flash', () => {
    const page = codeOnly(readFileSync('src/app/sales/page.tsx', 'utf8'));
    expect(page).toMatch(/repDaySnapshot\(admin, user\.id, istYesterdayWindow\(\)\)/);
    expect(page).toMatch(/<YesterdayFlash s=\{yesterday\} \/>/);
  });
  it('the Control Tower mounts the compiled view', () => {
    const tower = codeOnly(readFileSync('src/app/admin/sales/tower/page.tsx', 'utf8'));
    expect(tower).toMatch(/teamYesterday\(admin\)/);
    expect(tower).toMatch(/<TeamYesterday t=\{yesterdayTeam\} \/>/);
  });
  it('neither surface computes its own numbers — both import from sales-yesterday', () => {
    for (const f of ['src/components/sales/yesterday-flash.tsx', 'src/components/admin/team-yesterday.tsx']) {
      const src = codeOnly(readFileSync(f, 'utf8'));
      expect(src, `${f} must not query sales_activity itself`).not.toMatch(/from\('sales_activity'\)/);
    }
  });
});

describe('remarks are mandatory where the founder ordered (3 Sep)', () => {
  const route = codeOnly(readFileSync('src/app/api/sales/log/route.ts', 'utf8'));
  const deck = codeOnly(readFileSync('src/components/call-deck.tsx', 'utf8'));

  it('the SERVER refuses a messaged disposition with no words', () => {
    expect(route).toMatch(/\(isConnectedOutcome\(outcome\) \|\| outcome === 'messaged'\) && noteText\.length === 0/);
  });
  it('the client no longer fires messaged with an empty note', () => {
    expect(deck).not.toMatch(/dispose\(lead, 'messaged', ''\)/);
    expect(deck, 'the mini-form Save is gated on real text').toMatch(/msgNote\.trim\(\)\.length === 0/);
  });
  it('the client requires a note on all five connected outcomes — matching the server at last', () => {
    expect(deck).toMatch(/NOTE_REQUIRED = new Set\(\['interested', 'callback', 'converted', 'not_interested', 'dnd'\]\)/);
  });
  it('the Constitution records the order instead of being silently overridden', () => {
    const os = readFileSync('docs/OS/SALES-OS.md', 'utf8');
    expect(os).toMatch(/Amendment, 3 Sep 2026 \(founder order\)/);
  });
});
