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

// Graduation bars (founder, 25 Jul). Judged only past MIN_VOTES_TO_JUDGE —
// below that a percentage is noise. ≥85% helpful → featured pool; 65–85% →
// archive (kept, not surfaced); <65% → dropped. Phase 2 automates this;
// today the founder dashboard shows each item against these bars.
export const MIN_VOTES_TO_JUDGE = 5;
export const FEATURE_BAR = 0.85;
export const ARCHIVE_BAR = 0.65;
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
//   voting (72h) → graded → 'featured' if it earned it (PERMANENT, no expiry)
//                          → 'archived' if it didn't
//   and if the active shelf ever falls below the minimum, the best archived
//   items come back with a fresh window rather than showing a blank page.
//
// Consequence: the shelf grows with every good contribution and can only be
// empty if literally nothing has ever been good — never because time passed.
export const MIN_ACTIVE_QUESTIONS = 10;
export const MIN_ACTIVE_TIPS = 10;

/**
 * The one graduation rule. Two admin surfaces used to rank the same voting
 * pool by two different rules (net votes vs the helpful%% bars) — a 3-yes/0-no
 * item topped one screen while the other said "needs 2 more votes".
 */
export function gradeSubmission(yes: number, no: number): {
  total: number; helpfulPct: number | null;
  verdict: 'feature' | 'archive' | 'drop' | 'pending';
} {
  const total = yes + no;
  if (total < MIN_VOTES_TO_JUDGE) return { total, helpfulPct: null, verdict: 'pending' };
  const helpfulPct = Math.round((yes / total) * 100);
  return {
    total, helpfulPct,
    verdict: helpfulPct >= FEATURE_BAR * 100 ? 'feature'
      : helpfulPct >= ARCHIVE_BAR * 100 ? 'archive' : 'drop',
  };
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
