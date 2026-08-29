// ── HOW 965 STUDENTS BECOME TWO BOOKS ───────────────────────────────────────
//
// Founder requirement: not a random 50/50, and not "one counsellor gets the
// good half". The rule has to be sayable out loud to both of them, produce the
// same answer every time it runs, and never move a student who already has an
// owner.
//
// THE RULE, in one sentence a counsellor can repeat:
//
//   "You have every second student in each group, ordered by when they joined."
//
// Dealing WITHIN each group rather than across the whole base is the entire
// point. A single round-robin over 965 students sorted by signup date would
// hand whoever deals first a systematically different book — and with the
// high-intent group being only ~124 students in the whole base, a bad split
// there decides who looks like the better counsellor for the next two months.
// Lane-by-lane dealing makes that impossible: 16 abandoned checkouts split 8/8,
// 98 Buddy-CTA students split 49/49, 155 cold students split 78/77.
//
// WHY DETERMINISM MATTERS MORE THAN IT LOOKS. Six weeks from now the founder
// will compare two people's conversion rates and make a decision about money.
// That comparison is only honest if the books were comparable, and "comparable"
// has to be a property anyone can re-derive from the data rather than a claim
// I made once. Sorting by (created_at, id) gives a total order with no ties, so
// the deal is reproducible by hand if anyone ever disputes it.
//
// WHAT THIS MODULE IS NOT: the writer. It computes an allocation and nothing
// else. The write is `/api/admin/enrol-book`, whose ON CONFLICT DO NOTHING is
// what actually guarantees a re-run cannot move anybody — a property of the
// database, not of this function being called carefully.

/**
 * The opportunity groups students are dealt within.
 *
 * Ordered by commercial temperature deliberately: the deal walks them in this
 * order, so if the student count is odd the leftover students alternate seats
 * as it goes rather than all landing on the same one.
 */
export const DISTRIBUTION_LANES = [
  'checkout_abandoned',   // created an order, never paid — the hottest group
  'intent_door',          // came back to the paid surface a second time
  'buddy_cta',            // reached for the paid option once
  'logging_now',          // studying this week — retention worth protecting
  'active_not_logging',   // opens the app, never logs — the activation problem
  'slipping',             // quiet 8–30 days
  'cold',                 // quiet 30+ days, or never seen
  'uncontactable',        // no phone: owned, never dealt as a call
] as const;
export type DistributionLane = (typeof DISTRIBUTION_LANES)[number];

export interface DistributableStudent {
  id: string;
  /** ISO. The sort key, with `id` as the tie-break. */
  createdAt: string;
  hasPhone: boolean;
  hasPaid: boolean;
  hasAbandonedOrder: boolean;
  hitIntentDoor: boolean;
  buddyCtaClicks: number;
  /** Days since their last study log, or null if they have never logged. */
  daysSinceLastLog: number | null;
  /** Days since any app event, or null if we have never seen them. */
  daysSinceLastEvent: number | null;
}

/**
 * Which group a student is dealt in. Mutually exclusive, evaluated top-down.
 *
 * Returns null for students who are not enrolled at all — today that is
 * exactly one case, and it is deliberately narrow: a student who has PAID is a
 * customer, and a sales call to a paying student is a support failure rather
 * than a pitch. Everyone else gets an owner, including students we cannot
 * currently phone, because a student nobody owns is a student nobody will ever
 * fix the phone number for.
 */
export function classifyForDistribution(s: DistributableStudent): DistributionLane | null {
  if (s.hasPaid) return null;
  if (!s.hasPhone) return 'uncontactable';
  if (s.hasAbandonedOrder) return 'checkout_abandoned';
  if (s.hitIntentDoor) return 'intent_door';
  if (s.buddyCtaClicks > 0) return 'buddy_cta';
  if (s.daysSinceLastLog != null && s.daysSinceLastLog <= 7) return 'logging_now';
  if (s.daysSinceLastEvent != null && s.daysSinceLastEvent <= 7) return 'active_not_logging';
  if (s.daysSinceLastEvent != null && s.daysSinceLastEvent <= 30) return 'slipping';
  return 'cold';
}

