import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MisView } from './mis-view';
import {
  returnPicture, interventionPicture, conversionPicture, learningPicture, reachPicture,
  type LedgerRow, type ReturnRow,
} from '@/lib/student-success-mis';
import { tailPicture } from '@/lib/notification-tail';
import { repOutcomes } from '@/lib/student-success-mis';

// ── The C0 lesson, applied ──────────────────────────────────────────────────
//
// 3,124 tests passed while /student/[id] threw for any student with a mock
// debrief, because a JSONB column reached JSX and nothing ever rendered it.
// This is the founder's own screen: if it throws, or prints [object Object],
// or turns a null rate into "0%", the funding conversation is argued from a
// broken page.

const ret = (n: number, opts: Partial<ReturnRow> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    studentId: `s${i}`, tenureDays: 30, logDays: 1, d1: true, d3: true, d7: true, ...opts,
  }));

const led = (n: number, o: Partial<LedgerRow> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    studentId: `s${i}`, lane: 'going_cold', reasonCategory: null,
    loggedD3: true, loggedD7: true, repId: 'r1', ...o,
  } as LedgerRow));

const sess = (status: string, started = false, ended = false) => ({
  session_status: status,
  started_at: started ? '2026-08-20T10:00:00Z' : null,
  ended_at: ended ? '2026-08-20T11:00:00Z' : null,
});

function render(over: Partial<Parameters<typeof MisView>[0]> = {}) {
  return renderToStaticMarkup(
    <MisView
      ret={returnPicture(ret(50))}
      intervention={interventionPicture(led(30), [])}
      conversion={conversionPicture([...Array(9).fill(sess('expired')), ...Array(7).fill(sess('cancelled'))])}
      learning={learningPicture(led(25, { reasonCategory: 'coaching_timetable_conflict' }))}
      reach={reachPicture([
        ...Array.from({ length: 152 }, () => ({ hasPush: true, hasPhone: true })),
        ...Array.from({ length: 611 }, () => ({ hasPush: false, hasPhone: true })),
      ])}
      pushesPerReachedStudentPerDay={5.2}
      reps={[]}
      tail={tailPicture(
        Array.from({ length: 40 }, (_, i) => ({ userId: `s${i}`, day: '2026-08-20', clicked: i < 2 })),
        new Map([['s0', new Set(['2026-08-20'])]]),
      )}
      {...over}
    />,
  );
}

