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
