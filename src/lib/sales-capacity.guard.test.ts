import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assignableNow, bindingReason, capacityOf, classifyWorkItem, inWorkingWindow,
  overflowOf, activeUnits, workItemWeight, BINDING_LABEL,
  type RepConfig, type WorkItem,
} from './sales-capacity';
import { RETENTION_LANES } from './call-queue';

// ── Phase 2B-1: capacity is OBSERVATION ONLY ────────────────────────────────
//
// The founder's hard boundary for this phase: no automatic assignment, no
// automatic reassignment, no change to shared-pool claiming. These guards pin
// that boundary in the codebase, not just in a document — a later phase that
// tries to make the capacity layer move a student has to delete a test that
// says why it must not.

const CFG: RepConfig = {
  repId: 'r1', active: true, employmentType: 'full_time',
  workDays: [1, 2, 3, 4, 5, 6], workStartIst: '10:00', workEndIst: '19:00',
  maxCapacityUnits: 50, maxNewPerDay: 15, firstContactSlaMinutes: 120,
  unavailableUntil: null, capacityOverride: null, overrideUntil: null,
};
// Monday 24 Aug 2026, 12:00 IST = 06:30 UTC.
const MON_NOON = Date.UTC(2026, 7, 24, 6, 30);
const MON_2300 = Date.UTC(2026, 7, 24, 17, 30);   // 23:00 IST — outside hours
const SUN_NOON = Date.UTC(2026, 7, 23, 6, 30);    // Sunday — not a work day

function items(n: number): WorkItem[] {
  return Array.from({ length: n }, (_, i) => ({
    studentId: `s${i}`, name: `S${i}`, reason: 'never_contacted' as const, detail: '', lane: null,
  }));
}

describe('the founder’s capacity scenarios', () => {
  const cases: [string, number, number, number][] = [
    // label,            active, expected available, expected overflow
    ['0 of 50', 0, 15, 0],          // daily cap binds first at 15
    ['25 of 50', 25, 15, 0],
    ['48 of 50', 48, 2, 0],
    ['50 of 50', 50, 0, 0],
    ['58 of 50 (overflow)', 58, 0, 8],
  ];
  it.each(cases)('%s', (_label, active, available, overflow) => {
    expect(assignableNow({ capacity: 50, activeNow: active, maxNewPerDay: 15, newToday: 0, inWindow: true })).toBe(available);
    expect(overflowOf(active, 50)).toBe(overflow);
  });

  it('overflow can never turn back into headroom', () => {
    // The floor at 0 is what makes Scenario E safe: 8 units over capacity must
    // read as "no room", never as a negative that later arithmetic revives.
    expect(assignableNow({ capacity: 50, activeNow: 58, maxNewPerDay: 15, newToday: 0, inWindow: true })).toBe(0);
    expect(assignableNow({ capacity: 50, activeNow: 58, maxNewPerDay: 99, newToday: 0, inWindow: true })).toBe(0);
  });

  it('lowering the ceiling 50 → 30 creates overflow and never touches ownership', () => {
    const lowered = { ...CFG, maxCapacityUnits: 30 };
    expect(overflowOf(37, capacityOf(lowered, MON_NOON))).toBe(7);
    expect(bindingReason({ configured: true, cfg: lowered, nowMs: MON_NOON, capacity: 30, activeNow: 37, maxNewPerDay: 15, newToday: 0 })).toBe('OVERFLOW');
    // Ownership is not an input to any function in this module — the capacity
    // layer physically cannot mutate it (see the boundary guard below).
  });

  it('two reps with different ceilings compute independently', () => {
    const ft = assignableNow({ capacity: 50, activeNow: 37, maxNewPerDay: 30, newToday: 0, inWindow: true });
    const pt = assignableNow({ capacity: 20, activeNow: 19, maxNewPerDay: 12, newToday: 0, inWindow: true });
    expect(ft).toBe(13);
    expect(pt).toBe(1);
  });

  it('the daily fuse binds even when active capacity is free', () => {
    expect(assignableNow({ capacity: 50, activeNow: 5, maxNewPerDay: 15, newToday: 15, inWindow: true })).toBe(0);
    expect(bindingReason({ configured: true, cfg: CFG, nowMs: MON_NOON, capacity: 50, activeNow: 5, maxNewPerDay: 15, newToday: 15 })).toBe('DAILY_CAP_BINDING');
  });
});

