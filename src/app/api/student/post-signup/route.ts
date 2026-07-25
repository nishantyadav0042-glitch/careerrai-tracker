import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { remainingSyllabusHours, remainingMockHours, computeRequiredPace } from '@/lib/study-pace';
import { serverError } from '@/lib/api-error';

// Persists the post-login sequence: the date the student (re)confirms in the
// reconciliation step, and the one-time "done" flag once they finish it.
// Every field is whitelisted and validated — the client can only ever move
// their own target date/hours and mark the ceremony seen, nothing else.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    syllabus_target_date?: unknown;
    study_target_hours?: unknown;
    done?: unknown;
  };

  const update: Record<string, unknown> = {};

  if (typeof body.syllabus_target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.syllabus_target_date)) {
    update.syllabus_target_date = body.syllabus_target_date;
  }
  if (typeof body.study_target_hours === 'number' && body.study_target_hours > 0 && body.study_target_hours <= 16) {
    // Round to the nearest half-hour and mirror to both columns the routine
    // engine reads, matching the finish-date chooser.
    const h = Math.round(body.study_target_hours * 2) / 2;
    update.study_target_hours = h;                 // numeric — keeps the half-hour
    update.hours_available = Math.round(h);         // smallint columns — whole hours only
    update.weekend_hours_available = Math.round(h);
  }
  if (body.done === true) update.post_signup_done = true;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // A date change WITHOUT explicit hours (the Reschedule control) re-derives
  // the daily commitment from the same per-topic pace model as the ring —
  // remaining syllabus hours ÷ days to the new date — so the ring, today's
  // plan, and the stored commitment all move together. Never left stale.
  if (update.syllabus_target_date && update.study_target_hours == null) {
    const { data: coverage } = await admin
      .from('topic_coverage')
      .select('topic, status')
      .eq('student_id', user.id);
    const remaining = remainingSyllabusHours(coverage ?? []);
    if (remaining > 0) {
      // Through computeRequiredPace — the ONE pace implementation. The 1..12
      // clamp is plan-sizing policy, stated here where the clamped value is
      // persisted so the clamp is visible next to the write it shapes.
      const pace = computeRequiredPace({
        remainingHours: remaining, today: new Date(),
        targetDate: new Date((update.syllabus_target_date as string) + 'T00:00:00'),
        committedPerDay: null, mockHours: remainingMockHours(remaining),
      });
      const h = Math.min(12, Math.max(1, pace.requiredPerDay));
      update.study_target_hours = h;                 // numeric — keeps the half-hour (e.g. 6.5)
      update.hours_available = Math.round(h);         // smallint columns — whole hours only
      update.weekend_hours_available = Math.round(h);
    }
  }

  const { error } = await admin.from('profiles').update(update).eq('id', user.id);
  if (error) return serverError('post-signup', error);
  return NextResponse.json({ ok: true });
}
