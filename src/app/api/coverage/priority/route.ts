import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { serverError } from '@/lib/api-error';

// POST /api/coverage/priority — star/unstar a topic as a priority (student
// feedback: "if I want to complete Arithmetic first, I can choose that").
// Starred topics get a scoring bonus in the Topic Selector so they're
// scheduled first. Capped at 5: "everything is priority" means nothing is,
// and the cap keeps the plan's own sequencing (prereqs, revision-due) alive.
const MAX_PRIORITIES = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { topic?: unknown; priority?: unknown };
  const topic = typeof body.topic === 'string' ? body.topic : null;
  const priority = body.priority === true;
  if (!topic || !TOPIC_METADATA[topic]) {
    return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
  }

  const admin = createAdminClient();

  if (priority) {
    const { count } = await admin
      .from('topic_coverage')
      .select('topic', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('is_priority', true);
    if ((count ?? 0) >= MAX_PRIORITIES) {
      return NextResponse.json(
        { error: `You can prioritise up to ${MAX_PRIORITIES} topics — unstar one first.` },
        { status: 400 }
      );
    }
  }

  const { error } = await admin
    .from('topic_coverage')
    .update({ is_priority: priority })
    .eq('student_id', user.id)
    .eq('topic', topic);
  if (error) return serverError('coverage-priority', error);

  return NextResponse.json({ ok: true, topic, priority });
}
