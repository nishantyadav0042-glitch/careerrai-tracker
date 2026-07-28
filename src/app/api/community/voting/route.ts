import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dailyPickIndex, VOTE_PROMPT } from '@/lib/community-pipeline';
import { recycleCommunityPool } from '@/lib/community-recycle';
import { promoteDailyPick } from '@/lib/daily-pick-runner';
import { getLogDateString } from '@/lib/streak-utils';

export const maxDuration = 30;

// GET /api/community/voting — today's one tip and one question for THIS
// student to judge. Not the leader (rich-get-richer), not a feed (that's
// social media): a stable-for-the-day pick per student from the open pool,
// excluding what they submitted and what they've already voted on. No vote
// counts anywhere in the payload — herding is the failure mode.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // The shelf = items still in their voting window PLUS everything that has
  // earned a permanent place ('featured', no expiry). Featured items keep
  // collecting votes, so a genuinely good question is asked again instead of
  // vanishing when its first window closes.
  // Deliberately a plain .in() plus a JS expiry filter rather than a nested
  // PostgREST or(and(...)) expression: this is the query that renders Daily
  // Pick, and a filter that cannot be exercised in CI is not something to
  // gamble the launch surface on. 'featured' items have no expiry at all.
  const shelf = async () => {
    const { data } = await admin.from('student_submissions')
      .select('id, kind, topic, payload, image_path, display_name, student_id, status, voting_ends_at')
      .in('status', ['voting', 'featured'])
      .order('id');
    return (data ?? []).filter((r: { status: string; voting_ends_at: string | null }) =>
      r.status === 'featured' || (r.voting_ends_at != null && r.voting_ends_at > nowIso));
  };

  const [initialPool, { data: myVotes }] = await Promise.all([
    shelf(),
    admin.from('submission_votes').select('submission_id').eq('student_id', user.id),
  ]);
  let pool = initialPool;

  // Lazy safety net: if the shelf is empty the daily recycle cron has stalled
  // (or has never run on a fresh environment). Recycle inline and re-read
  // rather than showing a student a blank Daily Pick — an empty community
  // surface reads as "nobody uses this app", which is unrecoverable.
  if (!pool || pool.length === 0) {
    try {
      await recycleCommunityPool(admin);
      pool = await shelf();
    } catch (e) {
      console.error('[community/voting] inline recycle failed', e);
    }
  }

  const day = getLogDateString();

  // ── Today's Top Pick (founder, 29 Jul: max votes tops the slot for one day;
  // no votes → the queue moves up anyway) ────────────────────────────────────
  // Promoted lazily here as well as from the 07:30 cron, for the same reason
  // the recycle runs lazily above: a cron that silently stops must never leave
  // the surface empty. promoteDailyPick is idempotent — once today's slot is
  // stamped it returns without writing, so a late vote can never swap the
  // winner mid-day.
  try { await promoteDailyPick(admin); } catch (e) { console.error('[community/voting] promote failed', e); }
  const { data: topRows } = await admin
    .from('student_submissions')
    .select('id, kind, topic, payload, image_path, display_name')
    .eq('featured_on', day)
    .in('status', ['voting', 'featured', 'archived']);
  const topIds = new Set((topRows ?? []).map((r) => r.id as string));

  const voted = new Set((myVotes ?? []).map((v) => v.submission_id as string));
  // Top-pick items are excluded from the ballot: the same content appearing
  // twice on one screen — once as "the pick", once asking for a vote — reads
  // as a bug, and the pick already had its day of voting.
  const eligible = (pool ?? []).filter(
    (p) => p.student_id !== user.id && !voted.has(p.id as string) && !topIds.has(p.id as string)
  );
  const pickBy = (kind: string, section?: string) => {
    const items = eligible.filter((p) => {
      if (p.kind !== kind) return false;
      if (!section) return true;
      return ((p.payload ?? {}) as { section?: string }).section === section;
    });
    if (items.length === 0) return null;
    // Salt the hash with the section so a student doesn't get the same index
    // position across all three sections every day.
    const item = items[dailyPickIndex(`${user.id}:${section ?? ''}`, day, items.length)];
    const payload = (item.payload ?? {}) as { text?: string; section?: string; options?: string[] };
    return {
      id: item.id as string,
      kind,
      section: payload.section ?? null,
      topic: (item.topic as string | null) ?? null,
      text: payload.text ?? null,
      options: Array.isArray(payload.options) ? payload.options : null,
      imageUrl: item.image_path
        ? admin.storage.from('community-questions').getPublicUrl(item.image_path as string).data.publicUrl
        : null,
      displayName: (item.display_name as string | null) ?? 'a CareerRai student',
      prompt: VOTE_PROMPT[kind],
    };
  };

  // One question per section (founder, 25 Jul: all three sections in Daily
  // Pick — long formats arrive as photos). Each is its own stable daily pick.
  const questions = ['QA', 'DILR', 'VARC']
    .map((sec) => pickBy('question', sec))
    .filter((q) => q != null);

  // Shape the top-pick rows with the same payload mapping the ballot uses.
  // No vote counts in the payload, same as everywhere else on this surface.
  const shapeTop = (item: { id: unknown; kind: unknown; topic: unknown; payload: unknown; image_path: unknown; display_name: unknown } | undefined) => {
    if (!item) return null;
    const payload = (item.payload ?? {}) as { text?: string; section?: string; options?: string[] };
    return {
      id: item.id as string,
      kind: item.kind as string,
      section: payload.section ?? null,
      topic: (item.topic as string | null) ?? null,
      text: payload.text ?? null,
      options: Array.isArray(payload.options) ? payload.options : null,
      imageUrl: item.image_path
        ? admin.storage.from('community-questions').getPublicUrl(item.image_path as string).data.publicUrl
        : null,
      displayName: (item.display_name as string | null) ?? 'a CareerRai student',
    };
  };
  const topPick = {
    question: shapeTop((topRows ?? []).find((r) => r.kind === 'question')),
    tip: shapeTop((topRows ?? []).find((r) => r.kind === 'tip')),
  };

  return NextResponse.json({ tip: pickBy('tip'), questions, topPick });
}
