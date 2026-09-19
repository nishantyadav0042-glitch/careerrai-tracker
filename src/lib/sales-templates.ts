import type { DueReason } from '@/lib/call-queue';

// ── The counsellor's message clipboard ──────────────────────────────────────
//
// Anshul, 19 Sep 2026: "a Message Clipboard near the calling section could be
// very useful. It could have 3-4 customisable templates for different
// situations, so we can simply select the relevant message and send it without
// manually copying/pasting every time." He supplied the four messages below.
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
// ── THE COPY IS ANSHUL'S AND IS NOT OURS TO EDIT (founder, 19 Sep 2026) ─────
//
// The first version of this file trimmed his messages to the house style in
// sales-messages.ts — shorter lines, a "— Anshul, CareerRai" sign-off, one ask
// per message. The founder rejected that: "Do NOT change Anshul's four
// WhatsApp message templates. I want his messages kept exactly as provided,
// including wording, tone, structure and length. Do not trim them, rewrite
// them, add a sender name, or modify them to fit any house style."
//
// He is right, and the reason outlasts the instruction. These are not copy we
// drafted for a lane; they are what a counsellor found works on the phone with
// real students, in his own register. The house style was inferred from
// messages we wrote. Rewriting his to match it would have replaced evidence
// with convention, and he would have gone on pasting his own version anyway —
// leaving the clipboard used for the picker and ignored for the words, which
// is the worst of both.
//
// So COPY is frozen verbatim below, down to the curly apostrophes, and the
// guard test pins every character. The ONLY transformation is `[Name]` →
// the student's first name, which is the placeholder doing the job he wrote
// it to do. There is no other substitution, and nothing is appended.
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

/** The placeholder Anshul wrote. The one and only substitution we make. */
export const NAME_PLACEHOLDER = '[Name]';

/** What the message needs to know. Comes from the card, never guessed. */
export interface TemplateVars {
  firstName: string;
}

export interface MessageTemplate {
  /**
   * Stable forever. It is written to `sales_activity.template_key`, so
   * renaming one orphans every row already recorded under the old name.
   * Retire a key by removing it from `lanes`, never by renaming it.
   */
  key: string;
  /** Anshul's own name for the situation. Lands in the log note. */
  label: string;
  /**
   * His message, exactly as supplied. Never edited here — see the header.
   * Pinned character-for-character by sales-templates.guard.test.ts.
   */
  copy: string;
  /** Which lanes offer it. Order within a lane is the order shown. */
  lanes: DueReason[];
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'no_answer_reachout',
    label: 'No Answer / First Reach-out',
    copy: 'Hi [Name], I tried reaching you regarding your CAT preparation. I just wanted to understand where you currently stand with your preparation and whether your routine is going the way you planned. Whenever you get a moment, just drop me a message — I’d be happy to connect.',
    lanes: ['retry', 'fresh'],
  },
  {
    key: 'busy_callback',
    label: 'Busy / Callback',
    copy: 'Hi [Name], no worries, I understand you were occupied. Whenever you get a little time, just drop me a quick message and I’ll connect with you. I’d genuinely like to know how your preparation is shaping up and whether everything is on track.',
    lanes: ['callback', 'retry'],
  },
  {
    key: 'general_followup',
    label: 'General Follow-up',
    copy: 'Hi [Name], just checking in — how are things going with your CAT preparation? Are you able to follow the routine you had planned, or is something making it difficult to stay consistent? Whenever you’re free, feel free to share an update with me. I’ll be happy to help wherever I can.',
    lanes: ['followup', 'rotation', 'restart', 'going_cold'],
  },
  {
    // His fourth, and the most interesting: it asks whether OUR product fits
    // the student's life rather than whether the student is trying hard
    // enough. That is the question the 24 Sep read is about, so the answers
    // are worth having even though the lane is dealt as a call.
    key: 'app_difficulty',
    label: 'App / Preparation Follow-up',
    copy: 'Hi [Name], I wanted to check something with you regarding your preparation. Are you actually able to make the application work around your current routine, or are you facing any difficulty with the schedule/tasks? Just let me know whenever you’re free — we can figure it out together.',
    lanes: ['attention', 'new_never_logged', 'broken_streak'],
  },
];

/**
 * The message as the student will receive it: his copy, with `[Name]` filled
 * in. Nothing else changes — no sign-off is appended, no line is trimmed.
 */
export function renderTemplate(t: MessageTemplate, v: TemplateVars): string {
  return t.copy.split(NAME_PLACEHOLDER).join(v.firstName);
}

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
   * someone who told us why they could not study "with a template wastes the
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
