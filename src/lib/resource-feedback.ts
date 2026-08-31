// ── The resource feedback state machine — the ONE authority on what a tap means
//
// This lives outside the component on purpose. The semantics here were wrong
// twice in one day while they were tangled up in JSX:
//
//   · a negative verdict emitted TWO resource_verdict events, once on the
//     thumb and again when the student said why, so every "not helpful" count
//     doubled;
//   · picking a reason overwrote the verdict, which silently removed the
//     "try another explanation" offer from exactly the students who engaged
//     most;
//   · the secondary resource was rendered without ever emitting an impression,
//     because the mount-only effect could not re-run.
//
// None of those were visible in a render test, because the component only
// renders. A reducer can be driven through a whole journey in a node test and
// asserted event by event — which is what src/lib/resource-feedback.test.ts
// does, and why the semantics live here rather than there.
//
// RULES THIS FILE ENFORCES:
//   1. Every resource actually presented emits exactly one `resource_shown`,
//      keyed by video, so a re-render cannot duplicate it and a swap to the
//      secondary cannot skip it.
//   2. One verdict interaction emits exactly one `resource_verdict`.
//   3. A reason emits `resource_verdict_reason` carrying the same `verdictId`.
//      A reason is not a second opinion; counting verdicts must not double
//      because somebody explained themselves.
//   4. A reason NEVER alters the verdict.
//   5. Switching to the secondary resets the verdict for the NEW resource and
//      never re-emits the old one's events.

export type Verdict = 'helped' | 'okay' | 'did_not' | 'not_opened';

export type ResourceEvent =
  | 'resource_shown'
  | 'resource_opened'
  | 'resource_verdict'
  | 'resource_verdict_reason';

export interface Emitted {
  event: ResourceEvent;
  props: Record<string, unknown>;
}

export interface FeedbackState {
  /** Which resource is on screen. Never both. */
  onSecondary: boolean;
  opened: boolean;
  verdict: Verdict | null;
  /** Independent of `verdict` — collapsing them was defect H4. */
  reasonGiven: boolean;
  /** Video ids already impressed, so impressions are exactly-once per resource. */
  shown: readonly string[];
  verdictId: string | null;
}

export const initialFeedback: FeedbackState = {
  onSecondary: false,
  opened: false,
  verdict: null,
  reasonGiven: false,
  shown: [],
  verdictId: null,
};

export type FeedbackAction =
  | { type: 'present'; videoId: string }
  | { type: 'open' }
  | { type: 'verdict'; verdict: Verdict; verdictId: string }
  | { type: 'reason'; reason: string }
  | { type: 'try_other' };

export interface Reduced {
  state: FeedbackState;
  emit: Emitted[];
}

export function reduceFeedback(state: FeedbackState, action: FeedbackAction): Reduced {
  switch (action.type) {
    case 'present': {
      // Exactly once per resource. Re-renders replay this action and must be
      // silent; a swap to a not-yet-seen video must not be.
      if (state.shown.includes(action.videoId)) return { state, emit: [] };
      return {
        state: { ...state, shown: [...state.shown, action.videoId] },
        emit: [{ event: 'resource_shown', props: {} }],
      };
    }
    case 'open': {
      // Opening is not an impression. It must never add a second
      // resource_shown for a resource already counted.
      if (state.opened) return { state, emit: [] };
      return { state: { ...state, opened: true }, emit: [{ event: 'resource_opened', props: {} }] };
    }
    case 'verdict': {
      // One verdict per resource. A second tap is ignored outright rather than
      // relying on the panel being hidden.
      if (state.verdict !== null) return { state, emit: [] };
      return {
        state: { ...state, verdict: action.verdict, verdictId: action.verdictId },
        emit: [{
          event: 'resource_verdict',
          props: { verdict: action.verdict, verdictId: action.verdictId },
        }],
      };
    }
    case 'reason': {
      // Only meaningful after a negative verdict, only once, and it leaves the
      // verdict exactly as it was.
      if (state.verdict !== 'did_not' || state.reasonGiven) return { state, emit: [] };
      return {
        state: { ...state, reasonGiven: true },
        emit: [{
          event: 'resource_verdict_reason',
          props: { verdictId: state.verdictId, reason: action.reason },
        }],
      };
    }
    case 'try_other': {
      // A fresh interaction for a different resource. Emits nothing itself —
      // the impression comes from the `present` that follows the swap.
      if (state.onSecondary) return { state, emit: [] };
      return {
        state: { ...state, onSecondary: true, verdict: null, reasonGiven: false, opened: false, verdictId: null },
        emit: [],
      };
    }
  }
}

/**
 * Whether to offer the alternative explanation.
 *
 * Gated on the VERDICT, never on whether a reason was given — that was H4, and
 * it punished the student who explained themselves.
 */
export function canOfferSecondary(state: FeedbackState, hasSecondary: boolean): boolean {
  return state.verdict === 'did_not' && !state.onSecondary && hasSecondary;
}

/** The helpfulness question is only honest once they have actually gone. */
export function shouldAskVerdict(state: FeedbackState): boolean {
  return state.opened && state.verdict === null;
}

/** A student who never tapped is telling us about the row, not the video. */
export function shouldOfferNotOpened(state: FeedbackState): boolean {
  return !state.opened && state.verdict === null;
}
