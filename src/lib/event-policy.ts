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
   * Preferred rails, best first. Filtered against what the user has; the
   * first survivor wins. `in_app` is implicit and always last — the row is
   * written regardless, so a student with nothing still has a record.
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
  session_reminder_30m:{ importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
  session_cancelled:   { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
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
  red_flag:            { importance: 'P1', taxonomy: 'relationship', ladder: ['push', 'whatsapp'] },

  // ── Money — transactional, must arrive ───────────────────────────────────
  membership:          { importance: 'P0', taxonomy: 'transactional', ladder: ['whatsapp', 'push'], urgent: true },
  renewal_reminder:    { importance: 'P1', taxonomy: 'transactional', ladder: ['push', 'whatsapp'] },
  refund_request:      { importance: 'P0', taxonomy: 'transactional', ladder: ['push'], urgent: true },

  // ── Digest — email is the natural home ───────────────────────────────────
  weekly_digest:       { importance: 'P2', taxonomy: 'digest', ladder: ['email', 'push'] },

  // ── Habit — push only, forever. See assertNoPaidHabitChannel(). ──────────
  daily_heartbeat:     { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  log_recovery:        { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  activation:          { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  inactive_recovery:   { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },
  daily_insight:       { importance: 'P3', taxonomy: 'habit', ladder: ['push'] },

  // ── Commercial — governed by the one-pitch-a-day authority, not by us ────
  buddy_evening:       { importance: 'P2', taxonomy: 'commercial', ladder: ['push'] },
  broadcast:           { importance: 'P2', taxonomy: 'commercial', ladder: ['push'] },
};

/**
 * The default for an event with no entry yet. Deliberately the most
 * conservative thing that still reaches someone: push if they have it, the
 * in-app row otherwise. An unknown event can never invent a paid send.
 */
export const DEFAULT_POLICY: EventPolicy = {
  importance: 'P2', taxonomy: 'transactional', ladder: ['push'],
};

export function policyFor(eventType: string): EventPolicy {
  return EVENT_POLICY[eventType] ?? DEFAULT_POLICY;
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
