import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mayActivatePayment } from './activate-payment';

// ── student_payments.status means ONE thing everywhere ──────────────────────
//
// The column has exactly four values, fixed by a CHECK constraint since the
// table was created:
//
//   created   an order exists; no money has moved
//   paid      money reached us and is still ours
//   failed    the attempt did not complete
//   refunded  money reached us and went back
//
// 'refunded' was legal from day one and NOTHING WROTE IT until 28 Aug 2026.
// Every reader in the tree was therefore written against a three-value world,
// and each one silently chose a side the day the fourth value appeared:
//
//   .eq('status','paid')      → refunds now correctly excluded. Improved.
//   .neq('status','paid')     → refunds now counted as "did not pay". WRONG
//                               wherever that means "abandoned checkout": a
//                               refunded student completed, then reversed.
//   row.status !== 'paid'     → "not yet activated". WRONG: it let a
//                               redelivered payment.captured re-activate a
//                               refunded payment and hand premium back.
//
// Two live defects came out of that (mission-queue, and both activation entry
// points). This guard exists so the third one cannot.

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = walk(SRC)
  .map((f) => [f.slice(process.cwd().length + 1), strip(readFileSync(f, 'utf8'))] as const)
  .filter(([f]) => !f.includes('.test.'));

describe('the sweep sees the codebase', () => {
  it('walks a real tree', () => expect(files.length).toBeGreaterThan(200));
});

describe('"not paid" is never written ambiguously', () => {
  it('nothing uses .neq(status, paid) on payments', () => {
    // The ambiguity itself is the defect. `.neq('status','paid')` reads as
    // "hasn't paid" and silently includes refunded — which is a completed
    // purchase that was reversed, not an abandoned one. Anything meaning
    // "still trying to pay" must say so explicitly.
    const offenders = files
      .filter(([, c]) => /from\(['"]student_payments['"]\)[\s\S]{0,300}\.neq\(\s*['"]status['"]\s*,\s*['"]paid['"]\s*\)/.test(c))
      .map(([f]) => f);
    expect(
      offenders,
      'Say which statuses you mean. A refunded payment is not an abandoned checkout:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('no activation path compares status to the bare string paid', () => {
    // `row.status !== 'paid'` was the guard on BOTH activation entry points,
    // and it was the only thing stopping re-activation after a refund — by
    // accident, because refunds used to leave the status at 'paid'.
    const offenders = files
      .filter(([f]) => /payments\/(webhook|callback)\/route\.ts$/.test(f))
      .filter(([, c]) => /status\s*!==\s*['"]paid['"]/.test(c))
      .map(([f]) => f);
    expect(offenders, 'Use mayActivatePayment(row.status):\n  ' + offenders.join('\n  ')).toEqual([]);
  });
});

describe('the four statuses, and what each one means for activation', () => {
  it('only money that has not settled either way may be activated', () => {
    const table: Array<[string | null | undefined, boolean]> = [
      ['created', true],    // no money yet — activate on capture
      ['failed', true],     // a late capture is legitimate
      ['paid', false],      // duplicate delivery
      ['refunded', false],  // money went back; re-activating hands premium to a refunded student
      [undefined, true],    // reconcile-payments filters in the query
      [null, true],
    ];
    for (const [status, expected] of table) {
      expect(mayActivatePayment(status), `status=${String(status)}`).toBe(expected);
    }
  });

  it('an unknown status is treated as activatable, not silently blocked', () => {
    // Stated so the choice is deliberate rather than accidental: a status we
    // do not recognise means our model is out of date, and refusing to unlock
    // a paying student on that basis is the worse failure. The DB CHECK
    // constraint is what actually prevents an unknown value existing.
    expect(mayActivatePayment('something_new')).toBe(true);
  });
});

describe('money surfaces count settled money only', () => {
  it('revenue and payroll readers filter to status=paid explicitly', () => {
    // Each of these sums or counts rupees. After 28 Aug they are correct
    // precisely because they name 'paid' — this test is what keeps them named.
    const MONEY_READERS = [
      'src/lib/payment-funnel.ts',
      'src/lib/os/sacred-guard.ts',
      'src/lib/sales-portfolio.ts',
      'src/lib/sales-control-tower.ts',
      'src/app/admin/sales-performance/page.tsx',
    ];
    for (const f of MONEY_READERS) {
      const c = files.find(([n]) => n === f)?.[1];
      expect(c, `${f} not found — update this list if it moved`).toBeTruthy();
      expect(c, `${f} must filter payments to status='paid'`)
        .toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]paid['"]\s*\)/);
    }
  });
});
