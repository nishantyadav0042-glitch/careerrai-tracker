import type { Exception } from '@/lib/os/exception';

// ── A BOOK OUTLIVES THE PERSON HOLDING IT ───────────────────────────────────
//
// Founder question, 29 Aug 2026, and the one that produced this module: if
// Anshul stops turning up tomorrow and someone else takes his seat, what
// happens to his students? They must move across on their own, without a
// choke point, and a backup must exist.
//
// Before this, the answer was: nothing happens automatically, and two schema
// facts made it worse rather than merely absent. Verified in production the
// day this was written:
//
//   lead_outreach.owner_id  → profiles(id) ON DELETE SET NULL
//   sales_followup.owner_id → profiles(id) ON DELETE RESTRICT
//
// The SAME event — the departing rep's profile is removed — has two opposite
// outcomes one table apart. The students silently become unowned with nobody
// told; the promises made to those students block the delete. So a founder
// removing a rep either gets an unexplained Postgres error, or gets no error
// and an invisible orphaning of an entire book. Neither is a handover.
//
// THE SHAPE OF THE FIX, and why it is not a seat-id column.
//
// The founder approved "seat-based ownership" as the architecture and, in the
// same message, refused a large refactor before the two counsellors are
// working. Those pull in opposite directions if a seat becomes a new foreign
// key: `owner_id` is read at 42 sites across 15 files, and re-pointing all of
// them is precisely the refactor he ruled out.
//
// So the SEAT is kept as what it already is — a row in sales_rep_config, capped
// at two by 20260829b — and succession is made a property of the TRANSFER
// rather than of the schema: one transaction that moves every owned lead and
// every open promise together, records who moved what and why, and cannot
// half-happen. That buys the founder's actual requirement (one action moves the
// whole book, nothing is stranded, history survives) at the cost of one indexed
// UPDATE instead of zero. On today's book that is milliseconds; the note in
// transfer_sales_book() says what to revisit if a seat ever holds six figures.
//
// WHAT THIS MODULE IS NOT: the mover. Every function here is pure — it decides
// whether a transfer may proceed and how to describe the damage when ownership
// has already gone wrong. The move itself is one SQL function, because a
// half-moved book is the exact failure this exists to prevent and only the
// database can refuse it.

/** A candidate for either side of a transfer, as the capacity screen knows them. */
export interface SeatHolder {
  repId: string;
  name: string;
  /** Has a sales_rep_config row at all. NOT the same as active. */
  configured: boolean;
  /** The seat is switched on. An inactive seat is a real seat, just not working. */
  active: boolean;
}

export type TransferRefusal =
  | 'SAME_REP'
  | 'FROM_UNKNOWN'
  | 'TO_UNKNOWN'
  | 'TO_UNCONFIGURED'
  | 'TO_INACTIVE'
  | 'EMPTY_BOOK';

export type TransferCheck =
  | { ok: true; from: SeatHolder; to: SeatHolder; bookSize: number }
  | { ok: false; reason: TransferRefusal; error: string };

/**
 * May this book move?
 *
 * Deliberately permissive about the SOURCE and strict about the DESTINATION.
 * The whole point of a succession tool is that it still works after the source
 * rep has been switched off, put on leave, or has stopped existing as a working
 * seat — refusing to hand over an inactive rep's book would make the tool
 * useless on the only day it is needed. The destination is the opposite: a book
 * handed to a seat that cannot work it has not been rescued, it has been moved
 * somewhere quieter.
 *
 * `bookSize` is passed in rather than counted here so this stays pure and the
 * caller's count and the mover's count come from the same read.
 */
