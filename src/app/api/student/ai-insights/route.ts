import { NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

export async function POST() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('student ai-insights: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [{ data: logs }, { data: debriefs }, { data: profile }] = await Promise.all([
      admin
        .from('daily_reports')
        .select('report_date, study_duration, topics_covered, confidence, stress, mock_taken, total_accuracy')
        .eq('student_id', user.id)
        .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
        .order('report_date', { ascending: false }),
      admin
        .from('mock_debriefs')
        .select('taken_on, overall_percentile, varc, dilr, qa, error_buckets')
        .eq('student_id', user.id)
        .order('taken_on', { ascending: false })
        .limit(3),
      admin
        .from('profiles')
        .select('full_name, current_streak')
        .eq('id', user.id)
        .single(),
    ]);

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';
    const avgConfidence = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / daysLogged).toFixed(1)
      : '3';

    const topicsFlat = (logs ?? []).flatMap((r) => r.topics_covered ?? []);
    const topicCounts: Record<string, number> = {};
    for (const t of topicsFlat) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ');

    const latestDebrief = debriefs?.[0];
    const debriefLine = latestDebrief
      ? `Latest mock: ${latestDebrief.overall_percentile ?? '?'}%ile overall. Error buckets: conceptual=${latestDebrief.error_buckets?.conceptual ?? 0}, silly=${latestDebrief.error_buckets?.silly ?? 0}, time=${latestDebrief.error_buckets?.time ?? 0}`
      : 'No mock debriefs yet.';

    const context = [
      `Student: ${profile?.full_name?.split(' ')[0] ?? 'Student'}`,
      `Current streak: ${profile?.current_streak ?? 0} days`,
      `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day`,
      `Avg confidence: ${avgConfidence}/5, avg stress: ${avgStress}/5`,
      topTopics ? `Topics covered most: ${topTopics}` : 'No topics logged this week',
      debriefLine,
    ].join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are an IIM alumni helping a CAT aspirant. Based on their data, give exactly 3 bullet points of specific, actionable advice for this week. Each bullet: one sentence, direct, no fluff. Use the actual numbers from the data. Format as: • [advice]. No headers, no intro text.`,
      messages: [{ role: 'user', content: `Give me 3 specific action items this week:\n${context}` }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    return NextResponse.json({ insights: text });
  } catch (error) {
    console.error('student ai-insights error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
