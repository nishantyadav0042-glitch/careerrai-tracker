import { describe, it, expect, vi } from 'vitest';

// The Start control is a client component: it refreshes the page after the
// server confirms the write. In a static render there is no router, so this
// stands in for one — the refresh itself is not what these tests are about.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionStart } from './session-start';

// The C0 lesson: a control that is never rendered is never verified. This one
// is the ONLY thing in the product that can write session_status='active', so
// if it fails to render the ₹299 session is undeliverable — exactly the state
// the last 16 sessions were in.

const ID = '11111111-2222-3333-4444-555555555555';
const render = (status: string, startedAt: string | null = null) =>
  renderToStaticMarkup(<SessionStart sessionId={ID} status={status} startedAt={startedAt} />);

describe('the Start button appears exactly when it should', () => {
  it('renders Start for a scheduled session', () => {
    const html = render('scheduled');
    expect(html).toMatch(/Start/);
    expect(html).toContain('<button');
  });

  it('shows LIVE for a session already started, and no second Start', () => {
    const html = render('active', '2026-08-24T09:30:00Z');
    expect(html).toMatch(/Live/);
    expect(html).not.toContain('<button');
  });

  it('names the time the call actually began, in IST', () => {
    // 09:30 UTC = 15:00 IST. A mentor reading a UTC time would think the call
    // started five and a half hours ago.
    expect(render('active', '2026-08-24T09:30:00Z')).toMatch(/Live since 3:00 pm/i);
  });

  it('an active session with no recorded start says Live without inventing a time', () => {
    const html = render('active', null);
    expect(html).toMatch(/Live/);
    expect(html).not.toMatch(/since/i);
    expect(html).not.toContain('Invalid Date');
  });

  it.each(['completed', 'cancelled', 'expired'])('renders NOTHING for a %s session', (status) => {
    // A completed session cannot restart: the DB refuses it, and the UI must
    // not offer an action that can only fail.
    expect(render(status)).toBe('');
  });
});

describe('the control never leaks a broken value', () => {
  it.each(['scheduled', 'active', 'completed'])('%s renders cleanly', (status) => {
    const html = render(status, '2026-08-24T09:30:00Z');
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Invalid Date');
  });

  it('survives an unparseable timestamp without rendering Invalid Date', () => {
    const html = render('active', 'not-a-date');
    expect(html).not.toContain('Invalid Date');
  });
});
