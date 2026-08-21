import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { orderFeed, voteDisplay, FEED_PAGE_SIZE, type InsightRow, netScore } from '@/lib/os/insight-feed';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// GET /api/community/insights — Today's Top Pick + the Student Insights feed.
//
// The vote counts are stripped HERE, not in the component. A number that must
// not be seen should never leave the server: a client-side hide survives
// exactly until someone opens the network tab or a redesign forgets the rule,
// and the whole point is that a student can never read our size off the screen.
// So the payload carries `helpfulCount: number | null`, already decided.

interface SubmissionRow {
  id: string;
  kind: string;
  payload: { text?: string; section?: string } | null;
  image_path: string | null;
  display_name: string | null;
  student_id: string | null;
  created_at: string;
  featured_on: string | null;
  status: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const day = getLogDateString();

  const [subsR, votesR, myVotesR, featuredR, myOwnR] = await Promise.all([
    admin.from('student_submissions')
      .select('id, kind, payload, image_path, display_name, student_id, created_at, featured_on, status')
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(60),
    // Explicit bound (SCALE-CONTRACT): PostgREST silently truncates unbounded
    // selects, which would quietly flatten every percentage on screen.
    admin.from('submission_votes').select('submission_id, helpful').limit(10000),
    admin.from('submission_votes').select('submission_id, helpful').eq('student_id', user.id),
    // Today's pick is fetched BY ITS STAMP, not hoped-for inside the newest 60
    // (hardening sprint, 21 Aug): pickForKind deliberately recycles OLD items,
    // so past 60 live rows the featured item fell outside the slice and
    // "Today's Pick" silently vanished — live today at 89 items.
    admin.from('student_submissions')
      .select('id, kind, payload, image_path, display_name, student_id, created_at, featured_on, status')
      .eq('status', 'live')
      .eq('featured_on', getLogDateString()),
    // The contributor's own latest share — their impact card. Their own item,
    // their own tally, visible to nobody else. No rank, no board, no reward.
    admin.from('student_submissions')
      .select('id, kind, payload, image_path, display_name, student_id, created_at, featured_on, status')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  // Hardening sprint (21 Aug): these reads were unchecked. A failed subs read
  // rendered "Be the one who adds something" over a full library; a failed
  // myVotes read displayed the student's own votes as never cast. An
  // infrastructure error is UNKNOWN — a 503 the client retries, never a
  // false empty state.
  const readErr = subsR.error ?? votesR.error ?? myVotesR.error ?? featuredR.error ?? myOwnR.error;
  if (readErr) {
    console.error('[community/insights] read failed', readErr.message);
    return NextResponse.json({ error: 'Could not load the community right now — try again.', code: 'FEED_UNAVAILABLE', retryable: true }, { status: 503 });
  }
  const subs = subsR.data; const votes = votesR.data; const myVotes = myVotesR.data;

  const tally = new Map<string, { helpful: number; total: number }>();
  for (const v of (votes ?? []) as { submission_id: string; helpful: boolean }[]) {
    const t = tally.get(v.submission_id) ?? { helpful: 0, total: 0 };
    t.total += 1;
    if (v.helpful) t.helpful += 1;
    tally.set(v.submission_id, t);
  }
  const mine = new Set((myVotes ?? []).map((v: { submission_id: string }) => v.submission_id));
  const myVoteById = new Map(
    ((myVotes ?? []) as { submission_id: string; helpful: boolean }[])
      .map((v) => [v.submission_id, v.helpful ? ('up' as const) : ('down' as const)]),
  );

  // Names we publish under ourselves — never shown as a byline.
  const isCuratedName = (n: string | null | undefined) =>
    !n || n.trim().toLowerCase() === 'careerrai';

  const toRow = (s: SubmissionRow): InsightRow => {
    const t = tally.get(s.id) ?? { helpful: 0, total: 0 };
    return {
      id: s.id,
      kind: s.kind === 'question' ? 'question' : 'tip',
      text: s.payload?.text ?? '',
      section: s.payload?.section ?? null,
      // Only a real student ever gets a byline. Seeded/curated rows carry
      // display_name 'CareerRai', and signing our own content as if it were a
      // peer contribution is the opposite of what this feed is for — founder,
      // 13 Aug: "don't mention the name of CareerRai under questions… if any
      // student submits then only their name should be there, otherwise just
      // the topic and section." null here means the card shows section only.
      displayName: isCuratedName(s.display_name) ? null : s.display_name,
      imageUrl: s.image_path
        ? admin.storage.from('community-questions').getPublicUrl(s.image_path).data.publicUrl
        : null,
      helpfulVotes: t.helpful,
      totalVotes: t.total,
      createdAt: s.created_at,
      isMine: s.student_id === user.id,
      votedByMe: mine.has(s.id),
    };
  };

  const all = ((subs ?? []) as SubmissionRow[]).map(toRow);

  // Today's Top Pick — chosen by promoteDailyPick, which already runs from the
  // 07:30 cron and lazily from the ballot route. RANK, not count: "today's most
  // helpful" says one thing beat the others and nothing at all about how many
  // of us there are.
  const featured = ((featuredR.data ?? []) as SubmissionRow[]).map(toRow);
  const shape = (r: InsightRow | undefined) => {
    if (!r) return null;
    const d = voteDisplay(r);
    return {
      id: r.id, kind: r.kind, text: r.text, section: r.section,
      displayName: r.displayName, imageUrl: r.imageUrl,
      helpfulPct: d.helpfulPct, canVote: d.canVote, isMine: r.isMine,
      myVote: myVoteById.get(r.id) ?? null,
    };
  };

  // ONE Today's Pick, not two (founder spec). promoteDailyPick stamps both a
  // question and a tip; the screen shows a single earned item, so a question is
  // preferred — it asks something of the reader — and the tip is the fallback.
  // Deliberately NOT a second pipeline: this reads the same featured_on stamp
  // the existing promoter already writes.
  const pick = featured.find((r) => r.kind === 'question') ?? featured.find((r) => r.kind === 'tip');

  // The Top tab was a lie (hardening sprint, 21 Aug): the client sorted on a
  // delta map that is empty on load, so "Top" rendered the New order. The
  // server now sends each card's netScore; the client sorts on real votes.
  const withScore = (r: InsightRow) => {
    const s2 = shape(r);
    return s2 ? { ...s2, netScore: netScore(r) } : null;
  };
  const feed = orderFeed(all.filter((r) => r.id !== pick?.id))
    .slice(0, FEED_PAGE_SIZE * 5) // room for "See more" paging client-side
    .map(withScore);

  // Contributor rank retired 20 Aug (founder: no superstars, no board).

  // Impact, not status (Part 15): the contributor's own latest share with its
  // own honest state — live/checked/held — and its own tally. helpfulPct's
  // no-floor rule applies; raw counts stay behind the confidence threshold.
  const myOwnRow = ((myOwnR.data ?? []) as SubmissionRow[])[0];
  const myShare = myOwnRow
    ? {
        ...shape(toRow(myOwnRow)),
        status: myOwnRow.status,
        featuredToday: myOwnRow.featured_on === day,
        totalVotes: (tally.get(myOwnRow.id) ?? { total: 0 }).total,
      }
    : null;

  return NextResponse.json({ topPick: shape(pick), feed, pageSize: FEED_PAGE_SIZE, myShare });
}
