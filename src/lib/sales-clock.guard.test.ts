import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nextActionAtFromDate } from './sales-disposition';

// ── SA-1A: there is exactly ONE next-action clock ──────────────────────────
//
// The Part-1 forensic proved the rep path and the admin path kept separate
// clocks (next_action_at vs next_follow_up) that neither ever read from the
// other — so a rep's callback was invisible to /admin/sales and an admin's
// follow-up was invisible to /sales. These guards pin the consolidation:
// every writer writes next_action_at, every reader reads it, and the
// deprecated column cannot quietly re-grow readers or writers.

describe('nextActionAtFromDate — the one cadence model', () => {
  it('maps an admin date to 11:00 IST that day (the same late-morning slot the cadence engine uses)', () => {
    expect(nextActionAtFromDate('2026-08-25')).toBe('2026-08-25T05:30:00.000Z');
  });

  it('round-trips back to the same IST calendar date the admin picked', () => {
    const iso = nextActionAtFromDate('2026-12-31');
    expect(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).toBe('2026-12-31');
  });
});

// Files that must speak ONLY the canonical clock. sales-deck.tsx is
// deliberately absent: it still posts the legacy `next_follow_up` BODY ALIAS
// (mapped server-side to next_action_at) and retires wholesale in SA-1B —
// adding it here would just move when we delete it, not what production does.
const CLOCK_CLEAN_FILES = [
  'src/lib/sales-queue.ts',
  'src/lib/call-queue.ts',
  'src/lib/sales-portfolio.ts',
  'src/lib/sales-conversion.ts',
  'src/app/admin/leads/[id]/page.tsx',
  'src/app/admin/leads/[id]/outreach-panel.tsx',
  'src/app/api/sales/log/route.ts',
];

describe('one authoritative next-action field', () => {
  it.each(CLOCK_CLEAN_FILES)('%s never touches the deprecated next_follow_up', (file) => {
    expect(readFileSync(file, 'utf8')).not.toContain('next_follow_up');
  });

  it('the admin outreach route writes ONLY next_action_at (legacy body key is an alias, not a column write)', () => {
    const s = readFileSync('src/app/api/admin/outreach/route.ts', 'utf8');
    expect(s).toContain('next_action_at: followDate ? nextActionAtFromDate(followDate) : null');
    // The literal next_follow_up may appear only as the renamed legacy body
    // alias — never as a payload key reaching the database.
    const uses = [...s.matchAll(/next_follow_up/g)].length;
    expect(s).toContain('next_follow_up: legacyNextFollowUp');
    const aliasAndCommentUses = [...s.matchAll(/next_follow_up: legacyNextFollowUp|`next_follow_up`/g)].length;
    expect(uses).toBe(aliasAndCommentUses);
  });

  it('both queue authorities read the same clock column', () => {
    expect(readFileSync('src/lib/call-queue.ts', 'utf8')).toContain('next_action_at');
    expect(readFileSync('src/lib/sales-queue.ts', 'utf8')).toContain('next_action_at');
  });
});

// ── SA-1B: the admin's queue IS the rep's queue ────────────────────────────
// /admin/sales renders buildCallQueue — the canonical authority — never a
// parallel ranking. buildSalesQueue still exists (retired in a separate
// commit after caller re-proof); this guard stops the admin page from
// quietly drifting back to it.
describe('one queue authority on the admin surface', () => {
  it('/admin/sales consumes buildCallQueue, not buildSalesQueue', () => {
    const s = readFileSync('src/app/admin/sales/page.tsx', 'utf8');
    expect(s).toContain("from '@/lib/call-queue'");
    expect(s).not.toContain('buildSalesQueue');
  });
});
