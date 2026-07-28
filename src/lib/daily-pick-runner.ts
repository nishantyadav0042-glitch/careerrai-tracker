import { pickForToday, runwayFor, type PickCandidate } from './daily-pick';

// ── Daily Pick runner ───────────────────────────────────────────────────────
//
// The database half of lib/daily-pick. The selection rule lives there, pure and
// tested; this only loads candidates, applies it, and stamps the winner.
//
// Runs from the community-recycle cron (07:30 IST — before the study day, so the
// slot is filled before the first student opens the tab) and is safe to call
// lazily from a request path too. IDEMPOTENT: if today's slot is already filled
// for a kind, it does nothing. Two runs in a minute cannot produce two winners,
// and a missed cron is repaired by the next visit rather than skipping a day.
//
// Eligible = 'voting' | 'featured' | 'archived'. Those three are the whole
// surviving pool under the no-bar model; 'pending' has not cleared the safety
// gate and 'blocked' failed it, and neither may ever reach a student.
const ELIGIBLE_STATUSES = ['voting', 'featured', 'archived'] as const;

export interface PromoteResult {
  date: string;
  questionId: string | null;
  questionReason: string;
  tipId: string | null;
  tipReason: string;
  alreadyDone: boolean;
  /** Days of never-featured stock left, per kind — the "one month" check. */
  runway: { question: number; tip: number };
  shortfall: { question: number; tip: number };
}

/** IST calendar date — the day boundary students actually experience. */
function istToday(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function promoteDailyPick(admin: any, now: Date = new Date()): Promise<PromoteResult> {
  const today = istToday(now);

  const { data: rows } = await admin
    .from('student_submissions')
    .select('id, kind, created_at, featured_on, status')
    .in('status', ELIGIBLE_STATUSES);

  const submissions = (rows ?? []) as {
    id: string; kind: string; created_at: string; featured_on: string | null; status: string;
  }[];

  // Vote totals. Counted here rather than trusted from a denormalised column:
  // a stale counter would silently mis-order the queue, and ordering is the
  // entire product now that there is no threshold.
  const { data: voteRows } = await admin.from('submission_votes').select('submission_id');
  const votes = new Map<string, number>();
  for (const v of (voteRows ?? []) as { submission_id: string }[]) {
    votes.set(v.submission_id, (votes.get(v.submission_id) ?? 0) + 1);
  }

  const candidates: PickCandidate[] = submissions
    .filter((s) => s.kind === 'question' || s.kind === 'tip')
    .map((s) => ({
      id: s.id,
      kind: s.kind as 'question' | 'tip',
      votes: votes.get(s.id) ?? 0,
      createdAt: s.created_at,
      featuredOn: s.featured_on,
    }));

  const runway = {
    question: runwayFor(candidates, 'question').freshItems,
    tip: runwayFor(candidates, 'tip').freshItems,
  };
  const shortfall = {
    question: runwayFor(candidates, 'question').shortfall,
    tip: runwayFor(candidates, 'tip').shortfall,
  };

  // Already filled today? Then today's winners are settled — never restamp,
  // or an item that has been on top since 07:30 would be swapped out mid-day
  // the moment a late vote changed the order.
  const filledToday = new Set(
    submissions.filter((s) => s.featured_on === today).map((s) => s.kind),
  );
  if (filledToday.has('question') && filledToday.has('tip')) {
    const q = submissions.find((s) => s.featured_on === today && s.kind === 'question');
    const t = submissions.find((s) => s.featured_on === today && s.kind === 'tip');
    return {
      date: today, questionId: q?.id ?? null, questionReason: 'already_set',
      tipId: t?.id ?? null, tipReason: 'already_set',
      alreadyDone: true, runway, shortfall,
    };
  }

  const pick = pickForToday(candidates);

  // Stamp only the kinds not already settled today. featured_on is the single
  // source of "held the top slot on this date", which is what caps a winner at
  // one day: tomorrow's run sees featured_on set and skips it.
  const stamp = async (id: string | null, kind: 'question' | 'tip') => {
    if (!id || filledToday.has(kind)) return;
    await admin
      .from('student_submissions')
      .update({ featured_on: today })
      .eq('id', id);
  };
  await stamp(pick.question.id, 'question');
  await stamp(pick.tip.id, 'tip');

  return {
    date: today,
    questionId: pick.question.id,
    questionReason: pick.question.reason,
    tipId: pick.tip.id,
    tipReason: pick.tip.reason,
    alreadyDone: false,
    runway,
    shortfall,
  };
}

/** Today's top slot, for the student-facing surface. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTodaysPick(admin: any, now: Date = new Date()) {
  const today = istToday(now);
  const { data } = await admin
    .from('student_submissions')
    .select('id, kind, topic, payload, image_path, display_name, featured_on')
    .eq('featured_on', today)
    .in('status', ELIGIBLE_STATUSES);
  const rows = (data ?? []) as { id: string; kind: string }[];
  return {
    date: today,
    question: rows.find((r) => r.kind === 'question') ?? null,
    tip: rows.find((r) => r.kind === 'tip') ?? null,
  };
}
