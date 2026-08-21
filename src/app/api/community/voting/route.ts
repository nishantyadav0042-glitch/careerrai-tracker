import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dailyPickIndex, VOTE_PROMPT } from '@/lib/community-pipeline';
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

  // One live pool: every item is on the shelf and votable, permanently.
  // collecting votes, so a genuinely good question is asked again instead of
  // vanishing when its first window closes.
  // Deliberately a plain .in() plus a JS expiry filter rather than a nested
  // ONE live pool (20 Aug). This used to be a ballot: only items inside a 72h
  // window were on the shelf, everything else 'archived' and un-votable — and
  // the feed showed the archived ones anyway, so most vote taps returned 400.
  // A live item is on the shelf and votable, permanently.
  const shelf = async () => {
    const { data, error } = await admin.from('student_submissions')
      .select('id, kind, topic, payload, image_path, display_name, curated, student_id, status')
      .eq('status', 'live')
      .order('id');
    // Hardening sprint (21 Aug): an unchecked failure here returned an empty
    // ballot — the student saw "nothing to vote on" because the DATABASE was
    // down, and the EMPTY-ballot warn below mislabelled the outage as a thin
    // pool. UNKNOWN is a 503 the client can retry, never an empty shelf.
    if (error) throw new Error(`shelf read failed: ${error.message}`);
    return data ?? [];
  };

  let pool; let myVotes;
  try {
    const [poolR, votesR] = await Promise.all([
      shelf(),
      admin.from('submission_votes').select('submission_id').eq('student_id', user.id),
    ]);
    // A failed my-votes read would re-offer everything the student already
    // judged — their history erased by a blip. Same rule: UNKNOWN, not empty.
    if (votesR.error) throw new Error(`myVotes read failed: ${votesR.error.message}`);
    pool = poolR;
    myVotes = votesR.data;
  } catch (e) {
    console.error('[community/voting]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load today’s ballot — try again.', code: 'BALLOT_UNAVAILABLE', retryable: true }, { status: 503 });
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
  const { data: topRows, error: topErr } = await admin
    .from('student_submissions')
    .select('id, kind, topic, payload, image_path, display_name, curated')
    .eq('featured_on', day)
    .eq('status', 'live');
  if (topErr) {
    console.error('[community/voting] top-pick read failed', topErr.message);
    return NextResponse.json({ error: 'Could not load today’s ballot — try again.', code: 'BALLOT_UNAVAILABLE', retryable: true }, { status: 503 });
  }
  const topIds = new Set((topRows ?? []).map((r) => r.id as string));

  const voted = new Set((myVotes ?? []).map((v) => v.submission_id as string));
  // Top-pick items are excluded from the ballot: the same content appearing
  // twice on one screen — once as "the pick", once asking for a vote — reads
  // as a bug, and the pick already had its day of voting.
  const eligible = (pool ?? []).filter(
    (p) => p.student_id !== user.id && !voted.has(p.id as string) && !topIds.has(p.id as string)
  );
  // A question whose section the screen could not infer is STILL a question
  // (hardening sprint, 21 Aug): it used to be un-ballotable forever — live,
  // visible in the feed, but never offered for a vote, and on thin days that
  // made the rotation promise a ballot that rendered blank. A section-less
  // item is assigned a stable pseudo-section from its id, so every live
  // question is eligible somewhere and the pick stays deterministic.
  const stableSection = (id: string): string => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ['QA', 'DILR', 'VARC'][h % 3];
  };
  const pickBy = (kind: string, section?: string) => {
    const items = eligible.filter((p) => {
      if (p.kind !== kind) return false;
      if (!section) return true;
      const declared = ((p.payload ?? {}) as { section?: string }).section;
      return (declared ?? stableSection(p.id as string)) === section;
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
      curated: item.curated === true,
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
  const shapeTop = (item: { id: unknown; kind: unknown; topic: unknown; payload: unknown; image_path: unknown; display_name: unknown; curated: unknown } | undefined) => {
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
      curated: item.curated === true,
    };
  };
  const topPick = {
    question: shapeTop((topRows ?? []).find((r) => r.kind === 'question')),
    tip: shapeTop((topRows ?? []).find((r) => r.kind === 'tip')),
  };

  const tip = pickBy('tip');

  // 12 Aug: 12 openers, 0 votes, and the only way to tell "nothing to vote on"
  // from "chose not to vote" was an hour of SQL archaeology after the fact.
  // Same fix as meta-capi's silent skip — announce the state instead of
  // leaving it invisible, so the next thin day is a log line, not an audit.
  if (!tip && questions.length === 0) {
    console.warn(`[community/voting] EMPTY ballot student=${user.id} day=${day} eligiblePool=${eligible.length}`);
  }

  return NextResponse.json({ tip, questions, topPick });
}
