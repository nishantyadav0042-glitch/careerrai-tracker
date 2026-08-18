import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFact } from './facts/registry';

// ── 0C.3b-i — THE FIRST-LOG RULE BECOMES A FACT CONSUMER ────────────────────
//
// docs/0C-3B-PRODUCER-INVESTIGATION.md, Part 8: of computePrescriptiveLine's
// six behaviours, exactly ONE is cleared to migrate — rule 1, "first log",
// on the existing `logged_days_total`. Rules 3-6 stay blocked pending the
// daily-report semantics rulings; rule 2 is a product decision. This gate
// moves rule 1 and nothing else.
//
// WHY IT IS SAFE, and why it is the only one that is: rule 1 asks an EVENT
// STATE question — "has this student logged before?" — which `logged_days_total`
// already answers canonically by counting distinct CareerRai days. Rules 3-6
// ask about windows, sections and durations, all of which sit on the
// ambiguous evidence the 0C.3d audits documented.
//
// PARITY. The old expression was `recent.length - (isNewLogForDate ? 1 : 0)`,
// where `recent` is capped at `.limit(14)`. Rows are date-unique by database
// constraint, so for <= 14 rows the two agree exactly. Above 14 the old count
// is >= 13 and the new one >= 14 — both > 0, so the branch outcome is
// identical. The migration cannot change which students see the line.

describe('logged_days_total answers the first-log question', () => {
  const total = (logDates: string[]) => {
    const r = getFact('logged_days_total').produce({ logDates });
    expect(r.known).toBe(true);
    return r.known ? r.value : -1;
  };

  it('a brand-new student writing their first log has no prior day', () => {
    // The row exists by the time the rule runs, so today's date is present.
    expect(total(['2026-08-18']) - 1).toBe(0);
  });

  it('a returning student has prior days', () => {
    expect(total(['2026-08-18', '2026-08-17']) - 1).toBe(1);
  });

  it('an EDIT of an existing log is not a first log', () => {
    // isNewLogForDate is false, so nothing is subtracted.
    expect(total(['2026-08-18', '2026-08-17']) - 0).toBe(2);
  });

  it('agrees with the old row count wherever the old count was valid', () => {
    // Date-unique rows, under the old .limit(14) cap.
    for (const n of [1, 2, 3, 7, 13, 14]) {
      const dates = Array.from({ length: n }, (_, i) => `2026-08-${String(18 - i).padStart(2, '0')}`);
      expect(total(dates), `${n} logged days`).toBe(n);
    }
  });

  it('does not miscount a student past the old 14-row cap', () => {
    // The old expression saturated at 14 and could never reach 0 there; the
    // fact keeps counting, and both stay > 0, so the branch is unchanged.
    const dates = Array.from({ length: 30 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
    expect(total(dates)).toBe(30);
    expect(total(dates) - 1).toBeGreaterThan(0);
  });
});

describe('the route consumes the fact instead of counting rows', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/logging/log-daily/route.ts'), 'utf8');
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('rule 1 asks the registry', () => {
    const i = code.indexOf('priorLoggedDays');
    expect(i, 'the first-log rule must exist').toBeGreaterThan(-1);
    const block = code.slice(Math.max(0, i - 400), i + 400);
    expect(block).toContain("getFact('logged_days_total')");
  });

  it('the old row-count expression is gone', () => {
    expect(code).not.toMatch(/\(recent \?\? \[\]\)\.length - \(isNewLogForDate \? 1 : 0\)/);
  });

  it('the first-log copy is unchanged — this is a migration, not a rewrite', () => {
    expect(code).toContain("First log done. Do this daily and in 2 weeks you'll see a pattern you can't see now.");
  });

  it('rules 2-6 are untouched, exactly as the investigation ruled', () => {
    // The three-log gate, the chip branch, the row-window slices and the
    // avoidance/mock/single-section loops all stay as they are. They are wrong
    // in ways now written down; changing them before the semantics are ruled
    // would just move the wrongness.
    expect(code).toContain('recent.length < 3');
    expect(code).toContain('mock_scared');
    expect(code).toMatch(/recent\.slice\(0, 7\)/);
    expect(code).toContain('Day ${days} of skipping');
    expect(code).toContain('days straight on');
  });

  it('does not add a second daily_reports fetch to the sacred log path', () => {
    // The dates are fetched once and shared with the coverage-insight consumer
    // that already needed them, so the migration costs no extra query.
    expect((code.match(/select\('report_date'\)/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
