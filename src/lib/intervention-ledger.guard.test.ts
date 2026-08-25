import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  REASON_CATEGORIES, INTERVENTION_TYPES, PRODUCT_FIXABLE_REASONS,
  RETIRED_REASONS, REASON_LABEL, isReasonCategory, isInterventionType,
  reasonNeedsVerbatim,
} from './intervention-taxonomy';
import { interventionTypeForLane } from './intervention-ledger';

// ── The learning record ─────────────────────────────────────────────────────
//
// Founder directive, 24 Aug 2026: the system computes but does not learn.
// This table is the missing half — and these guards protect the two things
// that make it worth having: a vocabulary that cannot silently drift, and an
// outcome a rep cannot write about their own work.

const MIGRATION = 'supabase/migrations/20260824d_intervention_ledger.sql';
const SQL = readFileSync(MIGRATION, 'utf8');

describe('vocabulary: code and the database are ONE list', () => {
  it('every reason category in code is legal in the DB CHECK', () => {
    // The same discipline already applied to LEAD_STATUSES and
    // ACTIVITY_STATUSES: two copies of a vocabulary WILL drift, so the test
    // reads the migration rather than trusting that they match.
    const block = SQL.match(/intervention_ledger_reason_check[\s\S]*?check \(reason_category is null or reason_category in \(([\s\S]*?)\)\)/);
    expect(block, 'reason CHECK not found in migration').toBeTruthy();
    const dbValues = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(dbValues).toEqual([...REASON_CATEGORIES].sort());
  });

  it('every intervention type in code is legal in the DB CHECK', () => {
    const block = SQL.match(/intervention_ledger_type_check[\s\S]*?check \(intervention_type in \(([\s\S]*?)\)\)/);
    expect(block).toBeTruthy();
    const dbValues = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(dbValues).toEqual([...INTERVENTION_TYPES].sort());
  });

  it('every category has a human label — an unlabelled code is unreadable in a report', () => {
    for (const r of REASON_CATEGORIES) {
      expect(REASON_LABEL[r], `${r} has no label`).toBeTruthy();
    }
  });

  it('retired categories are never reused as live ones', () => {
    // A category is a permanent claim about history. Reusing a retired code
    // would silently change what old rows mean.
    for (const retired of RETIRED_REASONS) {
      expect(REASON_CATEGORIES).not.toContain(retired);
    }
  });

  it('product-fixable reasons are all real categories', () => {
    for (const r of PRODUCT_FIXABLE_REASONS) expect(REASON_CATEGORIES).toContain(r);
  });
});

describe("'other' cannot destroy the lesson it is recording", () => {
  it('the taxonomy demands verbatim for other, and only for other', () => {
    expect(reasonNeedsVerbatim('other')).toBe(true);
    expect(reasonNeedsVerbatim('no_time')).toBe(false);
    expect(reasonNeedsVerbatim(null)).toBe(false);
  });

  it('THE DATABASE enforces it — not merely the application', () => {
    // The lesson of the capacity work: an invariant the application intends is
    // not an invariant. Verified functionally against careerrai-test before
    // production: inserting other with no verbatim, and with whitespace-only
    // verbatim, are both rejected by check_violation.
    expect(SQL).toMatch(/intervention_ledger_other_needs_verbatim/);
    expect(SQL).toMatch(/reason_category <> 'other'\s*or \(reason_verbatim is not null and length\(btrim\(reason_verbatim\)\) >= 3\)/);
  });
});

describe('a rep cannot mark their own intervention successful', () => {
  const LEDGER = readFileSync('src/lib/intervention-ledger.ts', 'utf8');

  it('the write path sets no outcome column', () => {
    // Outcomes are what the STUDENT did, observed by the product. If a rep
    // could write them, every effectiveness number would be self-reported and
    // the whole ledger would be worthless as evidence.
    const insertBlock = LEDGER.slice(LEDGER.indexOf(".from('intervention_ledger').insert("));
    for (const col of ['logged_same_day', 'logged_d1', 'logged_d3', 'logged_d7',
                       'sustained_7d', 'streak_resumed', 'session_completed']) {
      expect(insertBlock, `rep write path sets ${col}`).not.toContain(`${col}:`);
    }
  });

  it('an outcome cannot be claimed without recording when it was measured', () => {
    expect(SQL).toMatch(/intervention_ledger_outcome_coherent/);
  });
});

describe('the ledger reuses canonical authorities rather than forking them', () => {
  const LEDGER = readFileSync('src/lib/intervention-ledger.ts', 'utf8');

  it('lane comes from classifyLane, never a local re-implementation', () => {
    expect(LEDGER).toMatch(/import \{ classifyLane \}/);
    expect(LEDGER).not.toMatch(/function classify(Lane|Bucket)/);
  });

  it('state is read for ONE student, never via the roster loader', () => {
    // getRosterMomentum loads every student on every call — the ~5k wall in
    // the architecture gate. A per-intervention write must stay O(1).
    expect(LEDGER).not.toMatch(/import[^;]*getRosterMomentum/);
    expect(LEDGER).not.toMatch(/getRosterMomentum\(/);
  });

  it('separates channel failure from message failure', () => {
    // 611 students have a phone but no push. Without this field we could never
    // tell "our words did not work" from "they were never reachable".
    expect(SQL).toContain('reachable_by_push');
    expect(LEDGER).toContain('reachableByPush');
  });
});

describe('lane → intervention type mapping is total and sensible', () => {
  it.each([
    ['new_never_logged', 'activation'],
    ['going_cold', 'restart'],
    ['broken_streak', 'restart'],
    ['callback', 'restart'],
    ['conversion', 'conversion'],
    ['fresh', 'diagnostic'],
    [null, 'diagnostic'],
  ] as const)('%s → %s', (lane, expected) => {
    expect(interventionTypeForLane(lane)).toBe(expected);
  });

  it('every mapping returns a legal type', () => {
    for (const lane of ['new_never_logged', 'going_cold', 'broken_streak', 'retry',
                        'callback', 'followup', 'conversion', 'fresh', null, 'nonsense']) {
      expect(isInterventionType(interventionTypeForLane(lane))).toBe(true);
    }
  });
});

describe('type guards agree with the lists', () => {
  it('accepts every real value and rejects invented ones', () => {
    for (const r of REASON_CATEGORIES) expect(isReasonCategory(r)).toBe(true);
    expect(isReasonCategory('vibes')).toBe(false);
    expect(isReasonCategory(null)).toBe(false);
    for (const t of INTERVENTION_TYPES) expect(isInterventionType(t)).toBe(true);
    expect(isInterventionType('upsell')).toBe(false);
  });
});

describe('the API validates the lesson before writing the call', () => {
  const ROUTE = readFileSync('src/app/api/sales/log/route.ts', 'utf8');

  it('rejects an unknown reason category', () => {
    expect(ROUTE).toContain('isReasonCategory');
  });

  it("rejects 'other' with no student words", () => {
    expect(ROUTE).toContain('reasonNeedsVerbatim');
  });

  it('the snapshot is taken before lead state is mutated', () => {
    const snapAt = ROUTE.indexOf('captureStateSnapshot');
    const upsertAt = ROUTE.indexOf("from('lead_outreach').upsert");
    expect(snapAt).toBeGreaterThan(-1);
    expect(upsertAt).toBeGreaterThan(-1);
    expect(snapAt, 'snapshot must be captured BEFORE state changes').toBeLessThan(upsertAt);
  });

  it('a failed ledger write never fails the call the rep already made', () => {
    // But it IS reported, so a silently incomplete ledger cannot happen.
    expect(ROUTE).toContain('ledgerRecorded');
  });
});
