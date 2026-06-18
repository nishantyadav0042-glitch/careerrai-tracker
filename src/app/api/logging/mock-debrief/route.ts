import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';

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

function computeInsight(
  overall_percentile: number | null,
  error_buckets: ErrorBuckets,
  prevPercentile: number | null
): string | null {
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

    if (!body.log_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.log_date)) {
      return NextResponse.json({ error: 'Invalid log_date' }, { status: 400 });
    }

    const admin = createAdminClient();

    const row = {
      student_id: user.id,
      taken_on: body.log_date,
      log_date: body.log_date,
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
      .lt('taken_on', body.log_date)
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

    const insight = computeInsight(
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

        await admin.from('notifications').insert({
          user_id: buddyId, type: 'mock_submitted',
          title, body: notifBody,
          data: { url: `/buddy/students/${user.id}`, student_id: user.id }, read: false, channel: 'in_app',
        });

        const { data: buddyPrefs } = await admin.from('profiles').select('notif_prefs').eq('id', buddyId).single();
        if ((buddyPrefs?.notif_prefs as Record<string, unknown>)?.push === true) {
          await sendPushToUser(buddyId, { title, body: notifBody, url: `/buddy/students/${user.id}` });
        }
      } catch {
        // non-fatal
      }
    })();

    return NextResponse.json({ success: true, insight }, { status: 200 });
  } catch (err) {
    console.error('Mock debrief error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
