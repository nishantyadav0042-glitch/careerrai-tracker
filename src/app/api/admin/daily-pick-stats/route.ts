import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MIN_VOTES_TO_JUDGE, FEATURE_BAR, ARCHIVE_BAR } from '@/lib/community-pipeline';

export const maxDuration = 60;

// The founder dashboard numbers for Daily Pick — the one screen that decides
// whether this feature lives or dies. Every figure here comes from events we
// actually log; where the data is too thin to be honest (helpful% under 5
// votes, retention in week one) the API says so instead of inventing a
// number.

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const dayStart = new Date(); dayStart.setHours(dayStart.getHours() - 24);
  const since24 = dayStart.toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: events24 }, { data: votes }, { data: subs }, { data: submitters24 }] = await Promise.all([
    // One pass over the last 24h of events; funnel derived in memory.
    admin.from('student_events').select('user_id, event').gte('created_at', since24)
      .in('event', ['app_open', 'daily_pick_open', 'community_voted', 'community_submitted', 'community_share_blocked']),
    admin.from('submission_votes').select('submission_id, student_id, helpful, created_at'),
    admin.from('student_submissions')
      .select('id, kind, topic, payload, display_name, status, created_at, voting_ends_at')
      .in('status', ['voting', 'featured', 'archived']),
    admin.from('student_submissions').select('student_id').gte('created_at', since24),
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
  const items = (subs ?? []).map((s) => {
    const t = tally.get(s.id as string) ?? { yes: 0, no: 0 };
    const total = t.yes + t.no;
    const helpfulPct = total >= MIN_VOTES_TO_JUDGE ? Math.round((t.yes / total) * 100) : null;
    return {
      id: s.id, kind: s.kind, topic: s.topic, status: s.status,
      text: (s.payload as { text?: string } | null)?.text?.slice(0, 90) ?? '(photo)',
      displayName: s.display_name,
      yes: t.yes, no: t.no, totalVotes: total,
      helpfulPct,
      daysInPipeline: Math.floor((Date.now() - Date.parse(s.created_at as string)) / 86_400_000),
      verdict: helpfulPct == null ? `needs ${MIN_VOTES_TO_JUDGE - total} more votes`
        : helpfulPct >= FEATURE_BAR * 100 ? 'feature'
        : helpfulPct >= ARCHIVE_BAR * 100 ? 'archive' : 'drop',
    };
  }).sort((a, b) => (b.helpfulPct ?? -1) - (a.helpfulPct ?? -1) || b.totalVotes - a.totalVotes);

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
    helpfulPct: t.yes + t.no >= MIN_VOTES_TO_JUDGE ? Math.round((t.yes / (t.yes + t.no)) * 100) : null,
  })).sort((a, b) => (b.helpfulPct ?? -1) - (a.helpfulPct ?? -1));

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
    retention: {
      everVoters: everVoters.size,
      votersActiveLast7d: votersActive,
      note: everVoters.size < 20 ? 'Voters-vs-non-voters retention needs ~a week of votes to mean anything.' : null,
    },
    bars: { minVotes: MIN_VOTES_TO_JUDGE, featurePct: FEATURE_BAR * 100, archivePct: ARCHIVE_BAR * 100 },
  });
}
