// ── Curriculum Selection System — shared logic ──────────────────────────────
//
// "Students create. Students vote. The system ranks." (founder, 25 Jul)
//
// Two contribution types only: a Tip (plain text, ≤150 chars) and a Question
// (a photo). Both flow: safety gate → voting pool (72h) → ranked by votes →
// featured one-per-day → archive. No comments, no chat, no feed, no visible
// vote counts (first votes herd later ones), no real names anywhere — a
// random first name is attached at submission, because the goal is helping
// students, not making one student a star.

export const VOTING_WINDOW_HOURS = 72;

// There is NO vote bar and NO minimum-votes floor — anywhere. Founder, 29 Jul
// ("don't set a bar; maximum votes gets the top position") and again 7 Aug,
// after the graduation bars — killed in the pick — were found still narrating
// the dashboard and still gating the recycle. Votes ORDER the queue; they
// never gate, judge, or drop anything. The only content gate in this system
// is the safety check at submission.
export const MAX_SUBMISSIONS_PER_DAY = 1; // BeReal rule: the limit creates quality

// Upload constraints — ONE declaration for the client picker and the server
// gate. When these lived on both sides separately, raising one limit and not
// the other meant either silent client rejections or long uploads that 400.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

// Tip length, for exactly the same reason: 150 was written out separately in
// the server validator, the textarea's slice() and the character counter, so
// changing the limit meant finding all three. Curated seed stock is held to the
// same ceiling, so a curated tip and a student's tip always lay out alike.
export const MIN_TIP_CHARS = 15;
export const MAX_TIP_CHARS = 150;

// ── The shelf must never be empty ───────────────────────────────────────────
//
// Every submission carries a 72h voting window, so a pool left alone DECAYS:
// seed 28 items, wait two weeks, and Daily Pick renders nothing. A student who
// installs that day opens the tab, sees an empty screen and concludes "nobody
// uses this app" — the single worst first impression a peer-learning surface
// can make, and it happens exactly when we can least afford it.
//
// So the pipeline recycles instead of expiring:
//   voting (72h) → 'archived' when the window closes — a finished ballot turn,
//   NOT a judgment. Archived items stay fully eligible for the Top Pick and
//   come back onto the ballot with a fresh window whenever the active shelf
//   falls below the minimum, most-voted first.
//
// Consequence: the shelf can only be empty if nothing was ever submitted —
// never because time passed, and never because an item "failed" a bar.
export const MIN_ACTIVE_QUESTIONS = 10;
export const MIN_ACTIVE_TIPS = 10;

/**
 * The one vote arithmetic, shared by every surface so no two screens can
 * disagree about the same queue. It DESCRIBES the votes — total and helpful%
 * — and issues no verdict, because there is none to issue: votes order the
 * Daily Pick queue and nothing else. helpfulPct is null only when literally
 * nobody has voted (0/0 has no percentage, honest or otherwise).
 */
export function tallySubmission(yes: number, no: number): {
  total: number; helpfulPct: number | null;
} {
  const total = yes + no;
  return { total, helpfulPct: total > 0 ? Math.round((yes / total) * 100) : null };
}

// The vote is phrased as HELPING, not judging (founder, 25 Jul): the student
// isn't a reviewer choosing curriculum — they're making the next aspirant's
// prep slightly easier. Same two buttons, different heart.
export const VOTE_PROMPT: Record<string, string> = {
  question: 'Would this help another CAT aspirant?',
  tip: 'Would this help another CAT aspirant?',
};

// Anonymous display names. Assigned at submission, stored with the row, never
// reused as identity — two submissions by one student can carry two names.
const NAME_POOL = [
  'Aryan', 'Priya', 'Aman', 'Neha', 'Rahul', 'Sneha', 'Kavya', 'Rohan',
  'Ishita', 'Arjun', 'Meera', 'Dev', 'Ananya', 'Kabir', 'Riya', 'Vikram',
  'Tanvi', 'Harsh', 'Pooja', 'Nikhil',
];

export function randomDisplayName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

/**
 * Which item from a voting pool this student sees today.
 *
 * Deliberately NOT "the current leader": always showing #1 is the
 * rich-get-richer failure — early leaders hoover up all later votes and the
 * ranking stops learning. Instead every student gets a stable-for-the-day,
 * effectively random pick from the pool (hash of student+day), so votes
 * spread across all candidates and the ranking converges on genuine quality.
 */
export function dailyPickIndex(studentId: string, dateIso: string, poolSize: number): number {
  if (poolSize <= 0) return 0;
  let h = 0;
  const s = `${studentId}:${dateIso}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % poolSize;
}
