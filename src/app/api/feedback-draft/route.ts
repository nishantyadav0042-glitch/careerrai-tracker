import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, GOVERNING_RULE, stripNames, geminiEnabled } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
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

    // Fetch latest mock debrief
    const { data: latestDebrief } = await admin
      .from('mock_debriefs')
      .select('overall_percentile, taken_on')
      .eq('student_id', studentId)
      .order('taken_on', { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';

    const factsContext = [
      `Current streak: ${student.current_streak ?? 0} days`,
      `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day, avg stress ${avgStress}/5`,
      latestDebrief
        ? `Latest mock (${latestDebrief.taken_on}): ${latestDebrief.overall_percentile ?? '?'}%ile`
        : 'No mock debriefs yet',
    ].join('\n');

    if (!(await geminiEnabled())) {
      // Rule-based fallback — buddy still gets something useful
      const draft = ruleDraft(student.current_streak ?? 0, daysLogged, avgHours, latestDebrief?.overall_percentile ?? null);
      return NextResponse.json({ draft });
    }

    // Strip names BEFORE sending to the free-tier model (privacy on the input).
    const safeContext = stripNames(factsContext, [student.full_name]);
    const promptText = `You are drafting a short message for a mentor to send to their student. Write exactly 2 sentences: (1) state the consistency fact — days logged and average hours per day; (2) state one factual data point — either the stress level or the latest mock result if available. End the draft with a blank line and: "[Add your observation here:]". Use first person ("You logged…", "Your latest…"). Under 60 words before the placeholder. Facts only — no advice, no interpretation, no recommendations.\n\nData:\n${safeContext}`;

    const aiDraft = await callGemini({
      parts: [{ text: promptText }],
      system: GOVERNING_RULE,
      maxTokens: 200,
      temperature: 0.3,
    });

    const draft = aiDraft
      ? stripNames(aiDraft, [student.full_name])
      : ruleDraft(student.current_streak ?? 0, daysLogged, avgHours, latestDebrief?.overall_percentile ?? null);

    return NextResponse.json({ draft });
  } catch (error) {
    console.error('feedback-draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft', draft: '' }, { status: 500 });
  }
}

function ruleDraft(streak: number, daysLogged: number, avgHours: string, overallPct: number | null): string {
  const line1 = `You logged ${daysLogged}/7 days this week, averaging ${avgHours} hrs/day (${streak}-day streak).`;
  const line2 = overallPct !== null
    ? `Your latest mock came in at ${overallPct}%ile overall.`
    : `No mock result logged this week.`;
  return `${line1} ${line2}\n\n[Add your observation here:]`;
}