describe('working hours and availability', () => {
  it('inside the window on a work day', () => {
    expect(inWorkingWindow(CFG, MON_NOON)).toBe(true);
  });
  it('outside hours, and on a non-work day', () => {
    expect(inWorkingWindow(CFG, MON_2300)).toBe(false);
    expect(inWorkingWindow(CFG, SUN_NOON)).toBe(false);
    expect(assignableNow({ capacity: 50, activeNow: 0, maxNewPerDay: 15, newToday: 0, inWindow: false })).toBe(0);
  });
  it('leave beats working hours', () => {
    const onLeave = { ...CFG, unavailableUntil: new Date(MON_NOON + 86_400_000).toISOString() };
    expect(inWorkingWindow(onLeave, MON_NOON)).toBe(false);
    expect(bindingReason({ configured: true, cfg: onLeave, nowMs: MON_NOON, capacity: 50, activeNow: 0, maxNewPerDay: 15, newToday: 0 })).toBe('UNAVAILABLE');
  });
  it('an expired override is ignored rather than becoming permanent', () => {
    const expired = { ...CFG, capacityOverride: 80, overrideUntil: new Date(MON_NOON - 1000).toISOString() };
    expect(capacityOf(expired, MON_NOON)).toBe(50);
    const live = { ...CFG, capacityOverride: 80, overrideUntil: new Date(MON_NOON + 1000).toISOString() };
    expect(capacityOf(live, MON_NOON)).toBe(80);
  });
});

describe('a missing configuration is never a zero', () => {
  it('NOT_CONFIGURED is its own reason', () => {
    expect(bindingReason({ configured: false, cfg: null, nowMs: MON_NOON, capacity: 0, activeNow: 0, maxNewPerDay: 0, newToday: 0 })).toBe('NOT_CONFIGURED');
  });
  it('an inactive rep reads as switched off, not as full', () => {
    expect(bindingReason({ configured: true, cfg: { ...CFG, active: false }, nowMs: MON_NOON, capacity: 50, activeNow: 0, maxNewPerDay: 15, newToday: 0 })).toBe('INACTIVE');
  });
});

describe('OWNED ≠ ACTIVE ≠ DORMANT ≠ CLOSED', () => {
  const base = { studentId: 's', name: 'S', nextActionAt: null, hasOverdueFollowup: false, retentionLane: null, laneDetail: null, nowMs: MON_NOON };

  it('never contacted is active work', () => {
    expect(classifyWorkItem({ ...base, status: 'not_contacted' })?.reason).toBe('never_contacted');
    expect(classifyWorkItem({ ...base, status: null })?.reason).toBe('never_contacted');
  });
  it('a due callback is active; a future one is not', () => {
    expect(classifyWorkItem({ ...base, status: 'follow_up', nextActionAt: new Date(MON_NOON - 60_000).toISOString() })?.reason).toBe('action_due');
    expect(classifyWorkItem({ ...base, status: 'follow_up', nextActionAt: new Date(MON_NOON + 3600_000).toISOString() })).toBeNull();
  });
  it('an overdue promise is active work', () => {
    expect(classifyWorkItem({ ...base, status: 'interested', hasOverdueFollowup: true })?.reason).toBe('followup_overdue');
  });
  it('a retention lane makes a healthy-looking lead active again', () => {
    expect(classifyWorkItem({ ...base, status: 'interested', retentionLane: 'going_cold', laneDetail: '5 of 7 → 0 of 3' })?.reason).toBe('retention_lane');
  });

  it('DORMANT: owned, contacted, nothing due — consumes NOTHING', () => {
    // The whole reason this model exists: a rep who retains a student well
    // must not be penalised by holding the relationship.
    expect(classifyWorkItem({ ...base, status: 'interested' })).toBeNull();
  });

  it('CLOSED never counts, whatever else is true of it', () => {
    for (const status of ['converted', 'not_interested', 'dnd']) {
      expect(classifyWorkItem({ ...base, status, nextActionAt: new Date(MON_NOON - 1).toISOString(), hasOverdueFollowup: true, retentionLane: 'going_cold' })).toBeNull();
    }
  });

  it('the CONVERSION lane is excluded — a cumulative flag must not eat a slot forever', () => {
    // buddy_cta_clicks never resets, so counting the conversion lane as active
    // work would consume one unit permanently for any student who ever tapped
    // the buddy option — the same failure the working-set model exists to
    // prevent. Retention lanes are transient; they clear when the student logs.
    expect(classifyWorkItem({ ...base, status: 'interested', retentionLane: 'conversion' })).toBeNull();
    expect(RETENTION_LANES.has('conversion' as never)).toBe(false);
    for (const lane of ['going_cold', 'broken_streak', 'new_never_logged'] as const) {
      expect(RETENTION_LANES.has(lane)).toBe(true);
    }
  });
});

