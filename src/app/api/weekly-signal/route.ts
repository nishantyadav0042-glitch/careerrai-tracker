import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('weekly-signal: ANTHROPIC_API_KEY is not set in this environment');
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
      .select('buddy_id, full_name')
      .eq('id', studentId)
      .single();
    if (!student || student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'Not your student' }, { status: 403 });
    }

    // Cache key: student + ISO week-start (Sunday)
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartISO = weekStart.toISOString();
    const weekKey = weekStart.toISOString().split('T')[0];

    // Check DB cache first — survives cold starts across all serverless instances.
    // Use limit(1) instead of maybeSingle() so concurrent inserts producing duplicate rows never break the cache.
    const { data: cachedRows } = await admin
      .from('analytics_events')
      .select('metadata')
      .eq('student_id', studentId)
      .eq('event_type', 'weekly_signal_cache')
      .gte('created_at', weekStartISO)
      .order('created_at', { ascending: false })
      .limit(1);

    const cachedMeta = cachedRows?.[0]?.metadata;
    // Verify buddy_id matches — prevents stale insights surviving student reassignment.
    if (
      cachedMeta &&
      typeof cachedMeta === 'object' &&
      'insight' in cachedMeta &&
      (cachedMeta as { buddy_id?: string }).buddy_id === user.id
    ) {
      return NextResponse.json({ insight: (cachedMeta as { insight: string }).insight, cached: true });
    }

    // Fetch last 7 days of logs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logs } = await admin
      .from('daily_reports')
      .select('report_date, study_duration, topics_covered, confidence, stress, mock_score, mock_taken')
      .eq('student_id', studentId)
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('report_date', { ascending: true });

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';
    const mockLogs = (logs ?? []).filter(r => r.mock_taken);
    const latestMock = mockLogs.length > 0 ? mockLogs[mockLogs.length - 1] : null;

    const summaryJson = {
      days_logged: daysLogged,
      avg_hours_per_day: avgHours,
      avg_stress: avgStress,
      mock_taken: mockLogs.length,
      latest_mock_score: latestMock?.mock_score ?? null,
      stress_trend: logs && logs.length >= 3
        ? (logs[logs.length - 1].stress ?? 3) > (logs[0].stress ?? 3) ? 'rising' : 'falling'
        : 'stable',
    };

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: 'You are reviewing a CAT student\'s week of data for their IIM buddy. Give ONE precise observation (max 20 words) that a mentor should act on. No generic advice. Focus on the most unusual or concerning pattern. Output only the insight sentence, nothing else.',
      messages: [{
        role: 'user',
        content: `Student 7-day summary: ${JSON.stringify(summaryJson)}. Student name: ${student.full_name.split(' ')[0]}.`,
      }],
    });

    const insight = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    // Persist to DB so all serverless instances share the same cached insight
    // for the week. This MUST be awaited: fire-and-forget writes die when the
    // serverless function freezes right after the response is sent, which is
    // why zero cache rows were ever written between 11 Jun and 4 Aug — every
    // page open paid for a fresh AI call, and the weekly cache was fiction.
    const { error: cacheErr } = await admin.from('analytics_events').insert({
      student_id: studentId,
      event_type: 'weekly_signal_cache',
      metadata: { insight, week: weekKey, buddy_id: user.id },
    });
    if (cacheErr) console.error('weekly-signal cache save failed:', cacheErr.message);

    return NextResponse.json({
      insight,
      cached: false,
      stats: {
        daysLogged,
        avgHours,
        avgStress,
        mockTaken: mockLogs.length,
        latestMockScore: latestMock?.mock_score ?? null,
      },
    });
  } catch (error) {
    console.error('weekly-signal error:', error);
    return NextResponse.json(
      { error: 'Failed to generate insight', insight: '' },
      { status: 500 }
    );
  }
}
