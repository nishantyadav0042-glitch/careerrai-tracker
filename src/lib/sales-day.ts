import type { DueReason } from '@/lib/call-queue';
import {
  DAY_FLOOR, DAY_CEILING, ROTATION_FLOOR, ATTENTION_CEILING, NEW_ARRIVAL_CEILING,
  ROTATION_CALL_EVERY, DAY_ANCHOR_HOUR_IST, CONVERSION_CEILING, RETRY_CEILING,
  FRESH_PIN_PER_DAY,
} from '@/lib/os/scale-config';

// ── THE DAY — how 50 to 70 students are dealt from what the book supplies ────
//
// Founder, 2 Sep 2026: "keep a range 50–70 daily", "a mix of all variety",
// "the old students must rotate". This module is the whole rule, as a pure
// function, so it can be proven rather than described:
//
//   1. Candidates arrive already ranked by the queue (promises first, money,
//      retention, new arrivals, buddy intent, attention, then the rotation
//      pool: never contacted first, then the longest silent).
//   2. Two lanes have ceilings — attention and new arrivals — because either
//      can spike on one evening and eat the day. What they cannot fit is
//      HELD BACK, not discarded: it comes back if the day would otherwise be
//      short, and it comes back tomorrow regardless.
//   3. Signals fill first. Rotation gets whatever is left up to the ceiling,
//      and never fewer than ROTATION_FLOOR, so the silent book always moves.
//   4. The day is built to DAY_CEILING whenever the book can supply it
//      (founder, 15 Sep) and is never below DAY_FLOOR while it can — except
//      promises, which are never bumped: a callback the student asked for
//      makes the day seventy-one, not a different seventy. A book that cannot
//      fill seventy reports short; it is never padded and never capped early.
//   5. Channel is decided here too: rotation is messaged (every
//      ROTATION_CALL_EVERY-th card is a call) and everything else, attention
//      included since 15 Sep 2026, is a call.
//
// What this module never does: invent a candidate. Every card it returns was
// classified by the queue with a true printed reason. A day can still be
// short — a book where everyone was touched this week yields an empty
// rotation pool and a short day, and that is information, not a bug.

export type Channel = 'call' | 'message';

export type DaySection = 'promises' | 'money' | 'buddy' | 'new' | 'attention' | 'retention' | 'rotation';

export const SECTION_ORDER: readonly DaySection[] = ['promises', 'money', 'buddy', 'new', 'attention', 'retention', 'rotation'];

export const SECTION_LABEL: Record<DaySection, string> = {
  promises: 'Promises due',
  money: 'Started paying',
  buddy: 'Buddy interest',
  new: 'New arrivals',
  attention: 'Opened, did not study',
  retention: 'Slipping',
  rotation: 'Rotation',
};

// ── THE FIVE AT THE TOP ─────────────────────────────────────────────────────
//
// Founder's call, 15 Sep 2026. Fourteen days measured: 273 never-contacted
// cards were DEALT across both books and 66 were worked, while promise cards
// ran at 74-91%. The cold lane was never short of cards — it was short of
// hours, because promises sort first, get worked first, and the day ends.
//
// So a small fixed number of never-contacted students is lifted above the
// promises, and given the CHANNEL the lane's own action implies: an
// introduction is a call, not a template. Everything else keeps the queue's
// rank order exactly — this is one deliberate, bounded exception to "filter,
// never re-sort", not a new priority scheme.
//
// Nothing is dropped and no promise is removed: the five move UP, the rest
// shift down by five, and the same cards are in the day. A promised callback
// lands five cards later than it would have, which is minutes.
export function pinFreshToFront<T extends { dueReason: DueReason; channel: Channel }>(
  queue: T[], n: number = FRESH_PIN_PER_DAY,
): T[] {
  if (n <= 0 || queue.length === 0) return queue;
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const c of queue) {
    // Only never-contacted. `rotation` is someone we HAVE spoken to before and
    // is a different promise to the student.
    if (c.dueReason === 'fresh' && pinned.length < n) {
      // An introduction is a conversation. A pinned card that arrives as a
      // template defeats the point of pinning it.
      pinned.push({ ...c, channel: 'call' });
      continue;
    }
    rest.push(c);
  }
  return [...pinned, ...rest];
}

