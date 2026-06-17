import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { student_id, feedback_text, rating, next_steps, period_covered } = body;

  if (!student_id || !feedback_text?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Server-side authorship gate: reject unedited AI material.
  const trimmed = (feedback_text as string).trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 15) {
    return NextResponse.json({ error: 'Feedback is too short — write at least a sentence in your own words.' }, { status: 400 });
  }
  if (trimmed.includes('[Write your') || trimmed.includes('[Add your')) {
    return NextResponse.json({ error: 'Remove the placeholder and write your own message first.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify this student is actually assigned to this buddy
  const { data: student } = await admin.from('profiles').select('buddy_id').eq('id', student_id).single();
  if (student?.buddy_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this student' }, { status: 403 });
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { data, error } = await admin.from('buddy_feedback').insert({
    buddy_id: user.id,
    student_id,
    feedback_date: today,
    feedback_text: feedback_text.trim(),
    rating: rating ?? 3,
    next_steps: next_steps ?? [],
    period_covered: period_covered ?? 'adhoc',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also insert in-app notification for the student
  await admin.from('notifications').insert({
    user_id: student_id,
    type: 'feedback_received',
    title: 'Your buddy left you feedback 🎯',
    body: feedback_text.trim().slice(0, 120),
    data: {},
    read: false,
    channel: 'in_app',
  });

  return NextResponse.json({ feedback: data });
}
