import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchedulePicker } from './schedule-picker';
import { SessionReadiness } from '@/components/buddy/session-readiness';
import { decideBookability } from '@/lib/session-assignment';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The product must never show a step it cannot fulfil. Most of this surface's
// states exist to say honestly WHY there is no picker — and today, with zero
// Google connections in production, every student lands on one of them.

beforeEach(() => { vi.restoreAllMocks(); });

describe('the picker never renders a step that cannot be fulfilled', () => {
  it('renders a loading state before it knows anything — never an empty calendar', () => {
    // SSR runs before the fetch resolves. If this rendered a picker with zero
    // slots, a student would see an empty calendar and conclude we are broken.
    const html = renderToStaticMarkup(<SchedulePicker />);
    expect(html).toMatch(/Loading your session/);
    expect(html).not.toMatch(/Choose your time/);
  });

  it('renders cleanly with no data', () => {
    const html = renderToStaticMarkup(<SchedulePicker />);
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});

describe('mentor readiness never claims what it cannot back', () => {
  // The component NO LONGER decides. It renders decideBookability()'s verdict,
  // so these tests compute canBook from the canonical rule rather than
  // hardcoding a boolean — a hardcoded verdict here would let the component
  // and the rule drift apart again, which is the whole defect being closed.
  const verdict = (f: {
    availability: { active: boolean | null } | null; hasRoom: boolean; googleConnected: boolean;
  }) => decideBookability({ ...f }).bookable;

  const HOURS_SET = { configured: true, work_days: [1, 2, 3], start_minute: 600, end_minute: 1140, active: true };

  it('RULE CHANGE: hours + a pasted room and NO Google is READY', () => {
    // This test previously asserted the opposite — "NOT ready when Google is
    // missing, even with hours set" — encoding a Google requirement that this
    // codebase had already removed elsewhere as a design mistake. Shreya has a
    // room and no Google; the booking API would accept her.
    const canBook = verdict({ availability: { active: true }, hasRoom: true, googleConnected: false });
    expect(canBook).toBe(true);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} googleConnected={false} availability={HOURS_SET} />);
    expect(html).toMatch(/Ready — students can book you/);
  });

  it('no room AND no Google is genuinely not ready', () => {
    const canBook = verdict({ availability: { active: true }, hasRoom: false, googleConnected: false });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} googleConnected={false} availability={HOURS_SET} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Google Calendar not connected/);
  });

  it('says NOT ready when hours are missing, even with Google connected', () => {
    const canBook = verdict({ availability: null, hasRoom: false, googleConnected: true });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} googleConnected availability={{ configured: false }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Working hours not set/);
  });

  it('says READY when hours are set and Google can mint a room', () => {
    const canBook = verdict({ availability: { active: true }, hasRoom: false, googleConnected: true });
    expect(canBook).toBe(true);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} googleConnected
        availability={{ configured: true, work_days: [1, 2, 3, 4, 5], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/Ready — students can book you/);
  });

  it('a configured mentor sees a change button, not a form they must dismiss', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness canBook googleConnected
        availability={{ configured: true, work_days: [1, 2], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/Change my hours/);
    expect(html).not.toMatch(/Save my hours/);
  });

  it('a switched-off calendar is not ready', () => {
    const canBook = verdict({ availability: { active: false }, hasRoom: true, googleConnected: true });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} googleConnected
        availability={{ configured: true, work_days: [1], start_minute: 600, end_minute: 1140, active: false }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Calendar switched off/);
  });

  it('opens the editor by default when nothing is configured', () => {
    // A mentor who has never set hours should not have to find a button.
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={false} googleConnected availability={{ configured: false }} />);
    expect(html).toMatch(/Save my hours/);
  });

  it('explains the buffer in the mentor’s own terms — inside the editor', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={false} googleConnected
        availability={{ configured: false, slot_minutes: 45, buffer_minutes: 15 }} />);
    expect(html).toMatch(/45 minutes/);
    expect(html).toMatch(/15-minute gap/);
    expect(html).toMatch(/Nobody can\s+book inside that gap/);
  });

  it('never leaks a broken value', () => {
    for (const a of [
      { configured: false },
      { configured: true, work_days: [], start_minute: 0, end_minute: 0, active: true },
    ]) {
      const html = renderToStaticMarkup(<SessionReadiness canBook={false} googleConnected={false} availability={a} />);
      expect(html).not.toContain('[object Object]');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
    }
  });
});
