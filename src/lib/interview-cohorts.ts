// ── THE INTERVIEW CUT: who to talk to, and nothing else ─────────────────────
//
// The research question is open and deliberately not a hypothesis:
//
//     What, if anything, causes a student to return to CareerRai after their
//     first meaningful use?
//
// 174 of 302 students in the frozen cohort logged once and never again. The
// existing Student Outreach board cannot reach them: it lists students who
// logged in the last 21 days, which by construction is almost the opposite
// population. This module builds the two rosters the question needs.
//
// IT DRAFTS NOTHING AND SENDS NOTHING. Outreach composes WhatsApp messages;
// this does not, on purpose. A drafted message is a leading question with a
// send button attached, and the whole value of these interviews depends on the
// founder opening with "tell me what you remember" rather than anything that
// names a theory. There is no message here to accidentally send.
//
// WHY THE REPEATER SAMPLE IS MATCHED ON SIGNUP MONTH. Repeaters skew old: a
// student who joined in July has had longer to come back than one who joined
// in September, so an unmatched comparison would contrast "July repeaters"
// with "September one-and-dones" and recover the calendar rather than the
// behaviour. Matching within signup month removes the most obvious confound
// available to us. It does not make this an experiment, and nothing here
// should be quoted as a rate.

export interface CohortRow {
  studentId: string;
  name: string;
  phone: string | null;
  /** Account creation date, ISO. */
  joined: string;
  /** Distinct log dates, sorted ascending. */
  logDates: readonly string[];
}

export type Cohort = 'one_and_done' | 'repeater';

export interface CohortStudent {
  studentId: string;
  name: string;
  phone: string | null;
  joinedMonth: string;
  joined: string;
  firstLog: string;
  lastLog: string;
  logDays: number;
  /** Days between their first log and their last. 0 for one-and-done. */
  spanDays: number;
}

/** Days a student must have had to come back before we call them one-and-done. */
export const SETTLE_DAYS = 7;

const monthOf = (iso: string) => iso.slice(0, 7);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Split the population into the two rosters.
 *
 * A student whose first log is more recent than SETTLE_DAYS is excluded from
 * BOTH: they have not yet had the week in which returning was possible, so
 * calling them one-and-done would be recording our impatience as their
 * behaviour. Excluded rather than assigned — the honest third state.
 */
export function classifyCohorts(
  rows: readonly CohortRow[],
  opts: { asOf: string },
): { oneAndDone: CohortStudent[]; repeaters: CohortStudent[]; tooRecent: number } {
  const oneAndDone: CohortStudent[] = [];
  const repeaters: CohortStudent[] = [];
  let tooRecent = 0;

  for (const r of rows) {
    const days = [...new Set(r.logDates)].sort();
    if (days.length === 0) continue;
    const firstLog = days[0];
    if (daysBetween(firstLog, opts.asOf) < SETTLE_DAYS) { tooRecent += 1; continue; }

    const student: CohortStudent = {
      studentId: r.studentId,
      name: r.name,
      phone: r.phone,
      joined: r.joined,
      joinedMonth: monthOf(r.joined),
      firstLog,
      lastLog: days[days.length - 1],
      logDays: days.length,
      spanDays: daysBetween(firstLog, days[days.length - 1]),
    };
    (days.length === 1 ? oneAndDone : repeaters).push(student);
  }

  // Deterministic: the same roster every time the page is opened, so the
  // founder can work through it across several sittings without it reshuffling.
  const order = (a: CohortStudent, b: CohortStudent) =>
    a.joinedMonth.localeCompare(b.joinedMonth) || a.studentId.localeCompare(b.studentId);
  return { oneAndDone: oneAndDone.sort(order), repeaters: repeaters.sort(order), tooRecent };
}

/**
 * A repeater sample drawn to mirror the one-and-done roster's signup months.
 *
 * `target` is how many interviews are wanted in total (10 by default). Months
 * are filled in proportion to how many one-and-dones they contributed, so the
 * two conversations are with people who arrived at the same time.
 *
 * Reachability comes first WITHIN a month — an unreachable row is a name the
 * founder cannot call — but never across months, because preferring reachable
 * students globally would quietly re-sort the sample by whichever month
 * happened to collect more phone numbers.
 */
export function matchedRepeaterSample(
  oneAndDone: readonly CohortStudent[],
  repeaters: readonly CohortStudent[],
  target = 10,
): CohortStudent[] {
  if (oneAndDone.length === 0 || repeaters.length === 0) return [];

  const wanted = new Map<string, number>();
  for (const s of oneAndDone) wanted.set(s.joinedMonth, (wanted.get(s.joinedMonth) ?? 0) + 1);

  const byMonth = new Map<string, CohortStudent[]>();
  for (const r of repeaters) byMonth.set(r.joinedMonth, [...(byMonth.get(r.joinedMonth) ?? []), r]);
  for (const [, list] of byMonth) {
    list.sort((a, b) => Number(!!b.phone) - Number(!!a.phone) || a.studentId.localeCompare(b.studentId));
  }

  const total = oneAndDone.length;
  const out: CohortStudent[] = [];
  // Largest share first, so rounding favours the months that actually dominate
  // the population rather than whichever month sorts first alphabetically.
  const months = [...wanted.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [month, count] of months) {
    const quota = Math.max(1, Math.round((count / total) * target));
    for (const r of (byMonth.get(month) ?? []).slice(0, quota)) {
      if (out.length < target) out.push(r);
    }
  }
  // Short because some months have no repeaters at all — top up from the rest
  // rather than hand back a list smaller than asked for.
  if (out.length < target) {
    const used = new Set(out.map((s) => s.studentId));
    for (const r of repeaters) {
      if (out.length >= target) break;
      if (!used.has(r.studentId)) out.push(r);
    }
  }
  return out;
}
