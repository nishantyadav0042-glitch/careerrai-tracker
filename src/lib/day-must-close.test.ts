import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeCheckpoint, describeCheckpoint, type OpportunityRow } from './sales-checkpoint';
import { SKIP_REASONS, SKIP_REASON_LABEL, isSkipReason, isCallOutcome, planDisposition, ACTIVITY_STATUSES } from './sales-disposition';
import { markSkipped, closeDay } from './sales-opportunity-record';

// ── EVERY CARD ENDS THE DAY MARKED ──────────────────────────────────────────
//
// Founder, 3 Sep 2026: "make sure they mark every list close or something,
// otherwise it doesn't make sense of these lists."
//
// Verified in production that morning: 240 of the 241 cards ever dealt were
// still open, going back to 30 August. `worked_at is null` was storing three
// different facts in one empty cell — never got to it, deliberately deferred,
// could not act. This suite pins the three states apart, and pins the two
// properties that make the whole thing trustworthy:
//
//   1. a skip is NOT work and never inflates coverage;
//   2. a skip changes NOTHING about the student.

/* eslint-disable @typescript-eslint/no-explicit-any */

const row = (o: Partial<OpportunityRow> & { studentId: string }): OpportunityRow => ({
  objective: 'retention', rank: 0, workedAt: null, outcome: null,
  closedAt: null, closeReason: null, skipReason: null, ...o,
});
const worked = (id: string, rank = 0, outcome = 'interested') =>
  row({ studentId: id, rank, workedAt: '2026-09-03T10:00:00Z', outcome, closedAt: '2026-09-03T10:00:00Z', closeReason: 'worked' });
const skipped = (id: string, rank = 0, reason = 'ran_out_of_time') =>
  row({ studentId: id, rank, closedAt: '2026-09-03T10:00:00Z', closeReason: 'skipped', skipReason: reason });
const notMarked = (id: string, rank = 0) =>
  row({ studentId: id, rank, closedAt: '2026-09-03T16:15:00Z', closeReason: 'not_marked' });

describe('the three states a card can end the day in', () => {
  it('worked, skipped, never marked and still open are counted apart', () => {
    const c = computeCheckpoint([
      worked('a', 0), worked('b', 1), skipped('c', 2), notMarked('d', 3), row({ studentId: 'e', rank: 4 }),
    ]);
    expect(c.surfaced).toBe(5);
    expect(c.worked).toBe(2);
    expect(c.skipped).toBe(1);
    expect(c.notMarked).toBe(1);
    expect(c.remaining, 'only the genuinely open card is still to mark').toBe(1);
  });

  it('the four states always add up to what was given — nothing can hide', () => {
    const rows = [worked('a'), worked('b'), skipped('c'), skipped('d'), notMarked('e'), row({ studentId: 'f' })];
    const c = computeCheckpoint(rows);
    expect(c.worked + c.skipped + c.notMarked + c.remaining).toBe(c.surfaced);
  });

  it('A SKIP IS NOT WORK: coverage never counts it', () => {
    // The defect this guards against is the tempting one — closing a card by
    // stamping worked_at, which would make a day of skips read as 100%.
    const c = computeCheckpoint([worked('a'), skipped('b'), skipped('c'), skipped('d')]);
    expect(c.worked, 'three skips added nothing to work').toBe(1);
    expect(c.coveragePercent, '1 of 4 actually worked').toBe(25);
    expect(c.reached, 'only the one real conversation counts as reaching anyone').toBe(1);
    // And a day of nothing but skips is honestly zero.
    const allSkipped = computeCheckpoint([skipped('a'), skipped('b'), skipped('c')]);
    expect(allSkipped.coveragePercent).toBe(0);
    expect(allSkipped.reached).toBe(0);
  });

  it('a skipped card is not leakage — somebody looked and decided', () => {
    const c = computeCheckpoint([skipped('a', 0), row({ studentId: 'b', rank: 1 })]);
    expect(c.highPriorityStudentIds, 'only the unmarked card is leakage').toEqual(['b']);
  });

  it('a swept card is not leakage either — it is already a recorded fact', () => {
    const c = computeCheckpoint([notMarked('a', 0), row({ studentId: 'b', rank: 1 })]);
    expect(c.highPriorityStudentIds).toEqual(['b']);
  });

  it('rows written before closed_at existed count exactly as they always did', () => {
    // Backwards compatibility is not cosmetic here: 241 production rows predate
    // the column, and a worked row has always been a closed row.
    const legacyWorked: OpportunityRow = { studentId: 'a', objective: 'retention', rank: 0, workedAt: '2026-08-30T10:00:00Z', outcome: 'interested' };
    const legacyOpen: OpportunityRow = { studentId: 'b', objective: 'retention', rank: 1, workedAt: null, outcome: null };
    const c = computeCheckpoint([legacyWorked, legacyOpen]);
    expect(c.worked).toBe(1);
    expect(c.remaining).toBe(1);
    expect(c.skipped).toBe(0);
    expect(c.notMarked).toBe(0);
  });
});

