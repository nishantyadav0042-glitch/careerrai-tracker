// ── NOT YET WIRED — read this before you import it ─────────────────────────
//
// As of 27 Aug 2026 nothing in the application calls this module. dispatch()
// still takes its channels from whatever each caller passes in `prefs`. This
// file is the pure core of Event OS Batch 2, which the founder gated on a
// clean production observation window (task #61) that is still open.
//
// THE GAP IS NOT MECHANICAL. EVENT_POLICY declares 26 event types; the
// codebase dispatches considerably more, and many are absent from the table.
// Wiring chooseChannels() into dispatch() therefore changes the behaviour of
// every event not in the table, for the whole cohort. It needs its own cycle
// and its own observation window.
//
// WHEN YOU WIRE IT: the only permitted consumer is src/lib/notification-os.ts
// — the dispatch boundary — and you must delete this marker. Both rules are
// enforced by event-os-writers.guard.test.ts, which is also what stops this
// file from quietly becoming a second answer to "which channels does this
// event use?" while the live one sits in dispatch().

// ── The channel decision, as one pure function ─────────────────────────────
//
// docs/OS/EVENT-OS.md: "Channel policy = f(event class, user capability).
// Producers emit the event and stop; dispatch() decides channels from what
// the user actually has and from the event's own ladder."
//
// This module IS that f. It has no I/O and no imports from the transports —
// which is the point: the decision can be exhaustively tested, and the same
// decision cannot drift between the push path, the email path, and whatever
// WhatsApp becomes. Adding a transport later adds a case here, never a second
// place that decides.
//
// It deliberately does NOT send anything. dispatch() remains the only door;
// this tells dispatch which doors to try, in order.

/** A delivery rail. The event is the product decision; these are plumbing. */
export type Channel = 'whatsapp' | 'push' | 'email' | 'in_app' | 'calendar';

/** How badly this event needs to arrive. From the constitution's catalogue. */
export type Importance = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * What KIND of thing this is. The commercial class alone is governed by the
 * one-pitch-a-day authority; no other class may be counted against it or
 * borrow its exemptions.
 */
export type Taxonomy = 'commercial' | 'transactional' | 'relationship' | 'habit' | 'digest';

/** What this particular user can actually receive. Absence is normal. */
export interface UserCapabilities {
  push: boolean;          // live subscription AND prefs.push === true
  whatsapp: boolean;      // verified number AND recorded consent
  email: boolean;         // a real address on file
  calendar: boolean;      // Google connected with calendar scope
}

export interface EventPolicy {
  importance: Importance;
  taxonomy: Taxonomy;
  /**
   * The rails this event may use, most important first. Filtered against what
   * the user actually has.
   *
   * EVERY survivor is used, not just the first — corrected 27 Aug, when this
   * became the live authority and the comment turned out to describe a
   * different function than the one below. weekly_digest sends email AND push
   * today, and has since August; a first-survivor-wins reading would have made
   * wiring this a silent behaviour change instead of a no-op. If a
   * first-survivor ladder is ever wanted it needs a new field, not a rewrite
   * of what this one means.
   *
   * `in_app` is implicit and always appended — the row is written regardless,
   * so a student with no channels at all still has a record.
   */
  ladder: readonly Channel[];
  /** Bypasses quiet hours. Reserve for events where silence is the harm. */
  urgent?: boolean;
  /** Suppress a repeat for the same key inside the window (minutes). */
  collapseMinutes?: number;
}

/**
 * PAID rails. Cost awareness lives here rather than in a price constant,
 * because the architectural fact ("this rail bills per message") outlives any
 * particular rate — see EVENT-OS.md: rates are modelling inputs, not
 * architecture.
 */
const PAID_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(['whatsapp']);
export function isPaidChannel(c: Channel): boolean { return PAID_CHANNELS.has(c); }

/**
 * The catalogue, as code. Mirrors the table in docs/OS/EVENT-OS.md §4 — that
 * document is the law, this is its executable form, and the guard test holds
 * them to the same shape.
 */
