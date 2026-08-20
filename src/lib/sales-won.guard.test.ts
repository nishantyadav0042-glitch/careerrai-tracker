import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { summarizePortfolio } from './sales-portfolio';

// ── SA-1E: one financial truth ─────────────────────────────────────────────
//
// WON = student_payments.status='paid'. The typed 'converted' disposition is
// a rep's claim — useful as a signal, never counted as money. The 48-hour
// audit's rule in one line: student_payments is the financial ledger;
// everything else is observability.

describe('WON derives from the ledger, not the keyboard', () => {
  it('a lead typed converted but never paid is NOT won', () => {
    const s = summarizePortfolio([{ status: 'converted', paid: false }], []);
    expect(s.converted).toBe(0);
    expect(s.booked).toBe(0);
    expect(s.working).toBe(1); // still open work — the money never arrived
  });

  it('a paid lead is won regardless of what a salesperson typed', () => {
    const s = summarizePortfolio(
      [{ status: 'interested', paid: true }, { status: 'no_answer', paid: true }],
      [99900, 299900],
    );
    expect(s.converted).toBe(2);
    expect(s.booked).toBe(3998); // real rupees from the ledger, not count × price
  });

  it('lost stays a disposition; won and lost never double-count a lead', () => {
    const s = summarizePortfolio(
      [{ status: 'not_interested', paid: false }, { status: 'follow_up', paid: false }],
      [],
    );
    expect(s.lost).toBe(1);
    expect(s.working).toBe(1);
  });
});

describe('the reader surfaces actually query the ledger', () => {
  it('the portfolio authority reads student_payments paid rows', () => {
    const s = readFileSync('src/lib/sales-portfolio.ts', 'utf8');
    expect(s).toMatch(/from\('student_payments'\)[\s\S]{0,80}eq\('status', 'paid'\)/);
    // The old lie must not return: booked was count-of-typed-converted × price.
    expect(s).not.toMatch(/booked:\s*converted\s*\*\s*PRICE/);
  });

  it('the performance page reads student_payments paid rows', () => {
    const s = readFileSync('src/app/admin/sales-performance/page.tsx', 'utf8');
    expect(s).toMatch(/from\('student_payments'\)[\s\S]{0,80}eq\('status', 'paid'\)/);
    expect(s).not.toMatch(/pc\('converted'\)/);
  });

  it("the rep's Won list is the paid list", () => {
    const s = readFileSync('src/app/sales/leads/page.tsx', 'utf8');
    expect(s).toMatch(/label: 'Won', match: \(l\) => l\.paid/);
  });
});
