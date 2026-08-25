import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MyOutcomes } from './my-outcomes';
import { interventionPicture, type LedgerRow } from '@/lib/student-success-mis';

// The founder's standing rule: activity must never become the primary success
// metric. This strip is the rep's daily mirror — what it puts first IS the
// incentive, so these tests are about ORDER and EMPHASIS, not just correctness.

const led = (n: number, o: Partial<LedgerRow> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    studentId: `s${i}`, lane: 'going_cold', reasonCategory: null,
    loggedD3: true, loggedD7: true, repId: 'r1', ...o,
  } as LedgerRow));

const render = (rows: LedgerRow[], sessions: number | null = null) =>
  renderToStaticMarkup(
    <MyOutcomes picture={interventionPicture(rows, [])} sessionsCompleted={sessions} />,
  );

describe('outcomes come first, activity comes last', () => {
  const html = render(led(30), 2);

  it('renders student outcomes, not a call count, as the headline', () => {
    expect(html).toMatch(/What happened after your calls/);
    expect(html).toMatch(/Logged within 3 days of contact/);
  });

  it('puts student logging BEFORE the call count in the document', () => {
    // Order on the page is the policy. If volume came first, this strip would
    // be a dialler's scoreboard.
    const logged = html.indexOf('Logged within 3 days');
    const volume = html.indexOf('For your planning only');
    expect(logged).toBeGreaterThan(-1);
    expect(volume).toBeGreaterThan(logged);
  });

  it('frames the call count as planning info, not as a score', () => {
    expect(html).toMatch(/For your planning only/);
  });

  it('counts COMPLETED sessions, and says a booking is not one', () => {
    expect(html).toMatch(/Sessions actually completed/);
    expect(html).toMatch(/A booking is a promise; this is the promise kept/);
  });
});

describe('this strip is not a leaderboard', () => {
  const html = render(led(30), 2);

  it('shows no rank, target, quota or comparison to other reps', () => {
    for (const banned of [/leaderboard/i, /\brank\b/i, /\btarget\b/i, /\bquota\b/i,
                          /vs\.? other/i, /team average/i, /hours online/i,
                          /calls per day/i, /calls\/day/i]) {
      expect(html, `rep strip shows a competitive/activity metric: ${banned}`).not.toMatch(banned);
    }
  });
});

describe('the strip is honest when it cannot say anything', () => {
  it('an unmeasured window is reported as pending, never as failure', () => {
    const html = render(led(10, { loggedD3: null, loggedD7: null }));
    expect(html).toMatch(/still\s+inside their 7-day window/);
    expect(html).toMatch(/not failures/);
  });

  it('a thin sample shows counts and refuses a rate', () => {
    const html = render(led(3));
    expect(html).toMatch(/too few to state a rate/i);
  });

  it('a rep with no calls yet is told what this will show, not shown zeros', () => {
    const html = render([]);
    expect(html).toMatch(/No calls logged yet/);
    expect(html).toMatch(/not how many calls you made/);
    expect(html).not.toMatch(/>0</);
  });

  it('an unknown session count renders a dash, not zero', () => {
    // null means "not wired yet". Rendering 0 would tell a rep they delivered
    // nothing when the truth is that nobody measured.
    const html = render(led(30), null);
    expect(html).toMatch(/—/);
  });

  it('never leaks a broken value', () => {
    for (const rows of [led(0), led(1), led(30)]) {
      const html = render(rows, 1);
      expect(html).not.toContain('[object Object]');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
    }
  });
});
