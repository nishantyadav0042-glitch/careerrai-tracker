import type { Exception } from '@/lib/os/exception';
import { fetchAll } from '@/lib/supabase/fetch-all';

// ── THE HALF OF THE BOOK NOBODY REACHES ─────────────────────────────────────
//
// Founder, 15 Sep 2026: "I want to work on 1200 students and want to test our
// idea — let's focus on getting maximum conversion from these 1200."
//
// Measured that day, against the two live books:
//
//   rep      book    never dealt a single card
//   Neelam    583      333
//   Anshul    555      277
//
// 609 of 1,138. More than half the base has never once appeared on a
// counsellor's screen — not skipped, not refused, never dealt. And it is not
// spread evenly. Never-contacted cards actually dealt, per day:
//
//   06 Sep  Anshul 14   Neelam 0
//   07 Sep  Anshul 15   Neelam 0
//   08 Sep  Anshul 25   Neelam 0
//   09 Sep  Anshul 15   Neelam 0
//   10 Sep  Anshul 21   Neelam 0
//   11 Sep  Anshul 17   Neelam 0
//   15 Sep  Anshul 47   Neelam 8      (12-14 Sep: approved leave)
//
// ══ WHY, AND WHY IT IS NOT A PERSON'S FAULT ═════════════════════════════════
//
// On 15 Sep Neelam's 73 cards were: callback 35, retry 20, attention 6,
// new_never_logged 3, going_cold 1 — and fresh 8. Anshul's 70 were fresh 47,
// callback 11, retry 7.
//
// A callback is a promise a STUDENT extracted from us, and the founder's rule
// of 2 Sep makes promises untouchable — they are never trimmed, never bumped.
// That rule is right and this module does not question it. But its arithmetic
// has a consequence nobody chose: a counsellor who books many callbacks fills
// tomorrow with them, and the students nobody has EVER called are the only
// lane with no claim on the day. They lose every tie, forever, and the more
// promises a counsellor makes the more completely they lose.
//
// assembleDay reads `Math.max(ROTATION_FLOOR, DAY_FLOOR - signalsToday)` and
// then `Math.min(room, …)`. ROTATION_FLOOR is written as a floor — "so the
// silent book always moves" — but the untrimmable lanes are counted first, so
// `room` can crush it to nothing. Nine days of zeros is what a floor that is
// not a floor looks like from the outside.
//
// ══ WHY THIS IS AN EXCEPTION AND NOT A FIX TO THE DEAL ══════════════════════
//
// The obvious patch — force N never-contacted cards into every day — is wrong,
// and the data says so. Neelam already had 30 promised callbacks she had not
// kept. Her day is not underfull; it is overfull of commitments she made.
// Jamming more cards in would break SALES-OS §5 ("a day the book cannot fill
// is reported short, never padded") and would trade a kept promise for a cold
// call, which is a worse trade for the student on the other end.
//
// What is actually broken is that NOBODY KNEW. Whether the answer is fewer
// callbacks, a third seat, or splitting the book, that is the founder's call
// on his own capacity — and per SCALE-CONTRACT it reaches him as one Exception
// that drills into the exact students, never as a new dashboard.
//
// ══ WHAT THIS MUST NEVER BECOME ═════════════════════════════════════════════
//
// A stick to beat a counsellor with. SALES-OS §0: a P5 number may never be a
// performance judgement, a target, a quota, or an input to pay. Booking
// callbacks is the job — a counsellor doing it well produces this exception,
// which is exactly why the sentence below blames the arithmetic and names no
// fault. It is also why there is no ranking of the two reps against each
// other: the comparison above is evidence for the founder reading this file,
// not a scoreboard to ship.

/** Students never dealt a card before a book counts as starved. */
export const STARVED_MIN_UNREACHED = 50;

/**
 * Consecutive working days at zero before this is structural.
 *
 * Three, because one quiet day is a heavy promise load and two is a bad week;
 * three in a row means the lane cannot win, which is the thing worth saying.
 */
export const STARVED_MIN_ZERO_DAYS = 3;

export interface StarvationReading {
  repId: string;
  repName: string;
  bookSize: number;
  neverDealt: number;
  /** Consecutive most-recent days WITH CARDS DEALT that gave zero fresh. */
  zeroFreshDays: number;
  isStarved: boolean;
}

export interface RepDay {
  /** IST day, 'YYYY-MM-DD'. */
  day: string;
  /** Cards dealt that day, any lane. Days with none are not working days. */
  dealt: number;
  /** Cards dealt that day in the never-contacted lane. */
  fresh: number;
}

/**
 * Count back from the most recent working day.
 *
 * Days the counsellor was not dealt anything are SKIPPED, not counted as
 * zeros. Neelam was on approved leave 12-14 Sep; counting leave as starvation
 * would have made a holiday look like a fault, and the exception would have
 * been wrong about a real person on the day the founder read it.
 */
export function zeroFreshStreak(days: RepDay[]): number {
  const working = [...days]
    .filter((d) => d.dealt > 0)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  let streak = 0;
  for (const d of working) {
    if (d.fresh > 0) break;
    streak += 1;
  }
  return streak;
}

