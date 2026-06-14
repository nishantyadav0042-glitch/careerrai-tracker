import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, GOVERNING_RULE, stripNames, geminiEnabled } from '@/lib/gemini';

interface MockDebrief {
  taken_on: string;
  overall_percentile: number | null;
  varc: { percentile?: number | null } | null;
  dilr: { percentile?: number | null } | null;
  qa: { percentile?: number | null } | null;
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number } | null;
}

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
    .select('buddy_id, full_name, current_streak')
    .eq('id', studentId)
    .single();
  if (!student || student.buddy_id !== user.id) {
    return NextResponse.json({ error: 'Not your student' }, { status: 403 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [{ data: logs }, { data: debriefs }] = await Promise.all([
    admin
      .from('daily_reports')
      .select('report_date, study_duration, topics_covered, confidence, stress')
      .eq('student_id', studentId)
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('report_date', { ascending: false }),
    admin
      .from('mock_debriefs')
      .select('taken_on, overall_percentile, varc, dilr, qa, error_buckets')
      .eq('student_id', studentId)
      .order('taken_on', { ascending: false })
      .limit(3),
  ]);

  const daysLogged = logs?.length ?? 0;
  const avgHours = daysLogged > 0
    ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
    : '0';
  const avgStress = daysLogged > 0
    ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
    : 'n/a';
  const avgConfidence = daysLogged > 0
    ? ((logs ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / daysLogged).toFixed(1)
    : 'n/a';

  const topicsFlat = (logs ?? []).flatMap((r) => (r.topics_covered ?? []) as string[]);
  const topicCounts: Record<string, number> = {};
  for (const t of topicsFlat) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ');

  const mocksText = ((debriefs ?? []) as MockDebrief[]).map((d, i) => {
    const sec = [
      d.varc?.percentile != null ? `VARC ${d.varc.percentile}%ile` : null,
      d.dilr?.percentile != null ? `DILR ${d.dilr.percentile}%ile` : null,
      d.qa?.percentile != null ? `QA ${d.qa.percentile}%ile` : null,
    ].filter(Boolean).join(', ');
    const eb = d.error_buckets;
    const ebText = eb ? `errors: conceptual=${eb.conceptual}, silly=${eb.silly}, time=${eb.time}` : '';
    return `Mock ${i + 1} (${d.taken_on}): ${d.overall_percentile ?? '?'}%ile. ${sec}. ${ebText}`.trim();
  }).join('\n');

  const factsContext = [
    `Streak: ${student.current_streak ?? 0} days`,
    `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day`,
    `Avg confidence: ${avgConfidence}/5, avg stress: ${avgStress}/5`,
    topTopics ? `Topics covered: ${topTopics}` : 'No topics logged',
    debriefs?.length ? `Recent mocks:\n${mocksText}` : 'No mocks logged recently',
  ].join('\n');

  let summaryText: string;
  let source: 'ai' | 'fallback' = 'fallback';

  if (geminiEnabled()) {
    const aiResult = await callGemini({
      parts: [{
        text: `Here is the student's data for the last 7 days:\n${factsContext}\n\nWrite a briefing for the mentor in 3-5 bullet points. State only verifiable facts and numbers — no diagnoses, no recommendations, no interpretations. Each bullet: one factual sentence. If a pattern seems notable, phrase it as an open question (e.g. "DILR accuracy flat across 3 mocks — worth exploring why") rather than a conclusion. No student name.`,
      }],
      system: GOVERNING_RULE,
      maxTokens: 320,
      temperature: 0.2,
    });

    if (aiResult) {
      summaryText = stripNames(aiResult, [student.full_name]);
      source = 'ai';
    } else {
      summaryText = fallbackBriefing(daysLogged, avgHours, avgStress, student.current_streak ?? 0, (debriefs ?? []) as MockDebrief[]);
    }
  } else {
    summaryText = fallbackBriefing(daysLogged, avgHours, avgStress, student.current_streak ?? 0, (debriefs ?? []) as MockDebrief[]);
  }

  await admin
    .from('buddy_briefings')
    .upsert(
      {
        student_id: studentId,
        buddy_id: user.id,
        summary_text: summaryText,
        source,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,buddy_id' }
    );

  return NextResponse.json({ briefing: { summary_text: summaryText, source, generated_at: new Date().toISOString() } });
}

function fallbackBriefing(
  daysLogged: number,
  avgHours: string,
  avgStress: string,
  streak: number,
  debriefs: MockDebrief[]
): string {
  const lines = [
    `• Logged ${daysLogged}/7 days, averaging ${avgHours} hrs/day. Streak: ${streak} days. Avg stress: ${avgStress}/5.`,
  ];
  if (debriefs.length > 0 && debriefs[0].overall_percentile != null) {
    lines.push(`• Latest mock (${debriefs[0].taken_on}): ${debriefs[0].overall_percentile}%ile overall.`);
    if (debriefs.length >= 2 && debriefs[1].overall_percentile != null) {
      const delta = debriefs[0].overall_percentile - debriefs[1].overall_percentile;
      lines.push(`• Percentile ${delta >= 0 ? 'rose' : 'fell'} ${Math.abs(delta).toFixed(0)} points across last 2 mocks.`);
    }
    const eb = debriefs[0].error_buckets;
    if (eb) {
      const total = eb.conceptual + eb.silly + eb.time + eb.panic + eb.selection;
      if (total > 0) {
        lines.push(`• Error breakdown (latest mock): conceptual=${eb.conceptual}, silly=${eb.silly}, time=${eb.time}, panic=${eb.panic}, selection=${eb.selection}.`);
      }
    }
  } else {
    lines.push('• No mocks debriefed in the last 7 days.');
  }
  return lines.join('\n');
}
