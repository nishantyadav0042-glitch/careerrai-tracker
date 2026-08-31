/**
 * The feedback state machine, driven through whole student journeys.
 *
 * Every test here corresponds to a defect that actually shipped in the Layer A
 * build and was caught by audit, not by the render tests — because a render
 * test renders once and these are all sequence bugs. See
 * docs/phase0/RESOURCE-LAYER-AUDIT.md findings H2, H3, H4.
 */
import { describe, it, expect } from 'vitest';
import {
  reduceFeedback, initialFeedback, canOfferSecondary, shouldAskVerdict, shouldOfferNotOpened,
  type FeedbackState, type FeedbackAction, type Emitted,
} from './resource-feedback';

/** Drive a journey and collect every event it emitted, in order. */
function run(actions: FeedbackAction[], from: FeedbackState = initialFeedback) {
  let state = from;
  const events: Emitted[] = [];
  for (const a of actions) {
    const r = reduceFeedback(state, a);
    state = r.state;
    events.push(...r.emit);
  }
  return { state, events, names: events.map((e) => e.event) };
}

const PRIMARY = 'aaaaaaaaaaa';
const SECONDARY = 'bbbbbbbbbbb';

describe('H2 — every resource presented emits exactly one impression', () => {
  it('primary shown once', () => {
    expect(run([{ type: 'present', videoId: PRIMARY }]).names).toEqual(['resource_shown']);
  });

  it('re-renders do not duplicate the impression', () => {
    const { names } = run([
      { type: 'present', videoId: PRIMARY },
      { type: 'present', videoId: PRIMARY },
      { type: 'present', videoId: PRIMARY },
    ]);
    expect(names).toEqual(['resource_shown']);
  });

  it('opening the link does not emit another impression', () => {
    const { names } = run([
      { type: 'present', videoId: PRIMARY },
      { type: 'open' },
      { type: 'present', videoId: PRIMARY },
    ]);
    expect(names).toEqual(['resource_shown', 'resource_opened']);
  });

  it('swapping to the secondary emits its own impression — the H2 defect', () => {
    // Before the fix this second impression never fired at all, so a secondary
    // ignored and a secondary never seen were the same number.
    const { names } = run([
      { type: 'present', videoId: PRIMARY },
      { type: 'open' },
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'try_other' },
      { type: 'present', videoId: SECONDARY },
    ]);
    expect(names.filter((n) => n === 'resource_shown')).toHaveLength(2);
  });

  it('primary never replaced yields exactly one impression', () => {
    const { names } = run([
      { type: 'present', videoId: PRIMARY },
      { type: 'open' },
      { type: 'verdict', verdict: 'helped', verdictId: 'v1' },
    ]);
    expect(names.filter((n) => n === 'resource_shown')).toHaveLength(1);
  });

  it('opening twice cannot emit two opens', () => {
    const { names } = run([{ type: 'open' }, { type: 'open' }]);
    expect(names).toEqual(['resource_opened']);
  });
});

describe('H3 — one verdict interaction is one verdict event', () => {
  for (const v of ['helped', 'okay', 'did_not', 'not_opened'] as const) {
    it(`${v} emits exactly one resource_verdict`, () => {
      const { names } = run([{ type: 'verdict', verdict: v, verdictId: 'v1' }]);
      expect(names.filter((n) => n === 'resource_verdict')).toHaveLength(1);
    });
  }

  it('not helpful PLUS a reason is still ONE verdict — the H3 defect', () => {
    // Before the fix the reason emitted a second resource_verdict, so every
    // "not helpful" count doubled for the students who explained themselves.
    const { names } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'reason', reason: 'Too long' },
    ]);
    expect(names.filter((n) => n === 'resource_verdict')).toHaveLength(1);
    expect(names.filter((n) => n === 'resource_verdict_reason')).toHaveLength(1);
  });

  it('the reason carries the verdict it belongs to, so the two can be joined', () => {
    const { events } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v-abc' },
      { type: 'reason', reason: 'Too basic' },
    ]);
    const verdict = events.find((e) => e.event === 'resource_verdict')!;
    const reason = events.find((e) => e.event === 'resource_verdict_reason')!;
    expect(reason.props.verdictId).toBe(verdict.props.verdictId);
    expect(reason.props.verdictId).toBe('v-abc');
  });

  it('a reason picker opened but never answered emits nothing extra', () => {
    const { names } = run([{ type: 'verdict', verdict: 'did_not', verdictId: 'v1' }]);
    expect(names).toEqual(['resource_verdict']);
  });

  it('repeated verdict taps cannot produce duplicates', () => {
    const { names } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'verdict', verdict: 'helped', verdictId: 'v2' },
      { type: 'verdict', verdict: 'okay', verdictId: 'v3' },
    ]);
    expect(names).toEqual(['resource_verdict']);
  });

  it('repeated reason taps cannot produce duplicates', () => {
    const { names } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'reason', reason: 'Too long' },
      { type: 'reason', reason: 'Too basic' },
    ]);
    expect(names.filter((n) => n === 'resource_verdict_reason')).toHaveLength(1);
  });

  it('a reason without a negative verdict is meaningless and emits nothing', () => {
    expect(run([{ type: 'reason', reason: 'Too long' }]).names).toEqual([]);
    const afterPositive = run([
      { type: 'verdict', verdict: 'helped', verdictId: 'v1' },
      { type: 'reason', reason: 'Too long' },
    ]);
    expect(afterPositive.names.filter((n) => n === 'resource_verdict_reason')).toHaveLength(0);
  });
});