export const SECTION_OF: Record<DueReason, DaySection> = {
  callback: 'promises', retry: 'promises', followup: 'promises',
  checkout_abandoned: 'money',
  conversion: 'buddy',
  new_never_logged: 'new',
  attention: 'attention',
  // `restart` is a retention lane and rides the retention section: it is a
  // CALL (only attention and rotation are messaged) and it takes no ceiling
  // of its own, because its whole population is 103 students and a lane that
  // cannot spike does not need a cap.
  going_cold: 'retention', broken_streak: 'retention', restart: 'retention',
  fresh: 'rotation', rotation: 'rotation',
};

/**
 * Lanes that are never trimmed or bumped: a promise a STUDENT extracted from
 * us, or money on the table.
 *
 * `retry` used to sit here and does not any more (9 Sep 2026). A callback is a
 * promise — the student named a time and we agreed. A retry is our own policy
 * for someone who did not pick up, and treating it as a promise let the
 * no-answer pile own whole days: 83 retries in a 116-card day nobody could
 * finish. It is still a strong signal; it is just not a commitment, so it
 * takes a ceiling like every other signal lane.
 */
const UNTRIMMABLE: ReadonlySet<DueReason> = new Set<DueReason>(['callback', 'followup', 'checkout_abandoned']);

const CEILING: Partial<Record<DueReason, number>> = {
  attention: ATTENTION_CEILING,
  new_never_logged: NEW_ARRIVAL_CEILING,
  // Incident #71: uncapped, this lane took two thirds of a day and starved
  // rotation completely. Recency in classifyLane is the real fix; the ceiling
  // is the fuse, so no single lane can ever own the day again.
  conversion: CONVERSION_CEILING,
  // A re-dial to someone who did not answer. Capped so the no-answer backlog
  // can never own a day again; the overflow waits for tomorrow, and six
  // no-answers still retires a student for good.
  retry: RETRY_CEILING,
};

/** The most recent DAY_ANCHOR_HOUR_IST o'clock IST at or before `nowMs`. */
export function dayAnchorMs(nowMs: number): number {
  const IST = 5.5 * 3600_000;
  const ist = new Date(nowMs + IST);
  ist.setUTCHours(DAY_ANCHOR_HOUR_IST, 0, 0, 0);
  let anchor = ist.getTime() - IST;
  if (anchor > nowMs) anchor -= 86_400_000;
  return anchor;
}

/**
 * The IST hour of `now`, 0–23. `en-GB` renders midnight as "24", so the
 * modulo is not decoration — without it a day closes an hour into tomorrow
 * (Incident #68). One definition, so there is one place to get it right.
 */
export function istHour(now: Date): number {
  return Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })) % 24;
}

export interface DayCounts { given: Record<DaySection, number>; heldBack: number; rotationPool: number }

/**
 * What has already happened today, so a rebuild does not deal a second day.
 *
 * THE DEFECT THIS CLOSES (found in production 3 Sep 2026, hours after the
 * 50–70 day shipped). The queue is stateless and rebuilt on every page load.
 * A worked card leaves it, rotation backfilled to the floor, and the counsellor
 * was handed fresh students — so each seat was offered NINETY-SEVEN cards in
 * one day against a ceiling of seventy, and the list could never be finished:
 * work ten, get ten more. That is also quota-driven replenishment, which the
 * founder ruled out on 30 Aug ("working 5 does not summon 5").
 *
 * So the day is a FIXED SET. Cards already dealt today stay dealt; rotation
 * may only top up to the day's rotation target, counting what it already
 * spent. Signals are the deliberate exception — a promise coming due, an
 * abandoned checkout or a buddy tap at 6pm is genuinely new work and must
 * appear, which is exactly the signal-driven replenishment the 30 Aug ruling
 * asked for.
 */
export interface DayContext {
  /** Students dealt today and still unmarked. They ARE today's list. */
  openToday?: ReadonlySet<string>;
  /**
   * THE DAY'S LEDGER: how many cards each LANE has already been dealt today,
   * in EVERY state — worked, skipped, still open. A ceiling that is measured
   * against anything else is not a ceiling (Incident #72).
   *
   * Keyed by lane, not by section, because ceilings are per lane and a section
   * can hold several: `promises` carries callback, retry and followup, and
   * capping retries must not cap the callbacks sitting beside them (9 Sep).
   */
  usedToday?: Partial<Record<DueReason, number>>;
  /**
   * Total cards dealt today, when the caller knows it independently. The
   * sections above are summed for the day's ceiling, so a row whose lane the
   * code no longer recognises — a rename landing mid-day — would vanish from
   * the ledger and quietly hand back a full allowance. The larger of the two
   * wins, because a card that was dealt occupies the day whatever it is called.
   */
  dealtToday?: number;
  /**
   * The counsellor's shift is over and the day has been closed. Carried cards
   * stay visible so a late marking still lands; nothing NEW is dealt into a
   * day nobody is working (Incident #72).
   */
  shiftOver?: boolean;
}