export interface SeatAllocation {
  seatId: string;
  studentIds: string[];
  /** Per-lane counts, so the founder can see the split rather than trust it. */
  byLane: Record<DistributionLane, number>;
}

export interface DistributionPlan {
  seats: SeatAllocation[];
  /** Students deliberately not enrolled, with the reason. */
  excluded: { studentId: string; reason: 'already_paid' }[];
  /** Lane totals across the whole base — the founder's sanity check. */
  laneTotals: Record<DistributionLane, number>;
}

const emptyLaneCounts = (): Record<DistributionLane, number> =>
  Object.fromEntries(DISTRIBUTION_LANES.map((l) => [l, 0])) as Record<DistributionLane, number>;

/**
 * Deal every eligible student into the given seats, lane by lane.
 *
 * `seatIds` order decides who receives position 1 in each lane. It is the
 * caller's job to keep that order stable between runs — sorting by seat id at
 * the call site is enough, and it means the same population always produces the
 * same books no matter what order the database returned the seats in.
 *
 * THE DEAL POINTER IS PER-LANE, NOT GLOBAL, and continues across lanes. Within
 * `checkout_abandoned` the deal goes A, B, A, B…; the next lane resumes from
 * wherever the previous one ended rather than restarting at A. With eight lanes
 * of odd sizes a per-lane reset would hand seat A the extra student every
 * single time — eight lanes, eight extra students, all to the same person.
 */
export function planDistribution(
  students: readonly DistributableStudent[],
  seatIds: readonly string[],
): DistributionPlan {
  if (seatIds.length === 0) {
    return { seats: [], excluded: [], laneTotals: emptyLaneCounts() };
  }

  const seats: SeatAllocation[] = seatIds.map((seatId) => ({
    seatId, studentIds: [], byLane: emptyLaneCounts(),
  }));
  const excluded: DistributionPlan['excluded'] = [];
  const laneTotals = emptyLaneCounts();

  const byLane = new Map<DistributionLane, DistributableStudent[]>();
  for (const s of students) {
    const lane = classifyForDistribution(s);
    if (lane === null) { excluded.push({ studentId: s.id, reason: 'already_paid' }); continue; }
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane)!.push(s);
    laneTotals[lane]++;
  }

  let cursor = 0;
  for (const lane of DISTRIBUTION_LANES) {
    const inLane = byLane.get(lane) ?? [];
    // (createdAt, id) is a total order with no ties, so this deal is
    // reproducible by hand from the data if anyone ever disputes a book.
    inLane.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    for (const s of inLane) {
      const seat = seats[cursor % seats.length];
      seat.studentIds.push(s.id);
      seat.byLane[lane]++;
      cursor++;
    }
  }

  return { seats, excluded, laneTotals };
}

/**
 * The sentence the founder reads before committing the deal.
 *
 * Names the biggest imbalance rather than an average, because an average across
 * eight lanes hides the only split that actually matters — the hot one.
 */
export function describeFairness(plan: DistributionPlan): string {
  if (plan.seats.length < 2) return 'One seat — nothing to balance.';
  let worstLane: DistributionLane | null = null;
  let worstGap = 0;
  for (const lane of DISTRIBUTION_LANES) {
    const counts = plan.seats.map((s) => s.byLane[lane]);
    const gap = Math.max(...counts) - Math.min(...counts);
    if (gap > worstGap) { worstGap = gap; worstLane = lane; }
  }
  const sizes = plan.seats.map((s) => s.studentIds.length);
  const sizeGap = Math.max(...sizes) - Math.min(...sizes);
  return worstLane === null || worstGap === 0
    ? `Every group split evenly; books differ by ${sizeGap}.`
    : `Largest group imbalance: ${worstGap} student${worstGap === 1 ? '' : 's'} in ${worstLane}. Books differ by ${sizeGap}.`;
}
