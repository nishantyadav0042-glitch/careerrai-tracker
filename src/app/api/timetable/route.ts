import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeBlocks, topicsTaught, type TimetableBlock } from '@/lib/timetable';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// GET  — the student's saved timetable (or null).
// POST — save the blocks the student CONFIRMED, then align the plan.
//
// The alignment is deliberately boring: confirmed coaching topics are flagged
// is_priority on topic_coverage, and the existing planner already boosts
// priority topics (see buildTopicChoices in lib/routine-plan.ts). So the study
// plan starts leaning toward what coaching is actually teaching WITHOUT any
// change to the planning engine, and without a model ever choosing a topic.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('student_timetables')
    .select('blocks, confirmed_at, updated_at')
    .eq('student_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    timetable: data ? { blocks: sanitizeBlocks(data.blocks), confirmedAt: data.confirmed_at } : null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { blocks?: unknown; source?: string };
  // Re-sanitize on the way in. The client already validated, but a client is
  // never the authority on what reaches the database.
  const blocks: TimetableBlock[] = sanitizeBlocks(body.blocks);
  if (blocks.length === 0) {
    return NextResponse.json({ error: 'No valid classes to save.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { error } = await admin.from('student_timetables').upsert({
    student_id: user.id,
    blocks,
    source: typeof body.source === 'string' ? body.source.slice(0, 20) : 'photo',
    confirmed_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: 'student_id' });

  if (error) {
    console.error('[timetable] save failed', error.message);
    return NextResponse.json({ error: 'Could not save your timetable. Please try again.' }, { status: 500 });
  }

  // ── Alignment ──────────────────────────────────────────────────────────
  // Flag every confirmed coaching topic as a priority. Existing coverage rows
  // are updated; missing ones are created as 'not_started' so a topic coaching
  // teaches next week still counts. Never downgrades an existing status.
  const taught = topicsTaught(blocks);
  let aligned = 0;

  if (taught.length > 0) {
    const { data: existing } = await admin
      .from('topic_coverage')
      .select('topic')
      .eq('student_id', user.id)
      .in('topic', taught);

    const have = new Set((existing ?? []).map((r) => r.topic as string));

    const toInsert = taught
      .filter((t) => !have.has(t))
      .map((t) => ({
        student_id: user.id,
        section: TOPIC_METADATA[t]?.section ?? 'QA',
        topic: t,
        status: 'not_started',
        is_priority: true,
      }));

    if (toInsert.length > 0) {
      await admin.from('topic_coverage')
        .upsert(toInsert, { onConflict: 'student_id,section,topic', ignoreDuplicates: true });
    }
    if (have.size > 0) {
      await admin.from('topic_coverage')
        .update({ is_priority: true })
        .eq('student_id', user.id)
        .in('topic', [...have]);
    }
    aligned = taught.length;
  }

  admin.from('student_events').insert({
    user_id: user.id, event: 'timetable_confirmed',
    props: { blocks: blocks.length, alignedTopics: aligned },
    path: null,
  }).then(({ error: e }) => { if (e) console.error('[timetable] event log failed', e.message); });

  return NextResponse.json({ ok: true, blocks: blocks.length, alignedTopics: aligned });
}
