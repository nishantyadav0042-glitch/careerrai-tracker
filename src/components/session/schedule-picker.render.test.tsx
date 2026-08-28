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

  it('a legacy pasted room WITHOUT Google is not ready', () => {
    // Two branches disagreed about this one line and the merge had to settle
    // it. The older rule was `hasRoom || googleConnected`, and a version of
    // this test asserted a pasted room alone was READY.
    //
    // It cannot be, once the manual-room UI is gone. Both branches deleted the
    // paste-your-own-Meet form on 27 Aug, so nothing in the product can set
    // buddy_meet_url any more — the rule was honouring a field only history
    // can write. Worse, a mentor called bookable on a legacy room has no
    // Google connection, so holdSessionOnCalendar returns not_connected: the
    // booking gets no hold, no invite and no google_event_id, leaving cancel
    // and reschedule nothing to act on and the mentor's hour still free for
    // them to give away. That is the exact defect lib/session-calendar was
    // written to close, reached through the back door of the readiness rule.
    //
    // Checked against production before choosing, because a stricter rule can
    // take live mentors offline: there are 0 Google connections and the 2
    // mentors with active availability have no room either, so they are
    // already unbookable under BOTH rules. The tightening costs no one a
    // booking today, and Google is the only setup path a mentor is now shown.
    const canBook = verdict({ availability: { active: true }, hasRoom: true, googleConnected: false });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} availability={HOURS_SET} />);
    expect(html).toMatch(/students cannot book you yet/i);
  });

  it('no room AND no Google is genuinely not ready', () => {
    const canBook = verdict({ availability: { active: true }, hasRoom: false, googleConnected: false });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} availability={HOURS_SET} />);
    expect(html).toMatch(/students cannot book you yet/i);
    // This card used to carry a "Google Calendar not connected" row whose own
    // copy said "Connect it below" — with no connect link anywhere in it. From
    // 27 Aug Google is the GoogleConnect card's single job, so this one must
    // say NOTHING about Google: two setup prompts for one step is exactly the
    // confusion that removal was for. Asserting the absence is what stops the
    // row being reinstated here later "for completeness".
    expect(html).not.toMatch(/Google/i);
  });

  it('says NOT ready when hours are missing, even with Google connected', () => {
    const canBook = verdict({ availability: null, hasRoom: false, googleConnected: true });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook} availability={{ configured: false }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Working hours not set/);
  });

  it('says READY when hours are set and Google can mint a room', () => {
    const canBook = verdict({ availability: { active: true }, hasRoom: false, googleConnected: true });
    expect(canBook).toBe(true);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook}
        availability={{ configured: true, work_days: [1, 2, 3, 4, 5], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/Ready — students can book you/);
  });

  it('a configured mentor sees a change button, not a form they must dismiss', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness canBook
        availability={{ configured: true, work_days: [1, 2], start_minute: 600, end_minute: 1140, active: true }} />);
    expect(html).toMatch(/Change my hours/);
    expect(html).not.toMatch(/Save my hours/);
  });

  it('a switched-off calendar is not ready', () => {
    const canBook = verdict({ availability: { active: false }, hasRoom: true, googleConnected: true });
    expect(canBook).toBe(false);
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={canBook}
        availability={{ configured: true, work_days: [1], start_minute: 600, end_minute: 1140, active: false }} />);
    expect(html).toMatch(/students cannot book you yet/i);
    expect(html).toMatch(/Calendar switched off/);
  });

  it('opens the editor by default when nothing is configured', () => {
    // A mentor who has never set hours should not have to find a button.
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={false} availability={{ configured: false }} />);
    expect(html).toMatch(/Save my hours/);
  });

  it('explains the buffer in the mentor’s own terms — inside the editor', () => {
    const html = renderToStaticMarkup(
      <SessionReadiness canBook={false}
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
      const html = renderToStaticMarkup(<SessionReadiness canBook={false} availability={a} />);
      expect(html).not.toContain('[object Object]');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
    }
  });
});
