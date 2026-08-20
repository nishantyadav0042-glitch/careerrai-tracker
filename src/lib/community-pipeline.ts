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

/**
 * Every value student_submissions.status may hold. Mirrors the DB CHECK in
 * 20260820e_community_one_live_pool.sql — guard-pinned.
 *
 * The 72h ballot (voting → archived) retired 20 Aug: it was refusing votes on
 * 77% of the items the feed displayed. Content is permanent and votable;
 * only the TOP PLACEMENT is one day, and that lives in featured_on.
 */
export const SUBMISSION_STATUSES = ['live', 'pending', 'blocked', 'rejected'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Everything a student may see and vote on. */
export const VISIBLE_STATUSES = ['live'] as const;

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


// ── Structured submission failure codes (founder mandate, 20 Aug) ──────────
//
// The 19 Aug incident: a real student's submission died as an opaque
// status:400 and we could not tell WHICH of three branches rejected her.
// Every rejection now carries a machine code — tracked in telemetry, mapped
// to a helpful human sentence client-side. Internal moderation detail stays
// vague on purpose (echoing what tripped the filter teaches evasion).
export type SubmitFailCode =
  | 'KIND_INVALID'
  | 'SECTION_REQUIRED'
  | 'TOPIC_REQUIRED'
  | 'CONTENT_REQUIRED'
  | 'TEXT_TOO_SHORT'
  | 'TEXT_TOO_LONG'
  | 'IMAGE_TYPE_UNSUPPORTED'
  | 'IMAGE_TOO_SMALL'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_UPLOAD_FAILED'
  | 'MODERATION_BLOCKED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

export interface SubmitInput {
  kind?: unknown; section?: unknown; topic?: unknown;
  tip?: unknown; text?: unknown; image?: unknown; image_mime?: unknown;
}

export interface ValidSubmission {
  kind: 'tip' | 'question';
  /** null when the student did not pick one — the safety screen infers it. */
  section: string | null;
  topic: string | null;
  /** Tip text, or the typed question text (image-free path). */
  text: string | null;
  image: string | null;
  imageMime: string | null;
}

/**
 * Pure validation — the one place the submission contract lives, so the
 * client hint and the server authority cannot drift. A QUESTION needs text
 * OR an image (founder, 20 Aug: the purpose is sharing a tough question as
 * easily as possible — typed, photographed, or both — never a mandatory
 * image because the first implementation happened to want one).
 */
export function validateSubmission(
  body: SubmitInput,
  sections: readonly string[],
  topicSectionOf: (topic: string) => string | undefined,
): { ok: true; value: ValidSubmission } | { ok: false; code: SubmitFailCode; error: string } {
  // KIND IS NOT THE STUDENT'S JOB EITHER (founder, 20 Aug). The modal used to
  // open with "A tip / A question" before it would take anything at all —
  // asking someone to classify their own thought before they can share it.
  // A photo is a question, near enough always; text is read by the safety
  // screen, which already returns what it is. What arrives here is only a
  // hint, and the shape of the content settles it.
  const { section, topic } = body;
  const hasImageEarly = typeof body.image === 'string' && body.image.length > 0;
  const hinted = body.kind === 'tip' || body.kind === 'question' ? body.kind : null;
  // A photo OUTRANKS the hint. A stale client that still says 'tip' while
  // attaching a picture must not fall into the tip branch and be rejected for
  // having no text — the picture IS the content.
  const kind: 'tip' | 'question' = hasImageEarly ? 'question' : (hinted ?? 'tip');
  // Section is OPTIONAL (founder, 20 Aug): internal structure must not become
  // student friction. A student with a tough question in front of them should
  // not have to file it into our taxonomy first — the safety screen already
  // reads the content and returns the section, so the classification happens
  // where it costs nobody anything.
  const sectionOk = typeof section === 'string' && sections.includes(section);
  const chosenSection = sectionOk ? (section as string) : null;
  const topicOk = typeof topic === 'string' && chosenSection != null && topicSectionOf(topic) === chosenSection;

  if (kind === 'tip') {
    // Topic is OPTIONAL for a tip (founder, 20 Aug). It used to be mandatory,
    // which made the product's cheapest contribution carry its heaviest form:
    // a question needed only a section, a one-line tip needed section AND the
    // right topic hunted out of a dropdown. Friction was inverted. The system
    // knows the curriculum; the student's job is the idea.
    // Either field carries the words — the client no longer decides which.
    const text = typeof body.tip === 'string' && body.tip.trim()
      ? body.tip.trim()
      : typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length === 0) return { ok: false, code: 'CONTENT_REQUIRED', error: 'Write your tip first' };
    if (text.length < MIN_TIP_CHARS) return { ok: false, code: 'TEXT_TOO_SHORT', error: `Tips are ${MIN_TIP_CHARS}–${MAX_TIP_CHARS} characters — one sharp idea` };
    if (text.length > MAX_TIP_CHARS) return { ok: false, code: 'TEXT_TOO_LONG', error: `Tips are ${MIN_TIP_CHARS}–${MAX_TIP_CHARS} characters — one sharp idea` };
    return { ok: true, value: { kind, section: chosenSection, topic: topicOk ? (topic as string) : null, text, image: null, imageMime: null } };
  }

  // question: text OR image, both welcome.
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const hasImage = typeof body.image === 'string' && body.image.length > 0;
  if (!hasImage && text.length === 0) {
    return { ok: false, code: 'CONTENT_REQUIRED', error: 'Type the question or attach a photo of it' };
  }
  if (text.length > MAX_QUESTION_CHARS) {
    return { ok: false, code: 'TEXT_TOO_LONG', error: `Keep the question under ${MAX_QUESTION_CHARS} characters` };
  }
  if (hasImage && (typeof body.image_mime !== 'string' || !IMAGE_MIMES.includes(body.image_mime))) {
    return { ok: false, code: 'IMAGE_TYPE_UNSUPPORTED', error: 'That photo format isn’t supported — use JPG or PNG, or type the question instead' };
  }
  return {
    ok: true,
    value: {
      kind, section: chosenSection, topic: topicOk ? (topic as string) : null,
      text: text || null,
      image: hasImage ? (body.image as string) : null,
      imageMime: hasImage ? (body.image_mime as string) : null,
    },
  };
}

/** Typed questions get room to breathe; still one question, not an essay. */
export const MAX_QUESTION_CHARS = 600;
