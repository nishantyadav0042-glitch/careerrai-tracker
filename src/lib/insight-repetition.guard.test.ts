import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { outcomeWroteRow, type DispatchOutcome } from './notification-os';
import { join } from 'node:path';

// ── The insight the student SEES is what must be recorded ──────────────────
//
// Production, 27 Aug. Of 54 students who received a Daily Insight in 14 days:
//
//   21 (39%)  had ZERO successful sends and therefore NO ledger rows at all
//   28 (52%)  received an IDENTICAL insight body on three or more days
//
// One account received "Only 0 of 5 VARC tasks done" on ELEVEN CONSECUTIVE
// DAYS — 15,16,17,18,19,20,21,22,24,25,26 Aug — with nine sends recorded
// `failed`, zero pushes delivered, and an empty daily_insight_shown.
//
// The cause was one condition. The cron recorded the show only when
// dispatch() returned 'sent':
//
//     if (outcome === 'sent') { recordInsightShown(...) }
//
// But dispatch() writes the notification ROW FIRST and attempts the push
// AFTER. On a dead subscription it returns 'failed' — with the row already
// written and visible in the student's tray. Nothing was recorded, so the
// next day nothing was suppressed, the same rule fired, and the same sentence
// was written again. Forever, for anyone whose push does not work.
//
// It looked perfectly healthy from every angle: one row per student per day,
// no duplicates, no errors, a suppression ledger that "worked" for everyone
// who could receive a push.
//
// THE DISTINCTION THIS PINS: the notifications row is the EVENT (the student
// saw it); pushed_at is the DELIVERY. The ledger records the former. Any gate
// that conditions the record on the DELIVERY reintroduces this bug.

const CRON = readFileSync('src/app/api/cron/daily-insight/route.ts', 'utf8');
const code = CRON.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('a shown insight is recorded even when its push fails', () => {
  it('records on failed and daily_cap, where the row exists', () => {
    // Asserted on the shared predicate. These literals used to live in the
    // cron; they moved into outcomeWroteRow() when 'failed' was split, and a
    // test that kept reading the cron would have gone quietly vacuous.
    expect(outcomeWroteRow('failed'), 'push failed but the row exists').toBe(true);
    expect(outcomeWroteRow('daily_cap'), 'push capped but the row exists').toBe(true);
  });

  it('the record is NOT gated on delivery alone', () => {
    // The exact shape of the defect: recording only on 'sent'.
    expect(
      /if \(outcome === 'sent'\)\s*\{[^}]*recordInsightShown/.test(code),
      'Recording only on a delivered push is the eleven-consecutive-days bug: the row is written, the student sees it, and nothing is remembered.',
    ).toBe(false);
  });

  it('recordInsightShown is still reached', () => {
    expect(code).toMatch(/recordInsightShown\(admin, s\.id, insight\)/);
  });

  it('the row-existence question is answered by dispatch, not guessed from the enum', () => {
    // 'failed' used to mean BOTH "the insert failed" (no row) and "the push
    // failed" (row exists). A gate that recorded on a bare 'failed' would
    // sometimes record an insight the student never saw — silently costing
    // them a real one for seven days, which is the same class of bug this
    // file exists to prevent. dispatch() now separates them.
    const wrote: DispatchOutcome[] = ['sent', 'failed', 'daily_cap'];
    const didNot: DispatchOutcome[] = ['budget_exhausted', 'create_failed', 'duplicate_suppressed'];
    for (const o of wrote) expect(outcomeWroteRow(o), `${o} writes a row`).toBe(true);
    for (const o of didNot) expect(outcomeWroteRow(o), `${o} writes NO row`).toBe(false);
  });

  it('the cron asks that authority rather than repeating the list', () => {
    expect(code).toMatch(/const rowWasWritten = outcomeWroteRow\(outcome\)/);
  });

  it('does NOT record when dispatch wrote no row', () => {
    // budget_exhausted and duplicate_suppressed create nothing; recording them
    // would silence tomorrow's genuinely-new insight. Asserted on the CONDITION
    // itself rather than on proximity — a distance-based regex silently stopped
    // matching when the expression grew, which is how this test first passed
    // against a deliberately broken version.
    // Asserted on the shared predicate, which is now the single authority for
    // "did a row get written". Reading a duplicated list out of the cron was
    // how an earlier version of this test silently stopped matching.
    const src = readFileSync('src/lib/notification-os.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function outcomeWroteRow'));
    const outcomes = [...fn.slice(0, fn.indexOf('}')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(
      outcomes,
      'outcomeWroteRow must be true for exactly the outcomes in which dispatch() has already written a notifications row — no more, no fewer.',
    ).toEqual(['daily_cap', 'failed', 'sent']);
  });

  it('the "sent" counter still means delivered, not merely written', () => {
    // The metric must not silently become "rows created" — that is how the
    // original confusion started.
    expect(code).toMatch(/if \(outcome === 'sent'\) sent\+\+/);
  });
});

describe('the ledger is written by exactly one function', () => {
  it('no second recorder exists', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(n) || /\.test\.tsx?$/.test(n)) continue;
        const c = readFileSync(p, 'utf8').replace(/\/\/[^\n]*/g, '');
        if (/from\('daily_insight_shown'\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\s*\(/.test(c)) hits.push(p);
      }
    };
    walk('src');
    expect(
      hits,
      'daily_insight_shown must be written only by recordInsightShown in daily-insight.ts — a second writer is a second answer to "what has this student already been told":\n  ' +
        hits.join('\n  '),
    ).toEqual(['src/lib/daily-insight.ts']);
  });
});