describe('what the counsellor is told', () => {
  it('names what is left TO MARK, not just what is left', () => {
    const s = describeCheckpoint(computeCheckpoint([worked('a', 0), row({ studentId: 'b', rank: 1 })]));
    expect(s).toContain('1 left to mark');
  });

  it('a day finished with skips never reads as "all worked"', () => {
    const s = describeCheckpoint(computeCheckpoint([worked('a'), skipped('b'), skipped('c')]));
    expect(s).not.toContain('All 3 worked');
    expect(s).toContain('1 worked');
    expect(s).toContain('2 skipped');
    expect(s).toContain('Nothing left today');
  });

  it('a swept day says plainly that nobody marked them', () => {
    const s = describeCheckpoint(computeCheckpoint([worked('a'), notMarked('b'), notMarked('c')]));
    expect(s).toContain('2 never marked');
  });

  it('a fully worked day still reads the way it always did', () => {
    expect(describeCheckpoint(computeCheckpoint([worked('a'), worked('b')]))).toBe('All 2 worked. Nothing left today.');
  });
});

describe('the skip vocabulary', () => {
  it('every reason has a label a counsellor can read', () => {
    for (const r of SKIP_REASONS) expect(SKIP_REASON_LABEL[r].length).toBeGreaterThan(3);
  });

  it('only the listed reasons are accepted', () => {
    expect(isSkipReason('ran_out_of_time')).toBe(true);
    expect(isSkipReason('because')).toBe(false);
    expect(isSkipReason(null)).toBe(false);
    expect(isSkipReason('')).toBe(false);
  });

  it('skipped is a reportable outcome, and it never becomes a lead status', () => {
    expect(isCallOutcome('skipped')).toBe(true);
    // planDisposition must be inert for a skip: nothing happened to the student.
    const plan = planDisposition('skipped', { prevMisses: 3, hot: true, nowMs: Date.parse('2026-09-03T10:00:00Z') });
    expect(plan.nextActionAt, 'a skip schedules nothing').toBeNull();
    expect(plan.callbackAt).toBeNull();
    expect(plan.noAnswerCount, 'nobody failed to answer').toBe(3);
  });

  it('the database CHECK lists exactly the activity vocabulary', () => {
    const sql = readFileSync('supabase/migrations/20260903b_day_must_close.sql', 'utf8');
    const block = sql.match(/sales_activity_status_check[\s\S]*?check \(status in \(([\s\S]*?)\)\)/i);
    expect(block, 'the migration must define the status CHECK').not.toBeNull();
    const dbValues = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(dbValues).toEqual([...ACTIVITY_STATUSES].sort());
  });

  it("the migration teaches the database that 'skip' is an activity type", () => {
    const sql = readFileSync('supabase/migrations/20260903b_day_must_close.sql', 'utf8');
    const block = sql.match(/activity_type_check[\s\S]*?check \(activity_type in \(([\s\S]*?)\)\)/i);
    expect(block).not.toBeNull();
    expect(block![1]).toContain("'skip'");
  });
});

// ── The writes ──────────────────────────────────────────────────────────────

