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

  // TIPS ONLY (founder, 31 Aug: "just keep daily hint only in daily pick —
  // remove all the questions"). Question submissions stay in the table and keep
  // their history; they are simply never promoted to a slot again, so nothing
  // is deleted and the change is reversible by restoring this filter.
  const candidates: PickCandidate[] = submissions
    .filter((s) => s.kind === 'tip')
    .map((s) => ({
      id: s.id,
      kind: s.kind as 'question' | 'tip',
      votes: votes.get(s.id)?.total ?? 0,
      helpful: votes.get(s.id)?.helpful ?? 0,
      createdAt: s.created_at,
      featuredOn: s.featured_on,
    }));

  // Runway is a TIPS-ONLY question now. `candidates` holds no questions at all,
  // so asking runwayFor(..., 'question') would report 0 fresh and a 30-item
  // shortfall every single day and fire the "under a month" warning forever on
  // a kind we deliberately stopped serving. Reported as 0/0 instead: nothing
  // pending, nothing owed.
  const tipRunway = runwayFor(candidates, 'tip');
  const runway = { question: 0, tip: tipRunway.freshItems };
  const shortfall = { question: 0, tip: tipRunway.shortfall };

  // Already filled today? Then today's winners are settled — never restamp,
  // or an item that has been on top since 07:30 would be swapped out mid-day
  // the moment a late vote changed the order.
  const filledToday = new Set(
    submissions.filter((s) => s.featured_on === today).map((s) => s.kind),
  );
  if (filledToday.has('tip')) {
    const t = submissions.find((s) => s.featured_on === today && s.kind === 'tip');
    return {
      date: today, questionId: null, questionReason: 'not_promoted',
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
  //
  // FIXED 31 Aug — THE RECYCLE STAMP COULD NEVER WRITE. The guard used to be
  // an is-null filter on featured_on, true only for a NEVER-featured item.
  // pickForKind deliberately returns a RECYCLED item once fresh stock is gone
  // (daily-pick.ts rule 5), and a recycled item has featured_on set — so the
  // update matched zero rows, nothing was stamped, and Daily Pick rendered
  // empty from that day on. It had not bitten yet only because fresh stock had
  // never actually run out. Going hint-only makes it imminent: 4 of 38 live
  // tips have never been featured, so the shelf empties in four days.
  //
  // The guard's real intent was first-writer-wins for TODAY, not never-again.
  // "featured_on is unset OR earlier than today" keeps that concurrency
  // property exactly (a second promoter reads featured_on = today and matches
  // zero rows) while letting a recycled item take the slot. Written as an or()
  // filter rather than a not-equal one: PostgREST's not-equal drops NULL rows,
  // which would have excluded every never-featured item — the same NULL trap
  // that nearly swept the App Store reviewer out of premium last night.
  const stamp = async (id: string | null, kind: 'tip') => {
    if (!id || filledToday.has(kind)) return;
    const { error } = await admin
      .from('student_submissions')
      .update({ featured_on: today })
      .eq('id', id)
      .or(`featured_on.is.null,featured_on.lt.${today}`);
    if (error) console.error('[daily-pick] stamp failed', kind, error.message);
  };
  await stamp(pick.tip.id, 'tip');

  return {
    date: today,
    questionId: null,
    questionReason: 'not_promoted',
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
    // Questions are never promoted any more (31 Aug). Kept as an explicit null
    // rather than dropped so existing callers keep compiling and read the
    // absence as a decision, not a missing field.
    question: null,
    tip: rows.find((r) => r.kind === 'tip') ?? null,
  };
}
