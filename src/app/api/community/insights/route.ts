import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { orderFeed, voteDisplay, FEED_PAGE_SIZE, type InsightRow } from '@/lib/os/insight-feed';

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

  const [{ data: subs }, { data: votes }, { data: myVotes }] = await Promise.all([
    admin.from('student_submissions')
      .select('id, kind, payload, image_path, display_name, student_id, created_at, featured_on, status')
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(60),
    admin.from('submission_votes').select('submission_id, helpful'),
    admin.from('submission_votes').select('submission_id, helpful').eq('student_id', user.id),
  ]);

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
  const byId = new Map(((subs ?? []) as SubmissionRow[]).map((s) => [s.id, s]));

  // Today's Top Pick — chosen by promoteDailyPick, which already runs from the
  // 07:30 cron and lazily from the ballot route. RANK, not count: "today's most
  // helpful" says one thing beat the others and nothing at all about how many
  // of us there are.
  const featured = all.filter((r) => byId.get(r.id)?.featured_on === day);
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

  const feed = orderFeed(all.filter((r) => r.id !== pick?.id))
    .slice(0, FEED_PAGE_SIZE)
    .map(shape);

  // Contributor rank retired 20 Aug (founder: no superstars, no board).

  return NextResponse.json({ topPick: shape(pick), feed });
}
