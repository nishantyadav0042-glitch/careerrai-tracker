import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('feedback-draft: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { studentId } = body as { studentId: string };
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const admin = createAdminClient();

    // Verify buddy owns this student
    const { data: student } = await admin
      .from('profiles')
      .select('buddy_id, full_name, current_streak')
      .eq('id', studentId)
      .single();
    if (!student || student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'Not your student' }, { status: 403 });
    }

    // Fetch last 7 days of logs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: logs } = await admin
      .from('daily_reports')
      .select('report_date, study_duration, topics_covered, confidence, stress, mock_score, mock_taken')
      .eq('student_id', studentId)
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('report_date', { ascending: false });

    // Fetch latest test result
    const { data: latestTest } = await admin
      .from('test_results')
      .select('percentile, score, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch last feedback given
    const { data: lastFeedback } = await admin
      .from('buddy_feedback')
      .select('feedback_text, created_at')
      .eq('student_id', studentId)
      .eq('feedback_type', 'buddy_feedback')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';

    const contextLines = [
      `Student: ${student.full_name.split(' ')[0]}`,
      `Current streak: ${student.current_streak ?? 0} days`,
      `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day, avg stress ${avgStress}/5`,
      latestTest ? `Latest CAT readiness: ${latestTest.percentile?.toFixed(1) ?? '?'}%ile` : 'No test result yet',
      lastFeedback
        ? `Last feedback (${new Date(lastFeedback.created_at).toLocaleDateString('en-IN')}): "${lastFeedback.feedback_text?.substring(0, 100)}..."`
        : 'No previous feedback given',
    ].join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `You are an IIM alumni writing feedback for a CAT aspirant. Tone: direct, warm, senior-bhaiya/didi. Write 2-3 sentences: one observation on their consistency this week, one observation on an area to improve, one specific action for next week. Max 60 words. Use first person. No generic phrases. Be specific to the numbers given.`,
      messages: [{
        role: 'user',
        content: `Generate feedback draft:\n${contextLines}`,
      }],
    });

    const draft = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    return NextResponse.json({ draft });
  } catch (error) {
    console.error('feedback-draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft', draft: '' }, { status: 500 });
  }
}
