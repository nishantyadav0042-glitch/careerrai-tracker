import { measure, type Measure, type Evidence } from '@/lib/student-success-mis';

// ── The tail the Constitution demands, and nothing measured ────────────────
//
// NOTIFICATION-OS §8 defines the full chain:
//
//   created → queued → sent → accepted → received → displayed → tapped
//           → opened → STUDY STARTED → STUDIED → RETURNED
//
// and says plainly: "The tail — study started / studied / returned — is the
// retention metric that matters more than delivery, joined from daily_reports."
//
// Nothing in the codebase joined those two tables. So the product measured
// every stage up to the tap and none of the stages that matter, which means
// §0's single KPI — "notifications that cause STUDYING" — and principle #22 —
// "success is a study caused, not a tap earned" — were unfalsifiable.
//
// This module closes that gap. It is OBSERVATION ONLY: it reads, it never
// sends, it never suppresses, and it holds no policy about what should be
// sent. It exists so the frequency question can be argued from evidence
// instead of from intuition — including mine, which was wrong: I read a
// median of 5 pushes/day as over-notification before reading that §5 sets the
// active-state budget at exactly 4 and the hard ceiling at 10.

export interface PushRow {
  userId: string;
  /** IST study day the push was accepted on. */
  day: string;
  clicked: boolean;
}

/** Distinct IST study days a student logged on. */
export type LogDaysByStudent = ReadonlyMap<string, ReadonlySet<string>>;

export interface TailPicture {
  pushes: number;
  studentsReached: number;
  /** Tapped. The Constitution calls a tap that changes nothing a vanity win. */
  tapped: Measure;
  /**
   * A push landed on a day the student went on to log. NOT "the push caused
   * the log" — most students who receive push also self-selected into
   * installing the app, which is exactly the population most likely to log.
   */
  loggedSameDay: Measure;
  /** Logged the next day — the return the loop is actually trying to buy. */
  loggedNextDay: Measure;
  /**
   * Student-days where we pushed and the student did not log either day.
   * The honest headline: attention spent with nothing observable after it.
   */
  noObservedStudy: number;
  evidence: Evidence;
  note: string;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure: push rows in, tail out. No database, no clock.
 *
 * Deliberately reports a RATE only through `measure`, the same choke point the
 * founder view uses, so a thin week cannot produce a confident-looking number.
 */
export function tailPicture(pushes: readonly PushRow[], logs: LogDaysByStudent): TailPicture {
  const n = pushes.length;
  let same = 0, next = 0, neither = 0, tapped = 0;

  for (const p of pushes) {
    if (p.clicked) tapped += 1;
    const days = logs.get(p.userId);
    const s = days?.has(p.day) ?? false;
    const x = days?.has(nextDay(p.day)) ?? false;
    if (s) same += 1;
    if (x) next += 1;
    if (!s && !x) neither += 1;
  }

  return {
    pushes: n,
    studentsReached: new Set(pushes.map((p) => p.userId)).size,
    tapped: measure('Pushes tapped', tapped, n),
    loggedSameDay: measure('Pushed, and logged that day', same, n),
    loggedNextDay: measure('Pushed, and logged the next day', next, n),
    noObservedStudy: neither,
    // Never FACT for the relationship — only the counts are facts.
    evidence: n === 0 ? 'UNKNOWN' : 'ASSOCIATED',
    note: n === 0
      ? 'No pushes were delivered in this window.'
      : 'Students who can receive push installed the app and granted permission — '
        + 'the population most likely to log anyway. These figures describe what '
        + 'happened after a push, not what the push caused.',
  };
}