export function checkBookTransfer(
  from: SeatHolder | null,
  to: SeatHolder | null,
  bookSize: number,
): TransferCheck {
  if (!from) {
    return { ok: false, reason: 'FROM_UNKNOWN', error: 'The rep whose book you are moving is not a CareerRai staff account.' };
  }
  if (!to) {
    return { ok: false, reason: 'TO_UNKNOWN', error: 'The rep you are moving the book to is not a CareerRai staff account.' };
  }
  if (from.repId === to.repId) {
    return { ok: false, reason: 'SAME_REP', error: 'That is the same person on both sides — nothing would move.' };
  }
  if (!to.configured) {
    return {
      ok: false, reason: 'TO_UNCONFIGURED',
      error: `${to.name} has no capacity row, so they have no stated working hours, ceiling or pay. Configure the seat on the capacity screen before giving them a book.`,
    };
  }
  if (!to.active) {
    return {
      ok: false, reason: 'TO_INACTIVE',
      error: `${to.name}'s seat is switched off. Activate it first — a book moved to an inactive seat disappears from every queue instead of being worked.`,
    };
  }
  if (bookSize <= 0) {
    return { ok: false, reason: 'EMPTY_BOOK', error: `${from.name} owns no students, so there is no book to transfer.` };
  }
  return { ok: true, from, to, bookSize };
}

/**
 * How a transfer is described once it has happened.
 *
 * Separate counts, never one "moved" number, because the two halves fail
 * independently and the difference is the thing worth seeing: leads without
 * promises is a cold book, promises without leads means something upstream is
 * writing follow-ups against students nobody owns.
 */
export interface TransferResult {
  leadsMoved: number;
  followupsMoved: number;
  overdueInherited: number;
}

/**
 * The sentence the founder reads after a handover.
 *
 * Names the inherited overdue promises explicitly rather than folding them into
 * the totals: they are the part of a handover that is already late, and the
 * receiving rep needs to know they exist on the first morning, not discover
 * them a week later.
 */
export function describeTransfer(from: SeatHolder, to: SeatHolder, r: TransferResult): string {
  const parts = [`${r.leadsMoved} student${r.leadsMoved === 1 ? '' : 's'} moved from ${from.name} to ${to.name}`];
  parts.push(r.followupsMoved === 0
    ? 'no open promises to carry over'
    : `${r.followupsMoved} open promise${r.followupsMoved === 1 ? '' : 's'} carried over`);
  if (r.overdueInherited > 0) {
    parts.push(`${r.overdueInherited} of them already overdue — those are ${to.name}'s first calls`);
  }
  return parts.join(', ') + '.';
}

// ── The unowned book is an exception, not a report ──────────────────────────
//
// SCALE-CONTRACT: an operational problem is one Exception primitive, not a new
// dashboard. A student who belongs to nobody is exactly that — nobody is going
// to call them, and today nothing anywhere says so.
//
// Severity is 'high', not 'critical'. Critical is reserved for a paid student
// blocked or money at risk; an unowned free student is a real leak and is not
// that. A PAYING student with no owner would be critical, and is computed
// separately by the caller that knows about payments — this function is given
// the split rather than guessing it, because guessing which unowned students
// pay is exactly the kind of invented fact L1 forbids.

export interface UnownedCounts {
  /** Students with a lead_outreach row whose owner_id is NULL. */
  unowned: number;
  /** Of those, how many have ever paid. Null when payment state was unreadable. */
  paying: number | null;
}

/**
 * The "students belong to nobody" exception, or null when everyone has an owner.
 *
 * `paying: null` is carried through to the evidence as NOT INSTRUMENTED rather
 * than as 0 — an unreadable payment join must never render as "and none of them
 * pay", which is the reassuring version of a fact we do not have.
 */
export function unownedBookException(counts: UnownedCounts, nowMs: number): Exception | null {
  if (counts.unowned <= 0) return null;
  const paying = counts.paying;
  const severity = paying != null && paying > 0 ? 'critical' : 'high';
  const reason = paying == null
    ? `${counts.unowned} students have no sales owner — nobody will call them. Whether any of them pay could not be read.`
    : paying > 0
      ? `${counts.unowned} students have no sales owner, and ${paying} of them are paying customers.`
      : `${counts.unowned} students have no sales owner — nobody will call them.`;

  return {
    id: `unowned_book:${counts.unowned}:${paying ?? 'unknown'}`,
    code: 'unowned_book',
    domain: 'student',
    entity: { kind: 'sales_book', id: null, label: 'Students with no owner' },
    severity,
    reason,
    detectedAtMs: nowMs,
    evidence: {
      unowned_students: counts.unowned,
      paying_among_them: paying ?? 'NOT INSTRUMENTED',
    },
    suggestedAction: { label: 'Assign these students to a seat', route: '/admin/sales/capacity' },
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: '/admin/leads?owner=none',
    lifecycle: 'detected',
  };
}
