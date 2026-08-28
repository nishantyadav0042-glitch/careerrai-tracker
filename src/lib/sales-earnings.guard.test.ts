import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_PRODUCTS } from './plans';

// ── ONE PLACE DECIDES WHAT A PERSON IS PAID ─────────────────────────────────
//
// Anshul Yadav and Neelam are paid from lib/sales-earnings.ts and nothing
// else. This is the same defence the repo already puts around daily hours
// (Incident #22) and mentor bookability: the rule is worth nothing if a second
// copy can appear, and money is where a second copy costs the most.
//
// Incident #23 is the pattern: a rule in N places drifts N−1 times. A payroll
// number that drifts is not a bug report, it is a person being underpaid.

const SRC = join(process.cwd(), 'src');
const AUTHORITY = 'src/lib/sales-earnings.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

/** Comments stripped — this repo has repeatedly been bitten by guards that matched their own prose. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = walk(SRC)
  .map((f) => [f.slice(process.cwd().length + 1), codeOnly(readFileSync(f, 'utf8'))] as const)
  .filter(([f]) => !f.includes('.test.'));

describe('the sweep sees the codebase', () => {
  it('walks a real tree', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some(([f]) => f === AUTHORITY)).toBe(true);
  });
});

describe('nobody else computes an incentive', () => {
  it('no second place multiplies money by a commission rate', () => {
    // The shapes a hand-rolled commission takes: a percentage applied to an
    // amount, or a hard-coded 0.1 / 10 next to something money-shaped.
    const shape = /(amount|paise|realis|revenue|booked)\w*\s*[*]\s*0?\.?1\b|[*]\s*(incentive|commission)\w*\s*\/\s*100|\bincentivePercent\b\s*[)]?\s*[/*]/i;
    const offenders = files.filter(([f, c]) => f !== AUTHORITY && shape.test(c)).map(([f]) => f);
    expect(
      offenders,
      'These compute pay themselves. Call computePayslip()/incentiveForPaise() instead:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the fixed monthly fee is never typed as a literal outside the authority', () => {
    // ₹8,000 is a term in a signed letter, held in sales_rep_config. A literal
    // 800000 or 8000 in a payroll context means someone stopped reading config.
    const shape = /(monthly_?fixed|fixedPaise|fixed_?fee)\s*[:=]\s*\d{3,}/i;
    const offenders = files.filter(([f, c]) => f !== AUTHORITY && shape.test(c)).map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

describe('pay comes from the frozen ledger, never from today’s ownership', () => {
  it('no surface pays from lead_outreach.owner_id', () => {
    // The whole reason sales_conversions exists. owner_id is MUTABLE —
    // reassign-lead and distribute-leads both rewrite it — so paying from it
    // moves money that has already been earned.
    const paysFromOwner = files.filter(([f, c]) => {
      if (f === AUTHORITY) return false;
      // Only `owed` is word-bounded, and only because an unanchored /owed/
      // matches "allowed" — ordinary capacity vocabulary in the distribution
      // route, which this guard wrongly flagged on its first run.
      //
      // The rest stay UNANCHORED on purpose: identifiers here are camelCase,
      // so \bearnings\b cannot match `repEarningsQuick` — the exact shape a
      // second payroll reader would take. Anchoring them made this test pass
      // against a planted violation, which is worse than not having it.
      const money = /incentive|payslip|payroll|earnings|\bowed\b/i.test(c);
      const owner = /owner_id/.test(c) && /lead_outreach/.test(c);
      return money && owner;
    }).map(([f]) => f);
    expect(
      paysFromOwner,
      'These mix payroll with mutable lead ownership. Read sales_conversions:\n  ' + paysFromOwner.join('\n  '),
    ).toEqual([]);
  });

  it('only the authority writes the conversion ledger', () => {
    const writers = files.filter(([, c]) =>
      /from\(['"]sales_conversions['"]\)[\s\S]{0,120}\.(insert|upsert|update|delete)\(/.test(c),
    ).map(([f]) => f);
    expect(writers, 'sales_conversions must be written only through lib/sales-earnings.ts').toEqual([AUTHORITY]);
  });
});

describe('a refund actually leaves the paid ledger', () => {
  const webhook = codeOnly(readFileSync('src/app/api/payments/webhook/route.ts', 'utf8'));
  const activate = codeOnly(readFileSync('src/lib/activate-payment.ts', 'utf8'));

  it('the refund branch calls settleRefund', () => {
    // Until 28 Aug 2026 the refund path revoked premium and stopped there, so
    // student_payments.status stayed 'paid' forever: refunded money counted as
    // revenue and would have paid a 10% incentive (Clause 7 says it must not).
    expect(webhook).toMatch(/settleRefund\(/);
  });

  it('settleRefund writes both the status and the time', () => {
    expect(activate).toMatch(/status:\s*'refunded'/);
    expect(activate).toMatch(/refunded_at:/);
  });

  it('settleRefund only moves a row that still claims to be paid', () => {
    // Idempotence: a redelivered refund must not overwrite refunded_at with a
    // later timestamp and quietly shift which month loses the incentive.
    const body = activate.slice(activate.indexOf('export async function settleRefund'));
    expect(body).toMatch(/\.eq\(['"]status['"],\s*['"]paid['"]\)/);
  });

  it('the payment activation path records who closed the sale', () => {
    expect(activate).toMatch(/recordConversion\(/);
  });
});

describe('the incentive table in the signed letters stays reproducible', () => {
  it('every product’s 10% lands on a whole rupee, as the letters print it', () => {
    // The letters give Anshul and Neelam a three-row table: ₹40, ₹100, ₹260.
    // If a future price makes 10% land off a rupee boundary, the letter and
    // the payslip stop agreeing and this test is where we find out.
    for (const p of ALL_PRODUCTS) {
      const tenPct = (p.offerPaise * 10) / 100;
      expect(
        Math.abs(Math.round(tenPct / 100) * 100 - tenPct),
        `${p.id} at ${p.display}: 10% is ₹${tenPct / 100}, which does not sit on a rupee. ` +
        'Either the price or the letter’s table needs revisiting.',
      ).toBeLessThanOrEqual(50);
    }
  });
});