describe('the founder screen renders, and renders cleanly', () => {
  const html = render();

  it('renders all four questions', () => {
    expect(html).toMatch(/Are students coming back\?/);
    expect(html).toMatch(/Are human interventions helping\?/);
    expect(html).toMatch(/Are students converting into COMPLETED sessions\?/);
    expect(html).toMatch(/What are we learning/);
  });

  it('leaks no object, undefined or NaN into the markup', () => {
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});

describe('the screen cannot show a number the sample did not earn', () => {
  it('an UNAVAILABLE rate renders as a dash, NEVER as 0%', () => {
    // The specific lie this prevents: 2 settled sessions rendering "0%
    // completion", which reads as a damning product fact rather than as
    // "there is no sample".
    const html = render({ conversion: conversionPicture([sess('expired'), sess('cancelled')]) });
    expect(html).toContain('UNAVAILABLE');
    expect(html).toMatch(/too few to state a completion rate/i);
    // Scoped to the completion card. A genuine 0% elsewhere (say, 0 of 40
    // pushes followed by a next-day log) is a FACT and must still render — the
    // rule is that a NULL rate becomes a dash, not that zero is unprintable.
    const card = html.slice(html.indexOf('Sessions completed'));
    const upToNextCard = card.slice(0, card.indexOf('Completed with an observed start'));
    expect(upToNextCard).not.toMatch(/>0%</);
    expect(upToNextCard).toMatch(/—/);
  });

  it('a thin lane comparison shows counts and refuses a percentage', () => {
    const html = render({
      intervention: interventionPicture(led(2), [
        { studentId: 'u1', lane: 'going_cold', loggedD3: false },
      ]),
    });
    expect(html).toMatch(/2 contacted vs 1 not/);
    expect(html).not.toMatch(/pts/);   // no difference claim
  });

  it('a populated comparison is labelled ASSOCIATED, never as a cause', () => {
    const html = render({
      intervention: interventionPicture(
        led(20, { loggedD3: true }),
        Array.from({ length: 20 }, (_, i) => ({ studentId: `u${i}`, lane: 'going_cold', loggedD3: i < 4 })),
      ),
    });
    expect(html).toContain('ASSOCIATED');
    expect(html).toMatch(/not evidence that the call caused/i);
  });

  it('a student too new for a window is not rendered as a failure', () => {
    const html = render({ ret: returnPicture(ret(30, { d7: null })) });
    expect(html).toContain('UNKNOWN');
    expect(html).toMatch(/No student is old enough/i);
  });
});

describe('the notification tail is shown without becoming a causal claim', () => {
  it('renders the tail and labels it ASSOCIATED', () => {
    const html = render();
    expect(html).toMatch(/After a push, last 7 days/);
    expect(html).toContain('ASSOCIATED');
    expect(html).toMatch(/not what the push caused/i);
  });

  it('names the pushes that produced nothing observable', () => {
    // NOTIFICATION-OS #22: a tap that changes no behaviour is a vanity win.
    expect(render()).toMatch(/pushes with no log either day/);
  });

  it('an empty push window renders UNKNOWN rather than 0%', () => {
    const html = render({ tail: tailPicture([], new Map()) });
    expect(html).toMatch(/No pushes were delivered/i);
  });
});

describe('the screen tells the truth about delivery', () => {
  it("today's production shape says plainly that nothing was ever delivered", () => {
    const html = render();
    expect(html).toMatch(/16 paid sessions created\. None has ever been completed\./);
    expect(html).toMatch(/a booking is\s+not a delivery/i);
  });

  it('a delivered session removes the warning', () => {
    const html = render({
      conversion: conversionPicture([...Array(9).fill(sess('expired')), sess('completed', true, true)]),
    });
    expect(html).not.toMatch(/None has ever been completed/);
  });

  it('names the students for whom a human is the only channel', () => {
    const html = render();
    expect(html).toMatch(/Students a human is the ONLY way to reach/);
    expect(html).toMatch(/>611</);
  });
});

describe('the per-rep block appears and stays honest', () => {
  // Two reps with deliberately different sample sizes: one above the floor,
  // one far below it.
  const twoReps = repOutcomes([
    ...Array.from({ length: 25 }, (_, i) => ({
      studentId: `a${i}`, repId: 'a', lane: 'going_cold', reasonCategory: 'no_time',
      loggedD3: i < 10, loggedD7: i < 12,
    } as LedgerRow)),
    ...Array.from({ length: 3 }, (_, i) => ({
      studentId: `b${i}`, repId: 'b', lane: 'going_cold', reasonCategory: null,
      loggedD3: true, loggedD7: true,
    } as LedgerRow)),
  ], {
    names: new Map([['a', 'Asha'], ['b', 'Bhavna']]),
    sessionsByRep: new Map([['a', 2]]),
  });

  const html = render({ reps: twoReps });

  it('renders BOTH reps by name', () => {
    expect(html).toMatch(/Asha/);
    expect(html).toMatch(/Bhavna/);
  });

  it('shows a rate for the rep above the floor', () => {
    expect(html).toMatch(/40%/); // 10 of 25 logged within 3 days
  });

  /** Bhavna's card ONLY — bounded at the caveat that closes the block, so an
   *  unrelated percentage elsewhere on the page cannot fail (or pass) this. */
  const bhavnaCard = () => {
    const start = html.indexOf('Bhavna');
    return html.slice(start, html.indexOf('ASSOCIATED, not caused', start));
  };

  it('shows UNAVAILABLE for the thin rep, never a flattering 100%', () => {
    // Bhavna is 3 of 3 — the most misleading number available.
    const card = bhavnaCard();
    expect(card).toContain('UNAVAILABLE');
    expect(card).not.toMatch(/100%/);
    expect(card).toMatch(/3<span[^>]*>\/3</); // the counts still show
  });

  it('an unmeasured session count renders as a dash, not zero', () => {
    const card = bhavnaCard();
    expect(card).toMatch(/—/);
    expect(card).not.toMatch(/>0<\/p><p[^>]*>sessions completed/);
  });

  it('puts outcomes BEFORE call volume for every rep', () => {
    const logged = html.indexOf('students contacted');
    const calls = html.indexOf('For planning only');
    expect(logged).toBeGreaterThan(-1);
    expect(calls).toBeGreaterThan(logged);
  });

  it('carries the caveat and the ordering statement', () => {
    expect(html).toMatch(/ordered by name, never by outcome/i);
    expect(html).toMatch(/ASSOCIATED, not caused/);
  });

  it('renders nothing at all when no rep has logged anything', () => {
    const empty = render({ reps: [] });
    expect(empty).not.toMatch(/ordered by name/i);
  });

  it('leaks no broken value', () => {
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});

describe('this is NOT a sales dashboard', () => {
  const html = render();

  it('shows no activity metric as a headline', () => {
    // Standing constraint: calls/day, messages/day, hours online, leads
    // touched and HOT/WARM/COLD counts must never be the target.
    for (const banned of [/calls per day/i, /hours online/i, /leads touched/i,
                          /\bHOT\b/, /\bWARM\b/, /\bCOLD\b/, /leaderboard/i]) {
      expect(html, `sales activity metric on the founder screen: ${banned}`).not.toMatch(banned);
    }
  });

  it('the human layer appears only through what happened to students', () => {
    expect(html).toMatch(/Logged within 3 days of contact/);
    expect(html).toMatch(/Awaiting outcome/);
  });
});

describe('empty state', () => {
  it('renders with no data at all rather than throwing', () => {
    const html = renderToStaticMarkup(
      <MisView
        ret={returnPicture([])}
        intervention={interventionPicture([], [])}
        conversion={conversionPicture([])}
        learning={learningPicture([])}
        reach={reachPicture([])}
        pushesPerReachedStudentPerDay={null}
        tail={tailPicture([], new Map())}
        reps={[]}
      />,
    );
    expect(html).toMatch(/No structured reasons captured yet/);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });
});
