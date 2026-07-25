import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA } from '@/lib/topics-constants';

export const maxDuration = 30;

// GET /api/community/insights?topics=A,B — verified student contributions for
// specific topics. This is the curriculum-injection read: tips, mistakes and
// shortcuts appear ONLY at the topic they belong to, only when a student is
// looking at that topic. Never a feed — context is the entire distribution
// model, and the reason a verified tip here beats the same tip lost in a
// Telegram scroll.

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const topics = (request.nextUrl.searchParams.get('topics') ?? '')
    .split(',').map((t) => t.trim()).filter((t) => TOPIC_METADATA[t]).slice(0, 10);
  if (topics.length === 0) return NextResponse.json({ insights: {} });

  const admin = createAdminClient();
  const { data } = await admin
    .from('student_submissions')
    .select('topic, kind, payload, student_id, published_at, profiles:student_id(full_name)')
    .in('topic', topics)
    .eq('status', 'approved').in('kind', ['tip', 'mistake', 'shortcut'])
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });

  // Cap 2 per topic — the freshest verified items. More than that turns
  // curriculum back into a feed.
  const byTopic: Record<string, { kind: string; text: string; name: string | null }[]> = {};
  for (const row of data ?? []) {
    const t = row.topic as string;
    byTopic[t] ??= [];
    if (byTopic[t].length >= 2) continue;
    const text = (row.payload as { text?: string })?.text;
    if (!text) continue;
    const prof = row.profiles as { full_name?: string | null } | null;
    // First name only — enough for "a real student said this", no more.
    const name = prof?.full_name ? prof.full_name.split(' ')[0] : null;
    byTopic[t].push({ kind: row.kind as string, text, name });
  }

  return NextResponse.json({ insights: byTopic });
}
