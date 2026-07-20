import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { liveStreak } from '@/lib/streak-utils';
import { callGemini, GOVERNING_RULE, stripNames, geminiEnabled } from '@/lib/gemini';
import { overAiHourlyLimit, recordAiCall } from '@/lib/ai-rate-limit';

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
      .select('buddy_id, full_name, current_streak, last_log_date')
      .eq('id', studentId)
      .single();
    if (!student || student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'Not your student' }, { status: 403 });
    }

    // Shared free-tier Gemini key — cap per buddy so one can't drain the quota.
    if (await overAiHourlyLimit(admin, user.id, 'feedback_draft', 60)) {
      return NextResponse.json({ error: 'Too many draft requests this hour — try again shortly.' }, { status: 429 });
    }
    await recordAiCall(admin, user.id, 'feedback_draft');

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
      `Current streak: ${liveStreak(student.current_streak, student.last_log_date)} days`,
      `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day, avg stress ${avgStress}/5`,
      latestDebrief
        ? `Latest mock (${latestDebrief.taken_on}): ${latestDebrief.overall_percentile ?? '?'}%ile`
        : 'No mock debriefs yet',
    ].join('\n');

    if (!(await geminiEnabled())) {
      // Rule-based fallback — buddy still gets something useful
      const draft = ruleDraft(liveStreak(student.current_streak, student.last_log_date), daysLogged, avgHours, latestDebrief?.overall_percentile ?? null);
      return NextResponse.json({ draft });
    }

    // Strip names BEFORE sending to the free-tier model (privacy on the input).
    const safeContext = stripNames(factsContext, [student.full_name]);
    // Return bullet-point facts, not a prose draft. The buddy writes the actual
    // message in their own voice; AI does the fact-gathering, human does the words.
    const promptText = `You are helping a mentor prepare to write a message to their student.
Return ONLY 3-4 bullet points of raw facts the mentor can write from. Do NOT write a message.
One short fact per bullet. No advice, no recommendations, no interpretation, no opener.
End with exactly this line: "• [Write your message to your student from these facts]"

Data:
${safeContext}`;

    const aiDraft = await callGemini({
      parts: [{ text: promptText }],
      system: GOVERNING_RULE,
      maxTokens: 200,
      temperature: 0.3,
    });

    const draft = aiDraft
      ? stripNames(aiDraft, [student.full_name])
      : ruleDraft(liveStreak(student.current_streak, student.last_log_date), daysLogged, avgHours, latestDebrief?.overall_percentile ?? null);

    return NextResponse.json({ draft });
  } catch (error) {
    console.error('feedback-draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft', draft: '' }, { status: 500 });
  }
}

function ruleDraft(streak: number, daysLogged: number, avgHours: string, overallPct: number | null): string {
  return [
    `• ${daysLogged}/7 days logged this week, avg ${avgHours} hrs/day (${streak}-day streak)`,
    overallPct !== null ? `• Latest mock: ${overallPct}%ile overall` : `• No mock logged this week`,
    `• [Write your message to your student from these facts]`,
  ].join('\n');
}
