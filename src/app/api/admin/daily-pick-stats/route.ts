import { requireAdminCtx as requireAdmin } from '@/lib/require-admin';
import { NextResponse } from 'next/server';
import { tallySubmission } from '@/lib/community-pipeline';

export const maxDuration = 60;

// The founder dashboard numbers for Daily Pick — the one screen that decides
// whether this feature lives or dies. Every figure here comes from events we
// actually log; where the data is too thin to be honest (retention in week
// one) the API says so instead of inventing a number. There is NO vote bar
// anywhere in this system (founder, 29 Jul + 7 Aug): items are listed in
// queue order — the exact order the Top Pick uses — never judged.


export async function GET() {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const dayStart = new Date(); dayStart.setHours(dayStart.getHours() - 24);
  const since24 = dayStart.toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: events24 }, { data: votes }, { data: subs }, { data: submitters24 }, { data: pendingRows }] = await Promise.all([
    // One pass over the last 24h of events; funnel derived in memory.
    admin.from('student_events').select('user_id, event').gte('created_at', since24)
      .in('event', ['app_open', 'daily_pick_open', 'community_voted', 'community_submitted', 'community_share_blocked']),
    admin.from('submission_votes').select('submission_id, student_id, helpful, created_at'),
    admin.from('student_submissions')
      .select('id, kind, topic, payload, display_name, status, created_at')
      .eq('status', 'live'),
    admin.from('student_submissions').select('student_id').gte('created_at', since24),
    // Safety holds. The screen fails CLOSED — any Gemini outage parks real
    // student submissions here, so they need a human with a publish button
    // or the content silently disappears (found 20 Aug: there was no such
    // button anywhere, and the one that looked like it belonged to a retired
    // moderation generation and could only 500).
    admin.from('student_submissions')
      .select('id, kind, topic, payload, image_path, created_at')
      .eq('status', 'pending').order('created_at'),
  ]);

  // ── Funnel (last 24h) ──
  const uniq = (ev: string) => new Set((events24 ?? []).filter((e) => e.event === ev).map((e) => e.user_id as string));
  const dau = new Set((events24 ?? []).map((e) => e.user_id as string)).size;
  const openers = uniq('daily_pick_open');
  const voters24 = uniq('community_voted');
  const blocked24 = (events24 ?? []).filter((e) => e.event === 'community_share_blocked').length;
  const contributors24 = new Set((submitters24 ?? []).map((s) => s.student_id as string)).size;

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

  // ── Content quality ──
  const tally = new Map<string, { yes: number; no: number }>();
  for (const v of votes ?? []) {
    const t = tally.get(v.submission_id as string) ?? { yes: 0, no: 0 };
    if (v.helpful) t.yes += 1; else t.no += 1;
    tally.set(v.submission_id as string, t);
  }
  // Listed in QUEUE ORDER — most votes first, oldest breaks ties — because
  // that IS the Daily Pick rule (founder, 29 Jul: no bar, max votes tops the
  // slot). No verdicts, no "needs N more votes": nothing here is waiting to
  // be judged, it is waiting for its day on top.
  const items = (subs ?? []).map((s) => {
    const t = tally.get(s.id as string) ?? { yes: 0, no: 0 };
    const { total, helpfulPct } = tallySubmission(t.yes, t.no);
    return {
      id: s.id, kind: s.kind, topic: s.topic, status: s.status,
      text: (s.payload as { text?: string } | null)?.text?.slice(0, 90) ?? '(photo)',
      displayName: s.display_name,
      yes: t.yes, no: t.no, totalVotes: total,
      helpfulPct,
      daysInPipeline: Math.floor((Date.now() - Date.parse(s.created_at as string)) / 86_400_000),
      createdAt: s.created_at as string,
    };
  }).sort((a, b) => b.totalVotes - a.totalVotes || Date.parse(a.createdAt) - Date.parse(b.createdAt));

  // ── Topic intelligence ──
  const byTopic = new Map<string, { n: number; yes: number; no: number }>();
  for (const it of items) {
    const key = it.topic ?? '(untagged)';
    const t = byTopic.get(key) ?? { n: 0, yes: 0, no: 0 };
    t.n += 1; t.yes += it.yes; t.no += it.no;
    byTopic.set(key, t);
  }
  const topics = [...byTopic.entries()].map(([topic, t]) => ({
    topic, items: t.n, votes: t.yes + t.no,
    helpfulPct: tallySubmission(t.yes, t.no).helpfulPct,
  })).sort((a, b) => b.votes - a.votes || (b.helpfulPct ?? -1) - (a.helpfulPct ?? -1));

  // ── Community Help Score (yesterday, the north star) ──
  // Unique helpful votes + unique openers: each is one moment where one
  // student's work reached another student.
  const votes24 = (votes ?? []).filter((v) => (v.created_at as string) >= since24);
  const helpScore = votes24.filter((v) => v.helpful).length + openers.size;

  // ── Retention: voters vs non-voters (needs a week of life to mean much) ──
  const everVoters = new Set((votes ?? []).map((v) => v.student_id as string));
  const { data: active7 } = await admin.from('student_events')
    .select('user_id').gte('created_at', since7d).eq('event', 'app_open');
  const active7Set = new Set((active7 ?? []).map((e) => e.user_id as string));
  const votersActive = [...everVoters].filter((v) => active7Set.has(v)).length;

  return NextResponse.json({
    funnel: {
      dau,
      opened: openers.size, openRate: pct(openers.size, dau),
      voted: voters24.size, voteRate: pct(voters24.size, openers.size),
      contributed: contributors24, contributionRate: pct(contributors24, dau),
      sharesBlocked: blocked24,
    },
    helpScore,
    items,
    topics,
    pending: (pendingRows ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      topic: (r.topic as string | null) ?? null,
      text: ((r.payload ?? {}) as { text?: string }).text ?? null,
      imageUrl: r.image_path
        ? admin.storage.from('community-questions').getPublicUrl(r.image_path as string).data.publicUrl
        : null,
      createdAt: r.created_at as string,
    })),
    retention: {
      everVoters: everVoters.size,
      votersActiveLast7d: votersActive,
      note: everVoters.size < 20 ? 'Voters-vs-non-voters retention needs ~a week of votes to mean anything.' : null,
    },
  });
}

/**
 * POST — resolve a safety hold. The only two outcomes a held submission can
 * have: it goes live, or it is blocked. Deliberately NOT an "approve into the
 * challenge bank" flow — that was the retired generation, and it read an MCQ
 * payload this path never writes.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; decision?: unknown };
  const { id, decision } = body;
  if (typeof id !== 'string' || (decision !== 'publish' && decision !== 'block')) {
    return NextResponse.json({ error: 'id and decision (publish|block) required' }, { status: 400 });
  }

  const { error } = await admin.from('student_submissions')
    .update({
      status: decision === 'publish' ? 'live' : 'blocked',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      ...(decision === 'publish' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .eq('status', 'pending');   // only a held item may be resolved
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
