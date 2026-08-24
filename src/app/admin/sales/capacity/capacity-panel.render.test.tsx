import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CapacityPanel } from './capacity-panel';
import type { RepCapacity, WorkItem } from '@/lib/sales-capacity';

// ── The test class whose absence let C0 ship ────────────────────────────────
//
// Phase 1 shipped a page that crashed for any student with a mock debrief,
// and 3,124 tests passed, because nothing ever RENDERED the page. "Tests pass"
// is evidence about logic, not about screens.
//
// React refuses to render an object as a child and throws during render, so
// simply rendering this component against representative data is what catches
// a JSONB column (or any object) leaking into the UI. Every assertion below
// is secondary to the fact that the render itself must not throw.

function item(i: number, reason: WorkItem['reason']): WorkItem {
  return { studentId: `s${i}`, name: `Student ${i}`, reason, detail: 'evidence line', lane: null };
}

const CONFIGURED: RepCapacity = {
  repId: 'r1', name: 'Priya', configured: true,
  config: {
    repId: 'r1', active: true, employmentType: 'full_time',
    workDays: [1, 2, 3, 4, 5, 6], workStartIst: '10:00', workEndIst: '19:00',
    maxCapacityUnits: 50, maxNewPerDay: 15, firstContactSlaMinutes: 120,
    unavailableUntil: null, capacityOverride: null, overrideUntil: null,
  },
  capacity: 50, activeNow: 3, available: 12, newToday: null, overflow: 0,
  inWindow: true, binding: 'ASSIGNABLE', readFailed: false,
  workItems: [item(1, 'never_contacted'), item(2, 'action_due'), item(3, 'retention_lane')],
  dormantCount: 200,
};

const OVERFLOWING: RepCapacity = {
  ...CONFIGURED, repId: 'r2', name: 'Part-timer',
  capacity: 20, activeNow: 28, available: 0, newToday: null, overflow: 8,
  binding: 'OVERFLOW', readFailed: false,
  workItems: Array.from({ length: 28 }, (_, i) => item(i, 'retention_lane')),
  dormantCount: 40,
};

const UNCONFIGURED: RepCapacity = {
  repId: 'r3', name: 'New hire', configured: false, config: null,
  capacity: null, activeNow: 0, available: 0, newToday: null, overflow: 0,
  inWindow: false, binding: 'NOT_CONFIGURED', workItems: [], dormantCount: 0, readFailed: false,
};

describe('the capacity panel renders real shapes without throwing', () => {
  it('renders a configured, an overflowing and an unconfigured rep together', () => {
    const html = renderToStaticMarkup(<CapacityPanel reps={[CONFIGURED, OVERFLOWING, UNCONFIGURED]} />);
    expect(html).toContain('Priya');
    expect(html).toContain('Part-timer');
    expect(html).toContain('New hire');
    // The C0 class: an object that reached the DOM would have thrown above,
    // and a sloppy string coercion would show up here.
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('an unconfigured rep says so — it never renders as zero capacity', () => {
    const html = renderToStaticMarkup(<CapacityPanel reps={[UNCONFIGURED]} />);
    expect(html).toContain('NOT CONFIGURED');
    expect(html).toMatch(/missing setup, not zero capacity/i);
  });

  it('overflow states what happened to the relationships, not just a number', () => {
    const html = renderToStaticMarkup(<CapacityPanel reps={[OVERFLOWING]} />);
    expect(html).toContain('8');
    expect(html).toMatch(/over capacity/i);
    // The founder must be able to read that nothing was taken away.
    expect(html).toMatch(/nothing was transferred/i);
  });

  it('the drill-down count equals the list it opens', () => {
    // count == list (SCALE-CONTRACT §4). The button offers exactly as many
    // students as the array holds, because it is rendered from `.length`.
    const html = renderToStaticMarkup(<CapacityPanel reps={[CONFIGURED]} />);
    expect(html).toContain(`Show the ${CONFIGURED.workItems.length} students behind this`);
  });

  it('renders an empty team without crashing', () => {
    const html = renderToStaticMarkup(<CapacityPanel reps={[]} />);
    expect(html).toMatch(/No sales or admin accounts/i);
  });
});