export function readStarvation(args: {
  repId: string; repName: string; bookSize: number; neverDealt: number; days: RepDay[];
}): StarvationReading {
  const zeroFreshDays = zeroFreshStreak(args.days);
  return {
    repId: args.repId,
    repName: args.repName,
    bookSize: args.bookSize,
    neverDealt: args.neverDealt,
    zeroFreshDays,
    // Both, never either. A big pile that IS moving is a book being worked
    // through, and a quiet day on a small pile is an ordinary Tuesday.
    isStarved: args.neverDealt >= STARVED_MIN_UNREACHED
      && zeroFreshDays >= STARVED_MIN_ZERO_DAYS,
  };
}

/** The sentence the founder reads. Blames the arithmetic, names no fault. */
export function starvationReason(r: StarvationReading): string {
  return `${r.neverDealt} of the ${r.bookSize} students in ${r.repName}'s book have never been `
    + `dealt a single card, and the deck has given them zero for ${r.zeroFreshDays} working days running. `
    + `Promises and retries are untrimmable and are counted first, so on a full day the `
    + `never-contacted lane is the only one that can lose — and it loses every time. `
    + `This is the arithmetic of the day, not anyone's effort.`;
}

/**
 * Severity 'high', not 'critical': no student is in a broken state and no
 * money is stuck. But over half the base the founder wants to convert has
 * never been reached once, and he cannot decide anything about it while the
 * number is invisible.
 */
export function starvationException(r: StarvationReading, detectedAtMs: number): Exception {
  const day = new Date(detectedAtMs + 5.5 * 3600_000).toISOString().slice(0, 10);
  return {
    id: `book-starvation:${r.repId}:${day}`,
    code: 'book_never_reached',
    domain: 'system',
    entity: { kind: 'sales_rep', id: r.repId, label: r.repName },
    severity: 'high',
    reason: starvationReason(r),
    detectedAtMs,
    evidence: {
      book_size: r.bookSize,
      never_dealt_a_card: r.neverDealt,
      zero_fresh_working_days: r.zeroFreshDays,
      min_unreached: STARVED_MIN_UNREACHED,
      min_zero_days: STARVED_MIN_ZERO_DAYS,
    },
    // Deliberately a decision, not a correction. Forcing cards into a day that
    // is already overfull of kept-or-broken promises is the wrong fix, and
    // this must not suggest it.
    suggestedAction: {
      label: `Decide what gives — ${r.repName}'s day is full before the new students are reached`,
      route: `/admin/sales-performance?rep=${r.repId}`,
    },
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: `/admin/sales-performance?rep=${r.repId}`,
    lifecycle: 'detected',
  };
}

type Admin = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Read both books and ask whether the new students are being reached.
 *
 * Both reads are paged (Incident #65): `lead_outreach` and `sales_opportunity`
 * are population-scaled and already past a thousand rows, and an unbounded
 * read here would silently under-count the exact number this exists to report.
 *
 * A failed read returns NOTHING. An exception invented out of a bad database
 * moment would send a founder into a conversation about a problem that is not
 * there.
 */
export async function findStarvedBooks(
  admin: Admin, nowMs: number, lookbackDays = 14,
): Promise<Exception[]> {
  const { data: seats, error: seatErr } = await admin
    .from('sales_rep_config').select('rep_id').eq('active', true);
  if (seatErr || !seats?.length) return [];
  const repIds = (seats as Array<{ rep_id: string }>).map((s) => s.rep_id);

  const { data: people } = await admin.from('profiles').select('id, full_name').in('id', repIds);
  const nameOf = new Map(((people ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => [p.id, p.full_name ?? 'Counsellor']));

  const { data: book, error: bookErr } = await fetchAll<{ student_id: string; owner_id: string }>(
    () => admin.from('lead_outreach').select('student_id, owner_id').in('owner_id', repIds),
    { orderBy: 'student_id' },
  );
  if (bookErr || !book) return [];

  const sinceDay = new Date(nowMs + 5.5 * 3600_000 - lookbackDays * 86_400_000)
    .toISOString().slice(0, 10);
  // Every card ever dealt tells us who has been reached; the recent window
  // tells us whether the lane is moving. One paged read serves both, so the
  // "never dealt" set cannot disagree with the daily counts.
  const { data: cards, error: cardErr } = await fetchAll<
    { student_id: string; rep_id: string; lane: string | null; ist_day: string }
  >(
    () => admin.from('sales_opportunity').select('student_id, rep_id, lane, ist_day').in('rep_id', repIds),
    { orderBy: 'id' },
  );
  if (cardErr || !cards) return [];

  const everDealt = new Set(cards.map((c) => c.student_id));

  const out: Exception[] = [];
  for (const repId of repIds) {
    const mine = book.filter((b) => b.owner_id === repId);
    if (mine.length === 0) continue;
    const neverDealt = mine.filter((b) => !everDealt.has(b.student_id)).length;

    const byDay = new Map<string, RepDay>();
    for (const c of cards) {
      if (c.rep_id !== repId || c.ist_day < sinceDay) continue;
      const d = byDay.get(c.ist_day) ?? { day: c.ist_day, dealt: 0, fresh: 0 };
      d.dealt += 1;
      if (c.lane === 'fresh') d.fresh += 1;
      byDay.set(c.ist_day, d);
    }

    const reading = readStarvation({
      repId, repName: nameOf.get(repId) ?? 'Counsellor',
      bookSize: mine.length, neverDealt, days: [...byDay.values()],
    });
    if (reading.isStarved) out.push(starvationException(reading, nowMs));
  }
  return out;
}