export interface AssembledDay<T> {
  queue: (T & { channel: Channel; section: DaySection })[];
  counts: DayCounts;
  band: { floor: number; ceiling: number };
}

const emptyCounts = (): Record<DaySection, number> =>
  ({ promises: 0, money: 0, buddy: 0, new: 0, attention: 0, retention: 0, rotation: 0 });

/**
 * Deal the day. `cands` must already be ranked, most urgent first; the
 * rotation pool must already be ordered never-contacted first, then longest
 * silent. Both orders come from the queue's sort and are not re-derived here.
 */
export function assembleDay<T extends { studentId: string; dueReason: DueReason }>(
  cands: readonly T[],
  ctx: DayContext = {},
): AssembledDay<T> {
  const openToday = ctx.openToday ?? new Set<string>();
  const used = ctx.usedToday ?? {};
  const usedLane = (l: DueReason): number => used[l] ?? 0;
  const ledgered = Object.values(used).reduce<number>((n, v) => n + (v ?? 0), 0);
  const usedTotal = Math.max(ledgered, ctx.dealtToday ?? 0);
  const usedRotation = usedLane('fresh') + usedLane('rotation');
  const usedSignals = usedTotal - usedRotation;
  const shiftOver = ctx.shiftOver ?? false;

  // Three piles. CARRIED cards were dealt earlier today and are already in the
  // ledger, so they pass through every gate — they are today's list and no
  // rebuild may take them away. Only NEW cards spend the day's allowance.
  const carried: T[] = [];
  const newSignals: T[] = [];
  const newRotation: T[] = [];
  const heldBack: T[] = [];
  const admitted = new Map<DueReason, number>();

  for (const c of cands) {
    const section = SECTION_OF[c.dueReason];
    if (openToday.has(c.studentId)) { carried.push(c); continue; }
    if (shiftOver) continue; // the day is over; they are tomorrow's, not today's held-back
    if (section === 'rotation') { newRotation.push(c); continue; }
    const cap = CEILING[c.dueReason];
    if (cap != null && usedLane(c.dueReason) + (admitted.get(c.dueReason) ?? 0) >= cap) { heldBack.push(c); continue; }
    admitted.set(c.dueReason, (admitted.get(c.dueReason) ?? 0) + 1);
    newSignals.push(c);
  }

  // Over the ceiling on signals alone: trim from the bottom, never a promise
  // or a money card. Only NEW cards can be trimmed — a card already dealt
  // today cannot be un-dealt. Trimmed cards are held back, ahead of the lane
  // overflow, because they outranked it.
  const trimmed: T[] = [];
  while (usedTotal + newSignals.length > DAY_CEILING) {
    let idx = -1;
    for (let i = newSignals.length - 1; i >= 0; i--) {
      if (!UNTRIMMABLE.has(newSignals[i].dueReason)) { idx = i; break; }
    }
    if (idx === -1) break;
    trimmed.unshift(newSignals.splice(idx, 1)[0]);
  }
  const held = [...trimmed, ...heldBack];

  // ── ROTATION FILLS TO THE CEILING, NOT THE FLOOR (founder, 15 Sep 2026) ──
  //
  // This line read `DAY_FLOOR - signalsToday` until tonight, and that one word
  // decided two things nobody chose.
  //
  // FIRST, the deck a counsellor opens in the morning was always exactly
  // DAY_FLOOR. Not "usually around fifty" — the first build of Anshul's day
  // was 50 cards on 10, 11, 13, 14, 15 and 16 Sep, and 53 on the 12th. Days
  // later ENDED at 59-73, but only because signals arriving through the day
  // were added on top; they were never bound by this target. The rep's
  // morning was fifty cards, every morning.
  //
  // SECOND, and worse, the never-contacted share was frozen at whatever
  // signals happened to exist at the moment the page was FIRST opened —
  // because `usedRotation` has already spent the target by then and rotation
  // never tops up again. Same rep, same book, same week:
  //
  //   15 Sep, first opened 06:50, few signals yet  -> 47 fresh cards
  //   16 Sep, first opened 00:07, retry lane full  -> 27 fresh cards
  //   12 Sep, first opened 02:16, signals waiting  -> 15 fresh cards
  //
  // Fifteen to forty-nine never-contacted students a day, decided by the CLOCK
  // TIME AT WHICH SOMEBODY HAPPENED TO LOAD THE PAGE, while 319 of them sat in
  // that book with phone numbers. No one would have chosen that, and nothing
  // surfaced it.
  //
  // "50-70" (2 Sep) was a BAND, and building to the bottom of a band is not a
  // range, it is a cap wearing a range's clothes. The cost is measurable: on
  // 14 Sep Anshul WORKED 65 cards against a morning deck of 50.
  //
  // Against DAY_CEILING both go away: the first build is seventy, and the
  // never-contacted share is the whole remaining room whenever the page is
  // opened.
  //
  // Founder tonight: "I want ki dono reps ko daily 70 relevant students milne
  // chahiye... naye students ko bhi daily add karte jao jinko touch hi nahi
  // kiya, unki quantity bhi badhate jao."
  //
  // DAY_CEILING is unchanged and still binding — `room` below caps this at the
  // same 70 it always did. What changed is that a day no longer STOPS at 50
  // when the book has more to give. A book that cannot supply seventy still
  // reports short (SALES-OS §5); it is simply no longer made short on purpose.
  const signalsToday = usedSignals + newSignals.length;
  const room = DAY_CEILING - usedTotal - newSignals.length;
  const target = Math.max(ROTATION_FLOOR, DAY_CEILING - signalsToday);
  const rotation = newRotation.slice(0, Math.max(0, Math.min(room, target - usedRotation)));

  // Short day and real signals held back? Use them before ending short — but
  // "short" is measured on the whole day, not on what is left on screen.
  const keep = new Set<string>();
  for (const c of carried) keep.add(c.studentId);
  for (const c of newSignals) keep.add(c.studentId);
  for (const c of rotation) keep.add(c.studentId);
  let dealtToday = usedTotal + newSignals.length + rotation.length;
  let backfilled = 0;
  if (!shiftOver) {
    for (const h of held) {
      if (dealtToday >= DAY_FLOOR) break;
      if (keep.has(h.studentId)) continue;
      keep.add(h.studentId);
      dealtToday++; backfilled++;
    }
  }

  // Rank order is the queue's, not ours: filter, never re-sort.
  const day = cands.filter((c) => keep.has(c.studentId));

  const counts = emptyCounts();
  let rotationIndex = 0;
  const queue = day.map((c) => {
    const section = SECTION_OF[c.dueReason];
    counts[section]++;
    // ── ATTENTION IS A CALL NOW (founder, 15 Sep 2026) ───────────────────
    //
    // It was a message from 2 Sep: "what got in the way?" is a question, and a
    // question is cheap to send. But the student it goes to opened the app and
    // stopped short of studying — often having recorded, in their own words,
    // that they could not — and a template is the wrong instrument for the one
    // moment they told us something. Founder: "un sabhi students ko jaldi se
    // jaldi call karna hai."
    //
    // The price is paid in ATTENTION_CEILING, halved to 10 in the same breath,
    // because a call costs what a template does not and this lane must not
    // take the day from `restart`. Rotation stays messaged: there the volume
    // IS the point.
    let channel: Channel = 'call';
    if (section === 'rotation') {
      channel = rotationIndex % ROTATION_CALL_EVERY === 0 ? 'call' : 'message';
      rotationIndex++;
    }
    return { ...c, channel, section };
  });

  return {
    // The one deliberate re-order, applied last so counts and channels are
    // decided on the queue's own ranking and only the ORDER changes.
    queue: pinFreshToFront(queue),
    counts: { given: counts, heldBack: held.length - backfilled, rotationPool: newRotation.length + carried.filter((c) => SECTION_OF[c.dueReason] === 'rotation').length },
    band: { floor: DAY_FLOOR, ceiling: DAY_CEILING },
  };
}
