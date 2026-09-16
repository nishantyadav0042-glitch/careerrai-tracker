// ── ONE STUDENT, ONE DECK (founder, 16 Sep 2026: "zero mixup between reps") ──
//
// `canAccessLead` returns TRUE for an unclaimed lead, on purpose — the SA-1D
// shared book exists so a rep can pick up a student nobody owns rather than
// leave them unreachable. That is right for AUTHORIZATION and wrong for
// DEALING: a shared lead is dealt into every rep's deck at once.
//
// It happened, and it is measured. Students dealt to BOTH reps on the SAME
// IST day, September:
//
//   2 Sep  34    ·  4 Sep  8   ·  6 Sep  1
//   3 Sep   4    ·  5 Sep 39   ·  7 Sep  6
//
// 86 students in all, of whom **zero were worked by both** — so no student was
// called twice and no trust was spent. What was spent is slots: the same
// student took a place in two seventy-card days.
//
// It has not recurred since 7 Sep, because lead intake now assigns everyone it
// can and the 75 students still unowned are almost all unreachable anyway (72
// have no phone, so they are never dealt at all and surface as a data-quality
// exception instead). The hole did not close — the thing falling through it
// ran out.
//
// This closes the hole itself. An unclaimed student is dealt to exactly ONE
// rep, chosen by a stable hash of their id across the active seats: every rep's
// page computes the same answer, with no write, no lock and no coordination,
// so two decks built a second apart cannot disagree. Authorization is
// untouched — if a rep opens that student they may still claim them, which is
// what the shared book is for.

/**
 * FNV-1a, 32-bit. Chosen because it is stable across processes and deploys —
 * a hash that changed between two page loads would move a student from one
 * deck to the other mid-day, which is the bug this exists to prevent.
 */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Which rep an UNCLAIMED student belongs to today.
 *
 * Returns null when there are no seats to deal to — the caller then deals the
 * student to nobody rather than to everybody, which is the safer direction:
 * an unowned student is a data-quality exception with a founder alert behind
 * it, not a card to duplicate.
 *
 * `repIds` is sorted here so the answer cannot depend on the order the caller
 * happened to read the seats in.
 */
export function unclaimedDealtTo(studentId: string, repIds: readonly string[]): string | null {
  const seats = [...new Set(repIds.filter(Boolean))].sort();
  if (seats.length === 0) return null;
  return seats[hash32(studentId) % seats.length];
}

/** Does THIS viewer get the unclaimed student in their deck today? */
export function dealsUnclaimedTo(
  studentId: string, viewerId: string, repIds: readonly string[],
): boolean {
  return unclaimedDealtTo(studentId, repIds) === viewerId;
}
