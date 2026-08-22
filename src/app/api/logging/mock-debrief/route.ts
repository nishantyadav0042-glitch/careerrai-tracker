import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { getLogDateString } from '@/lib/streak-utils';

import { readMockEvidence, headlineEvidence, type MockEvidence } from '@/lib/evidence/mock-evidence';

interface DebriefRequest {
  log_date: string;
  overall_percentile?: number | null;
  varc?: { attempted: number; correct: number; time_min: number; percentile: number | null };
  dilr?: { attempted: number; correct: number; time_min: number; percentile: number | null };
  qa?: { attempted: number; correct: number; time_min: number; percentile: number | null };
  error_buckets?: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note?: string;
}

interface ErrorBuckets {
  conceptual: number;
  silly: number;
  time: number;
  panic: number;
  selection: number;
}

// Precedence, locked 22 Aug: MEASURED EVIDENCE > SELF-REPORT > GENERIC.
// The order below is that rule, not a style choice. What a student's own
// scorecard measured about their ability outranks a rank movement, which
// outranks the error buckets they hand-tagged (1 student in 24 mocks has
// ever filled those), which outranks restating the percentile back at them.
function computeInsight(
  evidence: MockEvidence,
  overall_percentile: number | null,
  error_buckets: ErrorBuckets,
  prevPercentile: number | null
): string | null {
  // 1. Measured ability from this mock's own numbers.
  const measured = headlineEvidence(evidence);
  if (measured) return measured.text;

  // Percentile movement takes priority if we have two data points
  if (overall_percentile != null && prevPercentile != null) {
    const delta = overall_percentile - prevPercentile;
    if (Math.abs(delta) >= 2) {
      const cur = Math.round(overall_percentile);
      const prev = Math.round(prevPercentile);
      const mag = Math.abs(Math.round(delta));
      return delta > 0
        ? `Percentile rose ${prev}→${cur} — up ${mag} point${mag === 1 ? '' : 's'}.`
        : `Percentile moved ${prev}→${cur} — down ${mag} points.`;
    }
  }

  // Dominant error bucket
  const total = Object.values(error_buckets).reduce((a, b) => a + b, 0);
  if (total > 0) {
    const dominant = (Object.entries(error_buckets) as [keyof ErrorBuckets, number][])
      .sort(([, a], [, b]) => b - a)[0];
    const [bucket, count] = dominant;
    const pct = Math.round((count / total) * 100);
    const labels: Record<keyof ErrorBuckets, string> = {
      conceptual: 'knowledge-gap',
      silly: 'execution',
      time: 'time-misallocation',
      panic: 'misread/framing',
      selection: 'selection',
    };
    return `${count} of ${total} logged errors were ${labels[bucket]} (${pct}%).`;
  }

  // Bare percentile if nothing else
  if (overall_percentile != null) {
    return `Mock logged at ${overall_percentile}%ile.`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as DebriefRequest;

    const admin = createAdminClient();

    // ── THE SERVER OWNS THE MOCK'S DATE ─────────────────────────────────
    //
    // Founder, 14 Aug: "after filling the log, the mock date." The mock rides
    // on the daily log, so the log decides when it happened. The browser does
    // not.
    //
    // This used to accept body.log_date after checking only its SHAPE, and
    // that value came from the DEVICE clock. It is not cosmetic: taken_on is
    // what mockInformedFocus reads to decide which section the plan attacks,
    // and log_date is matched against today to claim "score recorded". A phone
    // with a wrong timezone — or anything hand-rolling this request — could
    // write a mock dated any day it liked and permanently steer a student's
    // plan from a date that never happened.
    //
    // The date is now DERIVED, in this order:
    //   1. the student's most recent daily log within today/yesterday — the
    //      log they just filled, which is exactly what the founder described
    //   2. failing that, the server's own study day
    //
    // A client-sent log_date is still read, but only as a PREFERENCE between
    // those two server-known days; it can never introduce a third date.
    const todayStr = getLogDateString();
    const yesterdayStr = new Date(Date.parse(todayStr + 'T00:00:00.000Z') - 86_400_000)
      .toISOString().slice(0, 10);

    const { data: recentLogs } = await admin
      .from('daily_reports')
      .select('report_date')
      .eq('student_id', user.id)
      .in('report_date', [todayStr, yesterdayStr])
      .order('report_date', { ascending: false })
      .limit(2);

    const loggedDays = (recentLogs ?? []).map((r: { report_date: string }) => r.report_date);
    const asked = typeof body.log_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.log_date)
      ? body.log_date
      : null;

    // The log the mock belongs to. Honour the student's ask only when it names
    // a day they actually logged; otherwise the newest log; otherwise today.
    const takenOn =
      (asked && loggedDays.includes(asked) ? asked : null)
      ?? loggedDays[0]
      ?? todayStr;

    const row = {
      student_id: user.id,
      taken_on: takenOn,
      log_date: takenOn,
      varc: body.varc ?? {},
      dilr: body.dilr ?? {},
      qa: body.qa ?? {},
      error_buckets: body.error_buckets ?? { conceptual: 0, silly: 0, time: 0, panic: 0, selection: 0 },
      strategy_note: body.strategy_note?.trim() ?? null,
      overall_percentile: body.overall_percentile ?? null,
    };

    // Fetch the chronologically-previous debrief to compute the delta.
    const { data: prevDebriefs } = await admin
      .from('mock_debriefs')
      .select('overall_percentile')
      .eq('student_id', user.id)
      .lt('taken_on', takenOn)
      .order('taken_on', { ascending: false })
      .limit(1);
    const prevPercentile = prevDebriefs?.[0]?.overall_percentile ?? null;

    // Upsert — one debrief per log date
    const { error } = await admin
      .from('mock_debriefs')
      .upsert(row, { onConflict: 'student_id,log_date' })
      .select()
      .single();

    if (error) {
      const { error: insertError } = await admin.from('mock_debriefs').insert(row);
      if (insertError) {
        console.error('Mock debrief save failed:', error.message, insertError.message);
        return NextResponse.json({ error: 'Could not save debrief' }, { status: 500 });
      }
    }

    // Keep CRS live: latest mock percentile becomes the profile's cat_percentile
    if (body.overall_percentile != null) {
      await admin
        .from('profiles')
        .update({ cat_percentile: body.overall_percentile })
        .eq('id', user.id);
    }

    // Evidence is read from the row we actually stored, never from the request
    // body: what the student is told must match what the database now holds.
    const evidence = readMockEvidence(row);
    const insight = computeInsight(
      evidence,
      body.overall_percentile ?? null,
      row.error_buckets,
      prevPercentile
    );

    // Notify buddy that student took a mock (non-blocking)
    void (async () => {
      try {
        const { data: studentProfile } = await admin
          .from('profiles')
          .select('full_name, buddy_id, cat_percentile')
          .eq('id', user.id)
          .single();
        const buddyId = studentProfile?.buddy_id;
        if (!buddyId) return;

        const studentFirst = studentProfile.full_name?.split(' ')[0] ?? 'Student';
        const percentileStr = body.overall_percentile != null ? ` (${body.overall_percentile}%ile)` : '';
        const title = `${studentFirst} submitted a mock${percentileStr} — they're waiting for your feedback.`;
        const notifBody = 'Mock debrief submitted — feedback within 24h keeps the momentum.';

        const { data: buddyPrefs } = await admin.from('profiles').select('notif_prefs').eq('id', buddyId).single();
        await dispatch({
          userId: buddyId, type: 'mock_submitted', title, body: notifBody,
          url: `/buddy/students/${user.id}`, data: { student_id: user.id },
          reason: 'Student submitted a mock debrief — awaiting buddy feedback', expectedAction: 'acknowledge',
          prefs: (buddyPrefs?.notif_prefs as Record<string, unknown>) ?? {},
        });
      } catch {
        // non-fatal
      }
    })();

    return NextResponse.json(
      { success: true, insight, evidence: evidence.items, measured: evidence.hasMeasuredAbility },
      { status: 200 },
    );
  } catch (err) {
    console.error('Mock debrief error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
