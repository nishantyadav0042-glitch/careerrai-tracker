import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendPushToUser } from '@/lib/push';
import { serverError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { student_id, feedback_text, rating, next_steps, period_covered, ai_draft, diagnosis_issue, diagnosis_section, diagnosis_confidence } = body;

  const ISSUES = ['knowledge', 'consistency', 'strategy'];
  const SECTIONS = ['VARC', 'DILR', 'QA'];
  const CONFIDENCE = ['improved', 'same', 'worse'];
  if (diagnosis_issue != null && !ISSUES.includes(diagnosis_issue)) {
    return NextResponse.json({ error: 'Invalid diagnosis_issue' }, { status: 400 });
  }
  if (diagnosis_section != null && !SECTIONS.includes(diagnosis_section)) {
    return NextResponse.json({ error: 'Invalid diagnosis_section' }, { status: 400 });
  }
  if (diagnosis_confidence != null && !CONFIDENCE.includes(diagnosis_confidence)) {
    return NextResponse.json({ error: 'Invalid diagnosis_confidence' }, { status: 400 });
  }

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

  // If the buddy used AI fact bullets, enforce that they actually wrote their own message
  // (same Jaccard check as the client-side gate — but server-enforced and bypass-proof).
  if (ai_draft && typeof ai_draft === 'string') {
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
    const aiWords = new Set(norm(ai_draft as string));
    const submittedTokens = norm(trimmed);
    const submittedSet = new Set(submittedTokens);
    const ownWords = submittedTokens.filter((w) => !aiWords.has(w));
    const intersection = [...submittedSet].filter((w) => aiWords.has(w)).length;
    const union = aiWords.size + submittedSet.size - intersection;
    const similarity = union > 0 ? intersection / union : 0;
    if (similarity > 0.55 || ownWords.length < 15) {
      return NextResponse.json(
        { error: 'Add your own words — your student needs YOU, not a template. Edit this before sending.' },
        { status: 400 }
      );
    }
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
    diagnosis_issue: diagnosis_issue ?? null,
    diagnosis_section: diagnosis_section ?? null,
    diagnosis_confidence: diagnosis_confidence ?? null,
  }).select().single();

  if (error) return serverError('buddy-feedback', error);

  // Notify student — in-app + push
  const notifTitle = 'Tere buddy ne reply kiya 🎯';
  const notifBody = feedback_text.trim().slice(0, 120);
  await admin.from('notifications').insert({
    user_id: student_id, type: 'feedback_received',
    title: notifTitle, body: notifBody,
    data: { url: '/student/buddy' }, read: false, channel: 'in_app',
  });
  const { data: studentPrefs } = await admin.from('profiles').select('notif_prefs').eq('id', student_id).single();
  if ((studentPrefs?.notif_prefs as Record<string, unknown>)?.push === true) {
    await sendPushToUser(student_id, { title: notifTitle, body: notifBody, url: '/student/buddy' });
  }

  return NextResponse.json({ feedback: data });
}
