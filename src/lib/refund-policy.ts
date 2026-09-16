// ── THE REFUND GUARANTEE: ONE NUMBER, ONE WINDOW, ONE SENTENCE ──────────────
//
// We advertise a money-back guarantee on /pricing, /terms and /refunds. Until
// today the bar was 20 logged study days inside the first 30, and that bar
// lived as five separate literals — the granting API, the student's progress
// card, and the three public pages that make the promise. Nothing but care
// kept the promise and the code in agreement.
//
// THE BAR WAS UNCLAIMABLE. Measured 16 Sep 2026 against the exact window the
// policy uses (distinct logged days in the 30 days from signup), here is every
// student who has ever paid us, best first:
//
//     15, 11, 10, 7, 5, 4, 4
//
// Nobody reached 20. Not one, ever. Across all 324 students who have logged a
// single day, three reached 20 — under 1%. A guarantee the best customer in
// company history misses by five days is not a guarantee. It is advertising,
// and we printed it on three public pages and in our Terms.
//
// WHY 10, AND NOT A NUMBER THAT IS MERELY EASIER. The condition exists to
// establish one thing: that the student gave CareerRai a fair chance before
// asking for the money back. Not that they were exceptional, and not that they
// jumped a bar set where refusal is automatic.
//
//   · Ten days out of thirty is a student who came back on ten separate days
//     across a month. The mentor was used, the plan was filled, the product
//     had every chance to work. One day, or four, has not established that,
//     so the condition still means something.
//   · At 10, three of the seven payers clear it (15, 11, 10). A promise that
//     roughly 40% of paying students can actually invoke carries real cost,
//     which is the only kind worth printing.
//   · It agrees with what we believe about our own product. Our retention
//     research rejected daily opening as the behaviour to demand; requiring 20
//     daily logs out of 30 contradicted that in public, in writing.
//   · It survives being said out loud in one line — ten days in your first
//     month — and a student can check it against their own log in seconds.
//
// EVERY SURFACE READS THIS FILE. The API that grants the refund, the card that
// draws the progress bar, and the three public pages all interpolate
// REFUND_REQUIRED_DAYS and count through refundWindow(). There is no second
// copy of the number to drift, and refund-policy.guard.test.ts fails the build
// the moment one appears.

/** Logged study days required inside the window to claim the refund. */
export const REFUND_REQUIRED_DAYS = 10;

/** Length of the refund window, counted from the day the account was created. */
export const REFUND_WINDOW_DAYS = 30;

/**
 * The window a claim is measured over: `[start, end]` as ISO dates, inclusive.
 *
 * Both the granting API and the student's progress card call this. They used
 * to build the range independently — same intent, two expressions — and only
 * the upper bound was ever applied, so a log recorded BEFORE signup counted
 * toward the guarantee. The lower bound closes that; in practice no such row
 * exists, which is exactly why it could have stayed wrong indefinitely.
 */
export function refundWindow(createdAt: string | Date): { start: string; end: string } {
  const joined = new Date(createdAt);
  return {
    start: joined.toISOString().slice(0, 10),
    end: new Date(joined.getTime() + REFUND_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
  };
}

/** Is this account still inside its refund window right now? */
export function isInRefundWindow(createdAt: string | Date, now: Date = new Date()): boolean {
  const joined = new Date(createdAt);
  return now.getTime() <= joined.getTime() + REFUND_WINDOW_DAYS * 86_400_000;
}

/**
 * What a student is told when they are short.
 *
 * It names the bar, their own count, and the gap — a student who reads this
 * should never have to work out whether they qualify, or wonder whether the
 * number on the page is the number in the code.
 */
export function refundShortfallMessage(daysLogged: number): string {
  const short = Math.max(0, REFUND_REQUIRED_DAYS - daysLogged);
  return `The refund guarantee needs ${REFUND_REQUIRED_DAYS} logged study days in your first month. `
    + `You have ${daysLogged} — ${short} more to go.`;
}
