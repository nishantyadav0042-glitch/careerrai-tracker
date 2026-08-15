// The /start funnel's screen order — ONE list, shared by the screen that fires
// the beacon and the route that accepts it.
//
// WHY THIS FILE EXISTS. These two lived apart: page.tsx held BASE_STEP_KEYS and
// api/funnel/route.ts held its own STEPS allowlist. When 'instant-insight' and
// 'reality-check' were added to the funnel, nobody added them to the allowlist,
// and the route's guard is
//
//     if (!STEPS.has(step)) return NextResponse.json({ ok: true });
//
// — it drops the event and reports SUCCESS. So the two screens fired their
// beacon on every visit, the server answered 200, and `funnel_events` recorded
// nothing. Fourteen days of data show topic-coverage and mentor firing normally
// with exactly ZERO rows for the screen between them.
//
// The cost was not a missing chart. Instant Insight is the pre-signup WOW —
// the diagnosis that is meant to prove the product knows something the
// student's coaching does not. It has never been measured once, so nobody
// could tell whether it converts, and it was invisible in every funnel review.
//
// This is the same failure this codebase keeps paying for: a filter the caller
// cannot see, failing silently and reporting success (the OTP `created_at`
// filter that rendered confident zeros; `read_at` that nothing ever wrote;
// report-error.ts posting `where`/`screen` keys the route ignored). The fix is
// always the same — one definition, imported, never re-declared.
//
// ADDING A SCREEN: add it here, in order. The beacon and the allowlist both
// follow automatically, and it is no longer possible for them to disagree.

/** The questions, in the order a visitor answers them. Drives both the progress bar and the beacon. */
export const START_STEP_KEYS = [
  'need-check',
  'target-date',
  'dream-percentile',
  'quick-facts',
  'reality-check',
  // Founder, 15 Aug: right after the gut-check names the "weakest topics"
  // blind spot, ask it directly — one tap, three options. Same question, same
  // component (screen-weakest-section) the post-login modal already asks;
  // this funnel had never asked it, so every pre-auth signup fell through to
  // the DILR default (see that component's own header for the 14 Aug audit).
  'weakest-section',
  'topic-coverage',
  'instant-insight',
  'mentor',
] as const;

/**
 * Steps that exist outside the numbered question flow:
 * - `landed` fires from an inline script before React hydrates, so it counts
 *   page-opens that bounce during the bundle download (matches Meta's Landing
 *   Page Views).
 * - `login-build` is the terminal signup screen, deliberately excluded from
 *   START_STEP_KEYS so it never counts toward the progress bar.
 * - `reassurance` was removed from the funnel in v4. It stays accepted so the
 *   historical rows keep a valid name; nothing fires it any more.
 * - `pain-points` was removed 13 Aug (founder: the screen was too much text,
 *   nobody would read it). Same reasoning as reassurance — kept acceptable so
 *   funnel_events history for it stays a valid, queryable name.
 */
const EXTRA_STEPS = ['landed', 'login-build', 'reassurance', 'pain-points'] as const;

/** Every `start:*` name the beacon route will accept. Derived — never hand-written. */
export const ACCEPTED_FUNNEL_STEPS: ReadonlySet<string> = new Set(
  [...START_STEP_KEYS, ...EXTRA_STEPS].map((k) => `start:${k}`)
);
