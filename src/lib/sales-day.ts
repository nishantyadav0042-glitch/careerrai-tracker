import type { DueReason } from '@/lib/call-queue';
import {
  DAY_FLOOR, DAY_CEILING, ROTATION_FLOOR, ATTENTION_CEILING, NEW_ARRIVAL_CEILING,
  ROTATION_CALL_EVERY, DAY_ANCHOR_HOUR_IST, CONVERSION_CEILING,
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
//   4. The day is at least DAY_FLOOR when the book can supply it, and at most
//      DAY_CEILING — except promises, which are never bumped: a callback the
//      student asked for makes the day seventy-one, not a different seventy.
//   5. Channel is decided here too: attention and rotation are messages;
//      every ROTATION_CALL_EVERY-th rotation card is a call; everything else
//      is a call.
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

export const SECTION_OF: Record<DueReason, DaySection> = {
  callback: 'promises', retry: 'promises', followup: 'promises',
  checkout_abandoned: 'money',
  conversion: 'buddy',
  new_never_logged: 'new',
  attention: 'attention',
  going_cold: 'retention', broken_streak: 'retention',
  fresh: 'rotation', rotation: 'rotation',
};

/** Lanes that are never trimmed or bumped: a promise made, or money on the table. */
const UNTRIMMABLE: ReadonlySet<DueReason> = new Set<DueReason>(['callback', 'retry', 'followup', 'checkout_abandoned']);

const CEILING: Partial<Record<DueReason, number>> = {
  attention: ATTENTION_CEILING,
  new_never_logged: NEW_ARRIVAL_CEILING,
  // Incident #71: uncapped, this lane took two thirds of a day and starved
  // rotation completely. Recency in classifyLane is the real fix; the ceiling
  // is the fuse, so no single lane can ever own the day again.
  conversion: CONVERSION_CEILING,
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
   * THE DAY'S LEDGER: how many cards each section has already been dealt
   * today, in EVERY state — worked, skipped, still open. A ceiling that is
   * measured against anything else is not a ceiling (Incident #72).
   */
  usedToday?: Partial<Record<DaySection, number>>;
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
  const usedIn = (s: DaySection): number => used[s] ?? 0;
  const ledgered = SECTION_ORDER.reduce((n, s) => n + usedIn(s), 0);
  const usedTotal = Math.max(ledgered, ctx.dealtToday ?? 0);
  const usedSignals = usedTotal - usedIn('rotation');
  const shiftOver = ctx.shiftOver ?? false;

  // Three piles. CARRIED cards were dealt earlier today and are already in the
  // ledger, so they pass through every gate — they are today's list and no
  // rebuild may take them away. Only NEW cards spend the day's allowance.
  const carried: T[] = [];
  const newSignals: T[] = [];
  const newRotation: T[] = [];
  const heldBack: T[] = [];
  const admitted = new Map<DaySection, number>();

  for (const c of cands) {
    const section = SECTION_OF[c.dueReason];
    if (openToday.has(c.studentId)) { carried.push(c); continue; }
    if (shiftOver) continue; // the day is over; they are tomorrow's, not today's held-back
    if (section === 'rotation') { newRotation.push(c); continue; }
    const cap = CEILING[c.dueReason];
    if (cap != null && usedIn(section) + (admitted.get(section) ?? 0) >= cap) { heldBack.push(c); continue; }
    admitted.set(section, (admitted.get(section) ?? 0) + 1);
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

  // Rotation: what is left of the DAY up to the ceiling, never below the
  // floor while the pool can supply it, minus what the day already spent.
  const signalsToday = usedSignals + newSignals.length;
  const room = DAY_CEILING - usedTotal - newSignals.length;
  const target = Math.max(ROTATION_FLOOR, DAY_FLOOR - signalsToday);
  const rotation = newRotation.slice(0, Math.max(0, Math.min(room, target - usedIn('rotation'))));

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
    let channel: Channel = 'call';
    if (section === 'attention') channel = 'message';
    else if (section === 'rotation') {
      channel = rotationIndex % ROTATION_CALL_EVERY === 0 ? 'call' : 'message';
      rotationIndex++;
    }
    return { ...c, channel, section };
  });

  return {
    queue,
    counts: { given: counts, heldBack: held.length - backfilled, rotationPool: newRotation.length + carried.filter((c) => SECTION_OF[c.dueReason] === 'rotation').length },
    band: { floor: DAY_FLOOR, ceiling: DAY_CEILING },
  };
}