function db() {
  const updates: { table: string; patch: any; filters: [string, unknown][]; isNull: string[] }[] = [];
  let answer: { data: any; error: any } = { data: [], error: null };
  const client = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const isNull: string[] = [];
      let patch: any = null;
      const c: any = {};
      c.update = (p: any) => { patch = p; return c; };
      c.eq = (k: string, v: unknown) => { filters.push([k, v]); return c; };
      c.lt = (k: string, v: unknown) => { filters.push([`lt:${k}`, v]); return c; };
      c.is = (k: string, v: unknown) => { if (v === null) isNull.push(k); return c; };
      c.select = () => c;
      c.then = (ok: (r: unknown) => unknown) => {
        updates.push({ table, patch, filters, isNull });
        return Promise.resolve(answer).then(ok);
      };
      return c;
    },
  };
  return { client, updates, setAnswer: (a: { data: any; error: any }) => { answer = a; } };
}

describe('markSkipped — closes the card and claims nothing else', () => {
  let h: ReturnType<typeof db>;
  beforeEach(() => { h = db(); });

  it('sets closed_at and the reason, and NEVER worked_at or an outcome', async () => {
    const ok = await markSkipped(h.client as any, 'rep1', 's1', 'wrong_number', new Date('2026-09-03T12:00:00Z'));
    expect(ok).toBe(true);
    const u = h.updates[0];
    expect(u.table).toBe('sales_opportunity');
    expect(u.patch.close_reason).toBe('skipped');
    expect(u.patch.skip_reason).toBe('wrong_number');
    expect(u.patch.worked_at, 'a skip is not work').toBeUndefined();
    expect(u.patch.outcome).toBeUndefined();
  });

  it('is scoped to this rep, this student, today, and only while still open', async () => {
    await markSkipped(h.client as any, 'rep1', 's1', 'ran_out_of_time', new Date('2026-09-03T12:00:00Z'));
    const u = h.updates[0];
    expect(u.filters).toContainEqual(['rep_id', 'rep1']);
    expect(u.filters).toContainEqual(['student_id', 's1']);
    expect(u.filters).toContainEqual(['ist_day', '2026-09-03']);
    expect(u.isNull, 'a skip must never overwrite a disposition that landed first').toContain('closed_at');
  });

  it('a failed write is reported, never swallowed as success', async () => {
    h.setAnswer({ data: null, error: { message: 'boom' } });
    expect(await markSkipped(h.client as any, 'rep1', 's1', 'wrong_number')).toBe(false);
  });
});

describe('closeDay — the shift ends and the record completes itself', () => {
  let h: ReturnType<typeof db>;
  beforeEach(() => { h = db(); });

  it('stamps only OPEN rows from days that have already ended', async () => {
    h.setAnswer({ data: [{ ist_day: '2026-09-02' }, { ist_day: '2026-09-02' }, { ist_day: '2026-08-30' }], error: null });
    const r = await closeDay(h.client as any, new Date('2026-09-03T16:15:00Z'));
    expect(r.ok).toBe(true);
    expect(r.closed).toBe(3);
    expect(r.days).toEqual(['2026-08-30', '2026-09-02']);
    const u = h.updates[0];
    expect(u.patch.close_reason).toBe('not_marked');
    expect(u.patch.worked_at, 'the sweep is not work either').toBeUndefined();
    expect(u.isNull).toContain('closed_at');
    expect(u.filters, "today's cards are still the counsellor's to mark")
      .toContainEqual(['lt:ist_day', '2026-09-03']);
  });

  it('a missed run repairs itself — every past day is swept, not just yesterday', async () => {
    h.setAnswer({ data: [{ ist_day: '2026-08-30' }, { ist_day: '2026-09-01' }, { ist_day: '2026-09-02' }], error: null });
    const r = await closeDay(h.client as any, new Date('2026-09-03T16:15:00Z'));
    expect(r.days).toEqual(['2026-08-30', '2026-09-01', '2026-09-02']);
  });

  it('a quiet sweep is a success with zero closed, not a failure', async () => {
    h.setAnswer({ data: [], error: null });
    const r = await closeDay(h.client as any, new Date('2026-09-03T16:15:00Z'));
    expect(r.ok).toBe(true);
    expect(r.closed).toBe(0);
  });

  it('a failed sweep says so — it never reports a clean day it did not achieve', async () => {
    h.setAnswer({ data: null, error: { message: 'timeout' } });
    const r = await closeDay(h.client as any, new Date('2026-09-03T16:15:00Z'));
    expect(r.ok).toBe(false);
    expect(r.closed).toBe(0);
    expect(r.error).toContain('timeout');
  });
});

