import type { DueReason } from '@/lib/call-queue';

// ── The counsellor's message clipboard ──────────────────────────────────────
//
// Anshul, 19 Sep 2026: "a Message Clipboard near the calling section could be
// very useful. It could have 3-4 customisable templates for different
// situations, so we can simply select the relevant message and send it without
// manually copying/pasting every time."
//
// WHAT HE WAS ACTUALLY DOING. Measured before building, against production:
// 51 of his `messaged` rows, 50 of them distinct, averaging 176 characters and
// beginning with the student's first name. He was pasting the whole message he
// had just sent back into "What did you message them?" — so the copy/paste he
// named happens TWICE per card, once into WhatsApp and once into the log.
//
// WHY THE GAP EXISTS. lib/sales-messages.ts already writes one message per
// card from lane + journey stage, and for most lanes it is good. But
// `callback`, `retry` and `followup` all fall through to a single line —
// "Tried calling you — when is a good time?" — and over 14 days those three
// lanes were 386 of Anshul's 1,066 cards. More than a third of his working
// day had one generic sentence and no alternative.
//
// WHAT THIS MODULE IS NOT. It is not a bulk sender and not an autoresponder.
// The counsellor picks, WhatsApp opens with the text already typed, and a
// human presses send — exactly as before. The cadence gate in
// lib/sales-message-cadence.ts (22 messages in 2m06s, all one template,
// 15 Sep) and the card's "open WhatsApp before you may log it" gate both
// still stand, and nothing here weakens either.
//
// THE DOCTRINE IT MUST NOT BREAK. call-queue.ts says a card carries a brief
// "never a canned message", and of the attention lane: answering a student who
// told us in their own words why they could not study "with a template wastes
// the one moment they chose to tell us something." That rule is kept literally
// below: where the card carries the student's own remarks, `templatesFor`
// returns a caution and the picker does not lead with a template.

/** What the message needs to know. Both come from the card, never guessed. */
export interface TemplateVars {
  firstName: string;
  repFirstName: string;
}

export interface MessageTemplate {
  /**
   * Stable forever. It is written to `sales_activity.template_key`, so
   * renaming one orphans every row already recorded under the old name.
   * Retire a key by removing it from `lanes`, never by renaming it.
   */
  key: string;
  /** What the counsellor picks from, and what lands in the log note. */
  label: string;
  /** Which lanes offer it. Order within a lane is the order shown. */
  lanes: DueReason[];
  body: (v: TemplateVars) => string;
}

const sign = (rep: string) => `— ${rep}, CareerRai`;

/**
 * Anshul's four drafts, kept in his words and his register — he wrote them
 * against real conversations and they are warmer than anything generated from
 * a lane. Trimmed only to the house style already in sales-messages.ts: short
 * lines, one ask, and a name the student can recognise, because a WhatsApp
 * from an unknown number with no sender is the one that gets blocked.
 *
 * Every line is checked by the guard test against Incident #76 — no message
 * may name a screen, button or feature that does not exist. That incident
 * ended with three refusal messages telling students to "add your classes by
 * hand" on a screen the product has never had.
 */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'no_answer_reachout',
    label: 'No answer / first reach-out',
    lanes: ['retry', 'fresh'],
    body: ({ firstName, repFirstName: rep }) =>
      `${firstName}, this is ${rep} from CareerRai — I tried reaching you about your CAT preparation.\n`
      + `I wanted to understand where you stand right now, and whether your routine is going the way you planned.\n`
      + `Whenever you get a moment, just drop me a message.`,
  },
  {
    key: 'busy_callback',
    label: 'Busy / call back later',
    lanes: ['callback', 'retry'],
    body: ({ firstName, repFirstName: rep }) =>
      `${firstName}, no worries — I know you were busy.\n`
      + `Whenever you get a little time, drop me a quick message and I'll call back. I'd genuinely like to know how your preparation is shaping up.\n`
      + `${sign(rep)}`,
  },
  {
    key: 'general_followup',
    label: 'General follow-up',
    lanes: ['followup', 'rotation', 'restart', 'going_cold'],
    body: ({ firstName, repFirstName: rep }) =>
      `${firstName}, just checking in — how is your CAT preparation going?\n`
      + `Are you able to follow the routine you planned, or is something making it hard to stay consistent?\n`
      + `Share an update whenever you're free.\n`
      + `${sign(rep)}`,
  },
  {
    // Anshul's fourth, and the most interesting: it asks whether OUR product
    // fits the student's life rather than whether the student is trying hard
    // enough. That is the question the 24 Sep read is about, so the answers
    // are worth having even though the lane is dealt as a call.
    key: 'app_difficulty',
    label: 'App / schedule not working',
    lanes: ['attention', 'new_never_logged', 'broken_streak'],
    body: ({ firstName, repFirstName: rep }) =>
      `${firstName}, I wanted to check one thing about your preparation.\n`
      + `Are you able to make CareerRai work around your current routine, or are you finding the schedule or the tasks difficult?\n`
      + `Tell me whenever you're free — we can sort it out together.\n`
      + `${sign(rep)}`,
  },
];

/** Every key ever shipped. The guard test pins this list. */
export const TEMPLATE_KEYS: string[] = MESSAGE_TEMPLATES.map((t) => t.key);

/** Server-side lookup. Returns null for anything not shipped here. */
export function templateByKey(key: unknown): MessageTemplate | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  return MESSAGE_TEMPLATES.find((t) => t.key === key) ?? null;
}

/** The note written to the log when a template was used. */
export function templateNote(t: MessageTemplate): string {
  return `Sent: ${t.label}`;
}

export interface TemplateOffer {
  templates: MessageTemplate[];
  /**
   * Set when the card carries the student's own words. The picker shows it
   * instead of leading with a template — call-queue.ts, 15 Sep: answering
   * someone who told us why they could not study with a template "wastes the
   * one moment they chose to tell us something."
   */
  caution: string | null;
}

/**
 * The templates offered for this card.
 *
 * `hasRemarks` is whether the card is showing what the student themselves said
 * (lib/sales-remarks.ts owns that definition — a typed, self-reported remark,
 * not our own intake bookkeeping, which is Incident #69). When it is true the
 * templates are still reachable, because a counsellor who has read the remark
 * may still want one; they are just no longer the first thing on the card.
 */
export function templatesFor(input: { lane: DueReason; hasRemarks: boolean }): TemplateOffer {
  const templates = MESSAGE_TEMPLATES.filter((t) => t.lanes.includes(input.lane));
  return {
    templates,
    caution: input.hasRemarks && templates.length > 0
      ? 'They told you something last time — read it above before sending a template.'
      : null,
  };
}
