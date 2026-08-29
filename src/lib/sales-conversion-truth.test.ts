import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  resolveConvertedClaim,
  isClosedForSales,
  unbackedConversionException,
} from './sales-conversion-truth';

describe('resolveConvertedClaim — only money converts', () => {
  it('a paid payment makes it a real conversion', () => {
    const r = resolveConvertedClaim(true);
    expect(r.status).toBe('converted');
    expect(r.isUnbackedClaim).toBe(false);
  });

  // THE BUG. One mistaken tap used to delete a student from every queue.
  it('a claim with no payment keeps the student actionable', () => {
    const r = resolveConvertedClaim(false);
    expect(r.status).toBe('interested');
    expect(r.isUnbackedClaim).toBe(true);
    expect(r.reason).toContain('stays in the book');
  });

  // L1: an unreadable ledger is not "they did not pay". Downgrading a genuine
  // conversion because of a transient database error would be a precise lie in
  // the opposite direction.
  it('an unreadable ledger keeps the student actionable and says why', () => {
    const r = resolveConvertedClaim(null);
    expect(r.status).toBe('interested');
    expect(r.isUnbackedClaim).toBe(true);
    expect(r.reason).toContain('could not be read');
    expect(r.reason).not.toContain('No paid payment exists');
  });

  it('never returns converted without a payment, for any input', () => {
    for (const v of [false, null] as const) {
      expect(resolveConvertedClaim(v).status).not.toBe('converted');
    }
  });
});

describe('isClosedForSales', () => {
  it('payment closes a student', () => {
    expect(isClosedForSales(null, true)).toBe(true);
    expect(isClosedForSales('interested', true)).toBe(true);
  });

  // The heart of Incident #52: the typed status alone must close nobody.
  it('a typed converted with no payment does NOT close the student', () => {
    expect(isClosedForSales('converted', false)).toBe(false);
  });

  it("the student's own words close them", () => {
    expect(isClosedForSales('not_interested', false)).toBe(true);
    expect(isClosedForSales('dnd', false)).toBe(true);
    expect(isClosedForSales('unqualified', false)).toBe(true);
  });

  it('ordinary working states stay open', () => {
    for (const s of ['not_contacted', 'called', 'interested', 'follow_up', 'no_answer', null]) {
      expect(isClosedForSales(s, false)).toBe(false);
    }
  });
});

describe('unbackedConversionException', () => {
  const args = { studentId: 's1', studentName: 'Rahul Sharma', repName: 'Anshul', claimedAtMs: 1_000 };

  it('names both people and both facts', () => {
    const e = unbackedConversionException(args, 2_000);
    expect(e.code).toBe('converted_unpaid');
    expect(e.severity).toBe('high');
    expect(e.reason).toContain('Anshul');
    expect(e.reason).toContain('Rahul Sharma');
    expect(e.reason).toContain('no payment exists');
  });

  it('drills into the exact student, never a list', () => {
    const e = unbackedConversionException(args, 2_000);
    expect(e.destination).toBe('/sales/student/s1');
    expect(e.entity.id).toBe('s1');
  });

  it('dedupes across recomputes but not across separate claims', () => {
    const a = unbackedConversionException(args, 2_000);
    const b = unbackedConversionException(args, 9_999);
    const c = unbackedConversionException({ ...args, claimedAtMs: 5_000 }, 2_000);
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
  });
});

// ── Guards: the bug must not be reintroduced by a later edit ────────────────

const read = (f: string) => fs.readFileSync(f, 'utf-8');

describe('Incident #52 stays fixed', () => {
  it('call-queue no longer holds a hardcoded CLOSED set containing converted', () => {
    const q = read('src/lib/call-queue.ts');
    expect(q, 'the payment-aware rule must be used').toMatch(/isClosedForSales\s*\(/);
    expect(q, "a literal CLOSED set with 'converted' is exactly the bug")
      .not.toMatch(/CLOSED\s*=\s*new Set\(\[[^\]]*'converted'/);
  });

  it('the queue reads the payment ledger, not just the is_premium flag', () => {
    const q = read('src/lib/call-queue.ts');
    expect(q).toMatch(/from\('student_payments'\)[\s\S]{0,120}'paid'/);
  });

  it('the log route resolves a converted claim against the ledger before writing state', () => {
    const r = read('src/app/api/sales/log/route.ts');
    expect(r).toMatch(/resolveConvertedClaim\s*\(/);
    // The resolution must happen BEFORE planDisposition, or the corrected
    // outcome never reaches the state write.
    expect(r.indexOf('resolveConvertedClaim')).toBeLessThan(r.indexOf('planDisposition(effectiveOutcome'));
  });

  it('a student with no phone is never dealt as a card', () => {
    const q = read('src/lib/call-queue.ts');
    expect(q, 'uncontactable students must be suppressed from the queue')
      .toMatch(/if \(!r\.phone \|\| r\.phone\.trim\(\) === ''\) continue;/);
  });
});