describe('weighted capacity is future-ready, not built', () => {
  it('every item weighs exactly 1 today', () => {
    expect(workItemWeight(items(1)[0])).toBe(1);
    expect(activeUnits(items(7))).toBe(7);
  });
});

// ── The boundary that defines this phase ────────────────────────────────────
describe('Phase 2B-1 is observation only — nothing here can move a student', () => {
  const CAP = readFileSync('src/lib/sales-capacity.ts', 'utf8');
  const PAGE = readFileSync('src/app/admin/sales/capacity/page.tsx', 'utf8');
  const ROUTE = readFileSync('src/app/api/admin/rep-config/route.ts', 'utf8');

  it('the capacity module never writes ownership or any lead state', () => {
    // Pin the CALL, never the vocabulary. A guard that banned the string
    // "claim_lead" failed on this module's own comment explaining why it does
    // not claim anything — the third time in this workstream that a guard
    // pinned a word instead of a behaviour. Documentation must be free to name
    // what the code deliberately avoids.
    expect(CAP).not.toMatch(/owner_id\s*:/);                              // no assignment write
    expect(CAP).not.toMatch(/\.update\(|\.upsert\(|\.insert\(|\.delete\(/); // no mutation
    expect(CAP).not.toMatch(/\.rpc\(/);                                   // no procedure call
  });

  it('the capacity page renders only — it has no write path', () => {
    expect(PAGE).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
  });

  it('the only write this phase adds is rep configuration, and it is audited', () => {
    expect(ROUTE).toContain("from('sales_rep_config')");
    expect(ROUTE).toContain('auditSales');
    expect(ROUTE).toContain("principal.role !== 'admin'");
    // It must not be able to touch a lead at all. Pin the QUERY, not the
    // word: the file's own comment explains why it never reads lead_outreach,
    // and a guard that bans the word would fail on its own documentation.
    expect(ROUTE).not.toMatch(/from\(['"]lead_outreach['"]\)/);
    expect(ROUTE).not.toMatch(/owner_id\s*[:=]/);
  });

  it('no assignment engine exists yet', () => {
    // 2B-3 introduces assign_lead(); until the founder approves it, its
    // absence is the guarantee.
    const files = ['src/lib/sales-capacity.ts', 'src/app/admin/sales/capacity/page.tsx'];
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toContain('assign_lead');
  });

  it('the owned-lead read is CHECKED — a failed read is never a confident zero', () => {
    // Boundary 2. This read decides every capacity number the founder sees.
    // An earlier version selected a column that does not exist yet
    // (assigned_at, which arrives in 2B-2) and discarded the error, so the
    // read would have failed and every rep would have rendered "0 active
    // work" as fact — invisible today only because no lead exists yet.
    expect(CAP).toMatch(/const \{ data, error \}/);
    expect(CAP).toContain('readFailed = true');
    expect(CAP).toContain("'READ_FAILED'");
  });

  it('"could not read" and "on leave" are different labels', () => {
    // They were briefly the same enum value. A founder must never read a
    // database failure as "Priya is away today".
    expect(BINDING_LABEL.READ_FAILED).not.toBe(BINDING_LABEL.UNAVAILABLE);
  });

  it('only columns that exist are selected from lead_outreach', () => {
    // The columns lead_outreach actually has in this phase. assigned_at and
    // first_contact_sla_due arrive in 2B-2 and must not be referenced before.
    const select = CAP.match(/\.select\('([^']*)'\)\s*\n?\s*\.in\('owner_id'/)?.[1] ?? '';
    expect(select.length).toBeGreaterThan(0);
    for (const col of select.split(',').map((s) => s.trim())) {
      expect(['student_id', 'owner_id', 'status', 'next_action_at'], `unknown column ${col}`).toContain(col);
    }
  });

  it('an unmeasurable number renders as not-instrumented, never as 0', () => {
    // Nothing records when a lead was claimed in this phase, so "new leads
    // today" is unknowable. A 0 there would tell the founder a rep took no
    // leads when the truth is that nothing counts them.
    expect(CAP).toMatch(/newToday: null/);
  });

  it('capacity is read from the owned book, never from the whole roster', () => {
    // getRosterMomentum loads every student on every call (the ~5k wall in the
    // architecture gate). Capacity must stay O(book), not O(students).
    // Pin the IMPORT and the CALL — not the word, which appears in the
    // module's own comment saying why it is deliberately not used.
    expect(CAP).not.toMatch(/import[^;]*getRosterMomentum/);
    expect(CAP).not.toMatch(/getRosterMomentum\(/);
    expect(CAP).toContain('chunkIds');
  });
});
