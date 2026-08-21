import { pickForToday, runwayFor, type PickCandidate } from './daily-pick';
import { studyDayString } from '@/lib/study-day';

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
// Eligible = every LIVE item (20 Aug: the three-status ballot pool collapsed
// into one — 'voting'/'archived' were the same thing wearing two names, and
// the split was refusing votes on most of the feed). 'pending' has not
// cleared the safety gate and 'blocked' failed it; neither reaches a student.
const ELIGIBLE_STATUSES = ['live'] as const;

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

// FIXED 21 Aug (hardening sprint): this file stamped featured_on with the
// IST CALENDAR date while every reader (voting, insights) queries by the
// 05:30-IST STUDY day — two definitions of "today" that disagree for 5.5
// hours every night. In that window the lazy promoter stamped tomorrow's
// slot and then queried yesterday's, so it could never fill an empty surface
// (its whole purpose) and silently burned a fresh pick from the runway.
// One clock now: the study day, same as the readers.
function istToday(now: Date): string {
  return studyDayString(now);
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

  // Vote totals AND helpful counts. Counted here rather than trusted from a
  // denormalised column: a stale counter would silently mis-order the queue,
  // and ordering is the entire product now that there is no threshold.
  //
  // `helpful` matters as much as the total (13 Aug): the old query dropped
  // the helpful flag, so the ranking counted a "not useful" vote identically
  // to a "helpful" one — being voted on a lot beat being good.
  const { data: voteRows } = await admin.from('submission_votes').select('submission_id, helpful');
  const votes = new Map<string, { total: number; helpful: number }>();
  for (const v of (voteRows ?? []) as { submission_id: string; helpful: boolean }[]) {
    const t = votes.get(v.submission_id) ?? { total: 0, helpful: 0 };
    t.total += 1;
    if (v.helpful) t.helpful += 1;
    votes.set(v.submission_id, t);
  }

  const candidates: PickCandidate[] = submissions
    .filter((s) => s.kind === 'question' || s.kind === 'tip')
    .map((s) => ({
      id: s.id,
      kind: s.kind as 'question' | 'tip',
      votes: votes.get(s.id)?.total ?? 0,
      helpful: votes.get(s.id)?.helpful ?? 0,
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
  // CONDITIONAL stamp (21 Aug): two concurrent promoters both used to read
  // "nothing filled", then both write — and a vote landing between the reads
  // could crown two different winners for one kind, permanently spending a
  // submission's single featured day invisibly. The IS NULL guard makes the
  // write first-wins: the loser's update matches zero rows and nothing burns.
  const stamp = async (id: string | null, kind: 'question' | 'tip') => {
    if (!id || filledToday.has(kind)) return;
    const { error } = await admin
      .from('student_submissions')
      .update({ featured_on: today })
      .eq('id', id)
      .is('featured_on', null);
    if (error) console.error('[daily-pick] stamp failed', kind, error.message);
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