export const EVENT_POLICY: Readonly<Record<string, EventPolicy>> = {
  // ── Session lifecycle — transactional ────────────────────────────────────
  session_scheduled:   { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
  session_reminder:    { importance: 'P1', taxonomy: 'transactional', ladder: ['calendar', 'whatsapp', 'push'] },
  session_cancelled:   { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
  // NOT urgent, deliberately. An expiry is discovered hours after the fact by
  // a cron — the session is already gone and nothing the student does tonight
  // changes it. Waking someone at 3am to say a session they missed has been
  // marked expired is the opposite of must-reach; P0 buys reach, not a
  // quiet-hours bypass.
  session_expired:     { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'] },
  session_rescheduled: { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
  session_request:     { importance: 'P0', taxonomy: 'relationship',  ladder: ['whatsapp', 'push'], urgent: true },
  session_debrief:     { importance: 'P1', taxonomy: 'relationship',  ladder: ['push', 'whatsapp'] },
  orientation_complete:{ importance: 'P1', taxonomy: 'relationship',  ladder: ['push'] },

  // ── The relationship loop — the highest-value retention triggers ─────────
  // A reply is a person answering you. It bypasses quiet hours only inside
  // the window where the student is demonstrably still waiting, which the
  // caller decides; the policy just permits it.
  chat:                { importance: 'P0', taxonomy: 'relationship', ladder: ['whatsapp', 'push'], collapseMinutes: 10 },
  student_logged:      { importance: 'P1', taxonomy: 'relationship', ladder: ['push'] },
  mock_logged:         { importance: 'P1', taxonomy: 'relationship', ladder: ['push', 'whatsapp'] },
  emotional_flag:      { importance: 'P0', taxonomy: 'relationship', ladder: ['whatsapp', 'push'], urgent: true },
  student_recovered:   { importance: 'P1', taxonomy: 'relationship', ladder: ['push'] },
  // Email is load-bearing here: check-red-flags builds a per-student red-flag
  // email to the mentor and hands it to dispatch(). Drop 'email' and that
  // mentor stops hearing that their student is in trouble.
  red_flag:            { importance: 'P1', taxonomy: 'relationship', ladder: ['push', 'email', 'whatsapp'] },

  // ── Money — transactional, must arrive ───────────────────────────────────
  membership:          { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
  renewal_reminder:    { importance: 'P1', taxonomy: 'transactional', ladder: ['push', 'whatsapp'] },
  refund_request:      { importance: 'P0', taxonomy: 'transactional', ladder: ['push'], urgent: true },

  // ── Digest — email is the natural home ───────────────────────────────────
  weekly_digest:       { importance: 'P2', taxonomy: 'digest', ladder: ['email', 'push'] },

  // ── Habit — push only, forever. See assertNoPaidHabitChannel(). ──────────
  daily_heartbeat:     { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  log_recovery:        { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  // habit + email is constitutional: EVENT-OS says the habit loop lives on
  // push (free) and email (near-free). It is the PAID rail habit may never use.
  activation:          { importance: 'P3', taxonomy: 'habit', ladder: ['push', 'email'] },
  inactive_recovery:   { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  daily_insight:       { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },

  // ── Commercial — governed by the one-pitch-a-day authority, not by us ────
  buddy_evening:       { importance: 'P2', taxonomy: 'commercial', ladder: ['push'] },
  broadcast:           { importance: 'P2', taxonomy: 'commercial', ladder: ['push'] },

  // ─────────────────────────────────────────────────────────────────────────
  // COMPLETED 27 Aug — the registry now covers EVERY type dispatch() emits.
  //
  // Until this commit the table held 25 entries against 57 live types, and
  // policyFor() quietly returned DEFAULT_POLICY for the other 32. That was
  // survivable only because nothing consumed the table. It is not survivable
  // now that dispatch() does: an unregistered type would have silently
  // inherited a push-only default, and FOUR types would have lost their email
  // (see EMAIL below). Every ladder here was derived from what the code
  // ACTUALLY DOES today, not from what the design would prefer — that is what
  // makes wiring it a no-op rather than a silent behaviour change.
  //
  // EMAIL. Exactly five live types pass an email leg to dispatch():
  // weekly_digest (already declared), red_flag, activation, onboarding_evening
  // and builder_recovery. The last four had NO email in their ladder, so
  // wiring the old table would have killed a mentor's red-flag email and three
  // student recovery emails without a single test failing. They carry 'email'
  // below, and email-leg-parity.guard.test.ts fails the build if a caller ever
  // passes an email leg for a type whose ladder omits it.
  //
  // WHATSAPP. Several ladders name it. There is no WhatsApp transport, so
  // dispatch() passes whatsapp: false and every one of those entries is inert
  // today. They are intent, recorded where the decision will be read from —
  // not a promise that anything sends.

  // ── Habit — the daily ladder. push (free) and email (near-free) ONLY.
  //    EVENT-OS invariant 2: none of these may ever touch a paid rail.
  onboarding_morning:  { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  onboarding_evening:  { importance: 'P3', taxonomy: 'habit', ladder: ['push', 'email'] },
  onboarding_done:     { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  builder_recovery:    { importance: 'P3', taxonomy: 'habit', ladder: ['push', 'email'] },
  revision_due:        { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  topic_earned:        { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  mission_changed:     { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  weekly_evolved:      { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  timetable_refresh:   { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  plan_extended:       { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  whatsapp_backfill:   { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },

  // The Study Companion slots. One entry each rather than a prefix rule:
  // a family that expands by editing a string is a family nobody can audit.
  companion_kickoff:   { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_morning:   { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_spark:     { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_fact:      { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_open:      { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_wind:      { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_progress:  { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_log:       { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  companion_close:     { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },

  // ── Relationship — a person did something a person should hear about ─────
  buddy_brief:         { importance: 'P1', taxonomy: 'relationship', ladder: ['push'] },
  escalation:          { importance: 'P1', taxonomy: 'relationship', ladder: ['push'] },
  feedback_received:   { importance: 'P1', taxonomy: 'relationship', ladder: ['push'] },
  mock_submitted:      { importance: 'P1', taxonomy: 'relationship', ladder: ['push'] },
  streak_restored:     { importance: 'P2', taxonomy: 'relationship', ladder: ['push'] },
  streak_restored_push:{ importance: 'P2', taxonomy: 'relationship', ladder: ['push'] },

  // ── Account / identity — transactional ───────────────────────────────────
  new_signup:          { importance: 'P1', taxonomy: 'transactional', ladder: ['push'] },
  welcome_verify:      { importance: 'P2', taxonomy: 'transactional', ladder: ['push'] },

  // ── Digest ───────────────────────────────────────────────────────────────
  founder_ping:        { importance: 'P2', taxonomy: 'digest', ladder: ['push'] },

  // ── Internal / diagnostic. Registered so the completeness guard is honest
  //    about them rather than letting them fall through a default. They are
  //    admin- or self-triggered and reach exactly one deliberate recipient.
  e2e_test:            { importance: 'P3', taxonomy: 'transactional', ladder: ['push'] },
  push_self_test:      { importance: 'P3', taxonomy: 'transactional', ladder: ['push'] },
  kohli_18:            { importance: 'P3', taxonomy: 'transactional', ladder: ['push'] },
};

/**
 * Runtime-built type families. `brain_${action_id}` is minted per
 * recommendation, so no static key can cover it. The prefix resolves to one
 * declared policy — it is NOT allowed to fall through to DEFAULT_POLICY,
 * because "the default happens to be right" is how the 32 unregistered types
 * above stayed invisible for a month.
 */
export const EVENT_PREFIX_POLICY: ReadonlyArray<readonly [string, EventPolicy]> = [
  ['brain_', { importance: 'P2', taxonomy: 'habit', ladder: ['push'] }],
];

/**
 * The default for an event with no entry yet. Deliberately the most
 * conservative thing that still reaches someone: push if they have it, the
 * in-app row otherwise. An unknown event can never invent a paid send.
 */
export const DEFAULT_POLICY: EventPolicy = {
  importance: 'P2', taxonomy: 'transactional', ladder: ['push'],
};

export function policyFor(eventType: string): EventPolicy {
  const exact = EVENT_POLICY[eventType];
  if (exact) return exact;
  for (const [prefix, policy] of EVENT_PREFIX_POLICY) {
    if (eventType.startsWith(prefix)) return policy;
  }
  return DEFAULT_POLICY;
}

/** True when the type resolves to a DECLARED policy rather than the default. */
export function hasDeclaredPolicy(eventType: string): boolean {
  return eventType in EVENT_POLICY || EVENT_PREFIX_POLICY.some(([p]) => eventType.startsWith(p));
}

/**
 * EVENT-OS invariant 2, in code: habit traffic can never ride a paid rail.
 *
 * The economics are the reason and they are not close — a daily nudge to
 * 3,000 active students is ~₹0 on push and, if Meta classifies it as
 * marketing (which a habit nudge plausibly is, since it promotes engagement
 * rather than confirming a transaction), roughly ₹98,000 a month. The
 * invariant is enforced here AND asserted by a guard test, so it cannot be
 * softened by editing one table.
 */
export function assertNoPaidHabitChannel(taxonomy: Taxonomy, ladder: readonly Channel[]): void {
  if (taxonomy !== 'habit') return;
  const paid = ladder.filter(isPaidChannel);
  if (paid.length > 0) {
    throw new Error(
      `EVENT-OS invariant 2: habit traffic may never ride a paid channel (found ${paid.join(', ')}). ` +
      'The habit loop lives on push and email. This is permanent, not a phase.',
    );
  }
}

/**
 * THE decision. Returns the rails to attempt, best first.
 *
 * `in_app` is always appended: dispatch writes the row whatever happens, so a
 * student with no push, no WhatsApp and no email still has a record waiting
 * when they next open the app. A notification nobody can receive is still a
 * notification that happened.
 */
export function chooseChannels(eventType: string, caps: UserCapabilities): Channel[] {
  const policy = policyFor(eventType);
  assertNoPaidHabitChannel(policy.taxonomy, policy.ladder);

  const available: Channel[] = policy.ladder.filter((c) => {
    switch (c) {
      case 'push': return caps.push;
      case 'whatsapp': return caps.whatsapp;
      case 'email': return caps.email;
      case 'calendar': return caps.calendar;
      case 'in_app': return true;
    }
  });

  return [...available, 'in_app'];
}

/**
 * Should this event wait for morning?
 *
 * Deliberately takes the window as an argument rather than assuming one. The
 * obvious 23:00–07:00 is wrong for this product: CAT aspirants study late,
 * and a buddy replying at 23:30 to a student who wrote at 23:10 is answering
 * someone who is sitting there waiting. So: urgent events never wait, and a
 * reply inside the responding window never waits either.
 */
export function shouldHoldForQuietHours(
  eventType: string,
  nowMinutesIST: number,
  quiet: { startMinute: number; endMinute: number } | null,
  opts: { minutesSinceRecipientActed?: number } = {},
): boolean {
  if (!quiet) return false;
  const policy = policyFor(eventType);
  if (policy.urgent) return false;

  // They wrote to us minutes ago — they are awake and expecting an answer.
  const acted = opts.minutesSinceRecipientActed;
  if (acted != null && acted <= 15) return false;

  const { startMinute, endMinute } = quiet;
  return startMinute <= endMinute
    ? nowMinutesIST >= startMinute && nowMinutesIST < endMinute
    : nowMinutesIST >= startMinute || nowMinutesIST < endMinute; // window crosses midnight
}

/** Collapse key for an event, or null when repeats are not expected. */
export function collapseWindowMinutes(eventType: string): number | null {
  return policyFor(eventType).collapseMinutes ?? null;
}
