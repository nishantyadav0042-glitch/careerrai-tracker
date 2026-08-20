import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── SA-1C: the sales-ready list must be able to SHRINK ─────────────────────
//
// Forensic finding P1-D: getSalesReadyToCall filtered on sales_called_at IS
// NULL, and no code anywhere wrote sales_called_at — 363 students flagged,
// zero ever cleared. The list was a ratchet.
//
// The drain is now call HISTORY: a sales_activity row with one of the five
// call dispositions removes the student from the list. The vocabulary is
// IMPORTED from lib/sales-disposition, never re-listed here — so a future
// non-call activity status (a reassignment, a note) cannot accidentally
// drain the signal, and a new call outcome drains it automatically.

const FILE = 'src/lib/admin-filters.ts';
const src = () => readFileSync(FILE, 'utf8');

describe('the sales-ready drain', () => {
  it('no longer filters on the never-written sales_called_at column', () => {
    expect(src()).not.toMatch(/is\('sales_called_at'/);
  });

  it('drains via sales_activity using the imported call vocabulary', () => {
    const s = src();
    expect(s).toContain("import { CALL_OUTCOMES } from '@/lib/sales-disposition'");
    expect(s).toMatch(/from\('sales_activity'\)/);
    expect(s).toMatch(/\.in\('status', CALL_OUTCOMES/);
  });

  it('does not re-list the disposition vocabulary locally', () => {
    // The one authority for what counts as a call is lib/sales-disposition.
    expect(src()).not.toMatch(/'no_answer'\s*,\s*'interested'|'interested'\s*,\s*'callback'/);
  });
});