describe('H4 — explaining yourself must not cost you the alternative', () => {
  it('a reason never changes the verdict', () => {
    const { state } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'reason', reason: 'Too long' },
    ]);
    expect(state.verdict).toBe('did_not');
    expect(state.reasonGiven).toBe(true);
  });

  it('the secondary is still offered after a reason — the H4 defect', () => {
    // Before the fix, reason() set verdict to 'helped' to collapse the panel,
    // and the offer is gated on 'did_not' — so the student who told us why
    // silently lost the "try another explanation" button.
    const { state } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'reason', reason: 'Too long' },
    ]);
    expect(canOfferSecondary(state, true)).toBe(true);
  });

  it('offers nothing when there is no secondary to offer', () => {
    const { state } = run([{ type: 'verdict', verdict: 'did_not', verdictId: 'v1' }]);
    expect(canOfferSecondary(state, false)).toBe(false);
  });

  it('never offers a secondary on a positive verdict', () => {
    for (const v of ['helped', 'okay', 'not_opened'] as const) {
      const { state } = run([{ type: 'verdict', verdict: v, verdictId: 'v1' }]);
      expect(canOfferSecondary(state, true), v).toBe(false);
    }
  });

  it('never offers a third resource once on the secondary', () => {
    const { state } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'try_other' },
      { type: 'verdict', verdict: 'did_not', verdictId: 'v2' },
    ]);
    expect(canOfferSecondary(state, true)).toBe(false);
  });
});

describe('Flow B — the full negative journey, end to end', () => {
  it('primary → not helpful → reason → secondary → open, with honest events', () => {
    const { state, names } = run([
      { type: 'present', videoId: PRIMARY },
      { type: 'open' },
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'reason', reason: 'Too long' },
      { type: 'try_other' },
      { type: 'present', videoId: SECONDARY },
      { type: 'open' },
      { type: 'verdict', verdict: 'helped', verdictId: 'v2' },
    ]);
    expect(names).toEqual([
      'resource_shown',            // primary
      'resource_opened',
      'resource_verdict',          // exactly one negative verdict
      'resource_verdict_reason',   // enrichment, not a second verdict
      'resource_shown',            // secondary — H2
      'resource_opened',
      'resource_verdict',          // one verdict for the secondary
    ]);
    expect(names.filter((n) => n === 'resource_verdict')).toHaveLength(2);
    expect(state.onSecondary).toBe(true);
    expect(state.verdict).toBe('helped');
  });

  it('switching resource clears the previous verdict rather than inheriting it', () => {
    const { state } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'reason', reason: 'Too basic' },
      { type: 'try_other' },
    ]);
    expect(state.verdict).toBeNull();
    expect(state.reasonGiven).toBe(false);
    expect(state.opened).toBe(false);
    expect(state.verdictId).toBeNull();
  });

  it('cannot swap twice — there is no third resource', () => {
    const { state, names } = run([
      { type: 'verdict', verdict: 'did_not', verdictId: 'v1' },
      { type: 'try_other' },
      { type: 'try_other' },
    ]);
    expect(state.onSecondary).toBe(true);
    expect(names.filter((n) => n === 'resource_shown')).toHaveLength(0);
  });
});

describe('the verdict question is only asked when it is honest', () => {
  it('asks only after the student actually left', () => {
    expect(shouldAskVerdict(initialFeedback)).toBe(false);
    const { state } = run([{ type: 'open' }]);
    expect(shouldAskVerdict(state)).toBe(true);
  });

  it('offers "not useful to me" only before an open, and never as a content verdict', () => {
    expect(shouldOfferNotOpened(initialFeedback)).toBe(true);
    const { state } = run([{ type: 'open' }]);
    expect(shouldOfferNotOpened(state)).toBe(false);
  });

  it('stops asking once answered', () => {
    const { state } = run([{ type: 'open' }, { type: 'verdict', verdict: 'okay', verdictId: 'v1' }]);
    expect(shouldAskVerdict(state)).toBe(false);
  });
});
