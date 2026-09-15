// ── A logged WhatsApp message must be a message someone actually sent ───────
//
// Founder, 15 Sep 2026, after reading the counsellor review: "she is making us
// fool and not really calling students… remove bulk messages option."
//
// THERE WAS NEVER A BULK OPTION. The deck gives each card its own pair of
// controls: a green `wa.me` link that opens WhatsApp, and a separate
// "Messaged" button that records the claim. Nothing bound the two together, so
// the record could be written without the send ever happening — and it was.
//
// WHAT PRODUCTION SHOWED (1–15 Sep, self_reported rows):
//
//   rep      channel     median gap   gaps under 10s
//   Anshul   phone            146s     2%
//   Anshul   whatsapp          32s     2%
//   Neelam   phone            125s     0%   ← indistinguishable from Anshul
//   Neelam   whatsapp           4s    90%   ← 277 of 316
//
// One burst, 8 Sep: 22 messages between 19:27:45 and 19:29:51, gaps of
// 3–6 seconds, every row carrying the SAME template text. Sending on WhatsApp
// means leaving the app, waiting for it to open, sending, and coming back.
// That is not a four-second round trip. The calls were real; the messages
// were not.
//
// THE RULE, AND WHY IT IS A FLOOR AND NOT A QUOTA: this does not measure how
// many messages anyone sends, and it may never be reported as output —
// SALES-OS §0 forbids a tap count from becoming a target or a judgement. It
// only refuses to record a claim the clock says could not have happened. A rep
// who really sends is never blocked: the round trip already costs them longer
// than this.
//
// Deliberately generous. Twenty seconds still allows three messages a minute,
// well above any honest pace, and sits clear of the 10-second band where 90%
// of the fabricated rows fell. Set it tighter and a slow-but-real send starts
// failing, which would teach reps that the log lies — the opposite of the point.
export const MIN_SECONDS_BETWEEN_MESSAGES = 20;

/**
 * Sent with the 429 so the card can tell this apart from a network failure and
 * say "wait" rather than "could not save" — a rep who reads the wrong error
 * taps again, which is exactly the behaviour this rule is trying to stop.
 */
export const MESSAGE_TOO_SOON_CODE = 'MESSAGE_TOO_SOON';

export type CadenceVerdict =
  | { ok: true }
  | { ok: false; waitSeconds: number; message: string };

/**
 * May this rep record another `messaged` right now?
 *
 * Pure, and takes the previous timestamp rather than reading it, so the rule
 * has one definition and the route stays responsible for the query. `null`
 * (no previous message today) always passes — the first message of a session
 * is never suspicious.
 *
 * A previous timestamp in the FUTURE also passes. Clock skew between the
 * database and a rep's device is real, and the failure direction that matters
 * is refusing honest work: an impossible-looking gap is not evidence of
 * anything, so it is not treated as one.
 */
export function messageCadenceVerdict(
  previousMessagedAt: Date | string | null | undefined,
  now: Date = new Date(),
): CadenceVerdict {
  if (!previousMessagedAt) return { ok: true };
  const prev = previousMessagedAt instanceof Date
    ? previousMessagedAt
    : new Date(previousMessagedAt);
  if (Number.isNaN(prev.getTime())) return { ok: true };

  const elapsed = (now.getTime() - prev.getTime()) / 1000;
  if (elapsed < 0) return { ok: true };
  if (elapsed >= MIN_SECONDS_BETWEEN_MESSAGES) return { ok: true };

  const waitSeconds = Math.max(1, Math.ceil(MIN_SECONDS_BETWEEN_MESSAGES - elapsed));
  return {
    ok: false,
    waitSeconds,
    // Says what to do, not what the rep is suspected of. The counsellor who
    // genuinely sent a message and hit this deserves an instruction, not an
    // accusation — and the one who did not gets the same sentence.
    message: `Send the message on WhatsApp first, then log it. Try again in ${waitSeconds}s.`,
  };
}
