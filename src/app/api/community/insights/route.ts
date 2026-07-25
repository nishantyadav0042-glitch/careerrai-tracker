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
    .select('topic, kind, payload, display_name, published_at')
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
    // Anonymous by rule: the stored random display name, never a real one.
    byTopic[t].push({ kind: row.kind as string, text, name: (row.display_name as string | null) ?? null });
  }

  return NextResponse.json({ insights: byTopic });
}