/**
 * Strip comments before asserting on source.
 *
 * This repo has paid for the comment-matching trap more than once, and this
 * guard walked straight into it on its first run: the skip branch EXPLAINS in
 * a comment why it does not call markWorked, and the assertion "the branch
 * must not contain markWorked" matched that very sentence. A guard that reads
 * prose is a guard that fails when the prose is right.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the skip path in the API, pinned at the source', () => {
  const route = stripComments(readFileSync('src/app/api/sales/log/route.ts', 'utf8'));

  it('A SKIP CHANGES NOTHING ABOUT THE STUDENT — it returns before every state write', () => {
    // The property that makes a skip safe: the student is untouched, so they
    // return to tomorrow's queue on the same terms. If this branch ever falls
    // through to the lead_outreach upsert it would stamp last_attempt_at and
    // silence the student for the 7-day cooldown without anyone calling them.
    const start = route.indexOf("if (outcome === 'skipped')");
    const endMarker = 'return NextResponse.json({ ok: true, skipped: true });';
    const end = route.indexOf(endMarker, start);
    // Both anchors must exist, or this guard would slice the whole file and
    // pass (or fail) for reasons that have nothing to do with the branch.
    expect(start, 'the skip branch must exist').toBeGreaterThan(-1);
    expect(end, 'the skip branch must return early').toBeGreaterThan(start);
    const body = route.slice(start, end + endMarker.length);
    expect(body, 'a skip must not write lead state').not.toContain("from('lead_outreach')");
    expect(body, 'a skip must not start a clock').not.toContain('planDisposition');
    expect(body, 'a skip must not schedule a follow-up').not.toContain('scheduleFollowup');
    expect(body, 'a skip must not enter the learning ledger').not.toContain('recordIntervention');
    expect(body, 'a skip is not work').not.toContain('markWorked');
    expect(body).toContain('markSkipped');
  });

  it('the reason is required, and validated against the shared vocabulary', () => {
    expect(route).toContain('isSkipReason(skipReason)');
  });

  it('a skip that fails to close the card is an error, not a silent success', () => {
    // markWorked is best-effort by design (the call is already saved). For a
    // skip the close IS the whole action, so it must be checked.
    const start = route.indexOf("if (outcome === 'skipped')");
    const end = route.indexOf('return NextResponse.json({ ok: true, skipped: true });', start);
    expect(route.slice(start, end)).toMatch(/if \(!closed\)/);
  });
});

describe('the day-close cron is real and scheduled', () => {
  it('answers GET, because Vercel Cron invokes with GET (Incidents #55/#56)', () => {
    const src = readFileSync('src/app/api/cron/day-close/route.ts', 'utf8');
    expect(src).toMatch(/export \{ POST as GET \}/);
    expect(src).toContain('closeDay');
  });

  it('runs after the 15:00–21:00 IST shift, never during it', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
    const cron = vercel.crons.find((c) => c.path === '/api/cron/day-close');
    expect(cron, 'the sweep must be scheduled or the day never closes').toBeTruthy();
    const [minute, hour] = cron!.schedule.split(' ');
    // IST = UTC + 5:30. The shift ends at 21:00 IST = 15:30 UTC.
    const utcMinutes = Number(hour) * 60 + Number(minute);
    expect(utcMinutes, 'the sweep must not close cards a counsellor is still working')
      .toBeGreaterThan(15 * 60 + 30);
    expect(utcMinutes, 'and it must land the same IST day, before midnight')
      .toBeLessThan(18 * 60 + 30);
  });
});
