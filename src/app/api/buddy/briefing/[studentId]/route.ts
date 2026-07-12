import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBuddyBriefing } from '@/lib/buddy-briefing';
import { overAiHourlyLimit, recordAiCall } from '@/lib/ai-rate-limit';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Verify buddy owns this student
  const { data: student } = await admin
    .from('profiles')
    .select('buddy_id')
    .eq('id', studentId)
    .single();
  if (!student || student.buddy_id !== user.id) {
    return NextResponse.json({ error: 'Not your student' }, { status: 403 });
  }

  const { data: briefing } = await admin
    .from('buddy_briefings')
    .select('summary_text, source, generated_at')
    .eq('student_id', studentId)
    .eq('buddy_id', user.id)
    .maybeSingle();

  return NextResponse.json({ briefing: briefing ?? null });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Verify buddy owns this student
  const { data: student } = await admin
    .from('profiles')
    .select('buddy_id')
    .eq('id', studentId)
    .single();
  if (!student || student.buddy_id !== user.id) {
    return NextResponse.json({ error: 'Not your student' }, { status: 403 });
  }

  // On-demand briefing generation hits the shared free-tier Gemini key (and
  // bypasses the 18h staleness gate the cron/log paths use), so cap per buddy.
  if (await overAiHourlyLimit(admin, user.id, 'buddy_briefing', 20)) {
    return NextResponse.json({ error: 'Too many briefing refreshes this hour — try again shortly.' }, { status: 429 });
  }
  await recordAiCall(admin, user.id, 'buddy_briefing');

  const briefing = await generateBuddyBriefing(studentId, user.id);
  if (!briefing) return NextResponse.json({ error: 'Could not generate briefing' }, { status: 500 });

  return NextResponse.json({ briefing });
}
