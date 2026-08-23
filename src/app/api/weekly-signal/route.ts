import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, GOVERNING_RULE } from '@/lib/gemini';
import { getLogDateString } from '@/lib/streak-utils';
import { readDailyLogWindow, loggedDaysOrUnknown } from '@/lib/reads/daily-log';

// Zero-cost fallback (founder, 5 Aug: "spend nothing"): when the AI is
// unavailable for any reason, the card still shows a REAL observation
// computed from the same weekly summary — never an error, never blank.
function ruleBasedInsight(s: {
  days_logged: number; avg_hours_per_day: string;
  mock_taken: number; latest_mock_score: number | null;
}, first: string): string {
  if (s.days_logged === 0) return `${first} logged 0 of the last 7 days — the week is invisible.`;
  if (s.mock_taken > 0 && s.latest_mock_score != null) return `${s.mock_taken} mock${s.mock_taken > 1 ? 's' : ''} this week, latest score ${s.latest_mock_score} — review it together.`;
  if (s.days_logged <= 3) return `Logged ${s.days_logged} of the last 7 days at ${s.avg_hours_per_day} hrs/day — consistency is the gap.`;
  return `${s.days_logged}/7 days logged, ${s.avg_hours_per_day} hrs/day.`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    // `generate` defaults to FALSE, deliberately.
    //
    // Founder, 9 Aug: "don't automatically produce AI response — someone has to
    // tap to get the response, don't make it auto ready." This card used to
    // fire Gemini from a useEffect, so simply OPENING a student's page spent an
    // AI call whether or not the buddy ever read the sentence. Now the stats
    // (which are free — they are a single table read) always come back, and the
    // AI sentence is produced only when a human asks for it.
    //
    // The default matters more than the flag: an older bundle that never learns
    // to send `generate` gets the cheap path, not the expensive one.
    const { studentId, generate } = body as { studentId: string; generate?: boolean };
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

    // 0C.3 Wave 1. Was `sevenDaysAgo = now − 7d` + `.gte()`, i.e. EIGHT
    // inclusive days, rendered on this very card as "{n}/7 days logged".
    // The window and the count both come from the authority now.
    const logWindow = await readDailyLogWindow(admin, studentId, getLogDateString());
    const daysLoggedFact = loggedDaysOrUnknown(logWindow);
    if (daysLoggedFact === null) {
      // A failed read is not a quiet zero. The card says nothing rather than
      // telling a buddy their student logged 0 of 7 days because a query died.
      return NextResponse.json({ error: 'Could not read this week\'s logs — try again shortly.' }, { status: 503 });
    }
    const logs = logWindow.state === 'value' ? logWindow.value.rows : [];

    const daysLogged = daysLoggedFact;
    const avgHours = daysLogged > 0
      ? (logs.reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const mockLogs = logs.filter(r => r.mock_taken);
    const latestMock = mockLogs.length > 0 ? mockLogs[mockLogs.length - 1] : null;

    const summaryJson = {
      days_logged: daysLogged,
      avg_hours_per_day: avgHours,
      mock_taken: mockLogs.length,
      latest_mock_score: latestMock?.mock_score ?? null,
    };

    const stats = {
      daysLogged,
      avgHours,
      mockTaken: mockLogs.length,
      latestMockScore: latestMock?.mock_score ?? null,
    };

    // Cache check happens AFTER the stats are computed, and the stats ride
    // along with the cached insight.
    //
    // This was a live defect, not a refactor: the cache used to return early
    // with `{ insight, cached: true }` and no `stats` at all, so the first
    // buddy to open a student's page in a given week saw the 2×2 grid and
    // every open after that saw an empty card. One student, one week, one
    // cache row — and the numbers vanished for the rest of the week.
    //
    // Use limit(1) rather than maybeSingle() so concurrent inserts producing
    // duplicate rows never break the cache.
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
      return NextResponse.json({
        insight: (cachedMeta as { insight: string }).insight,
        cached: true,
        stats,
      });
    }

    // No cached sentence, and nobody asked for one. Hand back the free half of
    // the card and stop here — no Gemini call, no cache row, nothing spent.
    if (!generate) {
      return NextResponse.json({ insight: null, cached: false, stats });
    }

    // Gemini (free tier, same key the timetable scanner uses), under the
    // product's governing rule: state the ONE most notable FACT of the week,
    // never a diagnosis or recommendation. Null (no key / quota / error)
    // falls through to the rule-based line — this card can no longer be dead.
    const first = student.full_name.split(' ')[0];
    const ai = await callGemini({
      system: GOVERNING_RULE,
      parts: [{
        text: `Student 7-day summary: ${JSON.stringify(summaryJson)}. Student first name: ${first}. ` +
          'State the single most notable FACT from this week for the mentor in ONE sentence, max 20 words. ' +
          'Facts only — no diagnosis, no advice. If a fact invites interpretation, append "— worth exploring why". ' +
          'Output only the sentence.',
      }],
      maxTokens: 60,
      temperature: 0.2,
    });
    const insight = ai?.trim() || ruleBasedInsight(summaryJson, first);

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

    return NextResponse.json({ insight, cached: false, stats });
  } catch (error) {
    console.error('weekly-signal error:', error);
    return NextResponse.json(
      { error: 'Failed to generate insight', insight: '' },
      { status: 500 }
    );
  }
}
