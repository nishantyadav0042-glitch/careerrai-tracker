import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchedulePicker } from './schedule-picker';
import { SessionReadiness } from '@/components/buddy/session-readiness';

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
  it('says NOT ready when Google is missing, even with hours set', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected={false}
        availability={{ configured: true, work_days: [1, 2, 3], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Google Calendar not connected/);
    // And says exactly what to do about it.
    expect(html).toMatch(/no room to put a student in/i);
  });

  it('says NOT ready when hours are missing, even with Google connected', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected availability={{ configured: false }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Working hours not set/);
  });

  it('says READY only when BOTH are true', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected
        availability={{ configured: true, work_days: [1, 2, 3, 4, 5], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/Ready — students can book you/);
  });

  it('a configured mentor sees a change button, not a form they must dismiss', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected
        availability={{ configured: true, work_days: [1, 2], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/Change my hours/);
    expect(html).not.toMatch(/Save my hours/);
  });

  it('a switched-off calendar is not ready', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected
        availability={{ configured: true, work_days: [1], start_minute: 600, end_minute: 1140, active: false }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Calendar switched off/);
  });

  it('opens the editor by default when nothing is configured', () => {
    // A mentor who has never set hours should not have to find a button.
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected availability={{ configured: false }} />);
    expect(html).toMatch(/Save my hours/);
  });

  it('explains the buffer in the mentor’s own terms — inside the editor', () => {
    // The explanation lives in the editor, which opens automatically for a
    // mentor who has never set hours.
    const html = renderToStaticMarkup(
      <SessionReadiness googleConnected
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
      const html = renderToStaticMarkup(<SessionReadiness googleConnected={false} availability={a} />);
      expect(html).not.toContain('[object Object]');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
    }
  });
});
