import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { setDailyHours } from '@/lib/daily-hours';
import { serverError } from '@/lib/api-error';
import { selectableCatCycles } from '@/lib/cat-cycle';

const FOCUS_SECTIONS = ['VARC', 'DILR', 'QA'] as const;

// Persists the post-login sequence: the date the student (re)confirms in the
// reconciliation step, and the one-time "done" flag once they finish it.
// Every field is whitelisted and validated — the client can only ever move
// their own target date/hours and mark the ceremony seen, nothing else.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    syllabus_target_date?: unknown;
    daily_hours?: unknown;
    done?: unknown;
    attempt_year?: unknown;
    weakest_section?: unknown;
  };

  const update: Record<string, unknown> = {};

  if (typeof body.syllabus_target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.syllabus_target_date)) {
    update.syllabus_target_date = body.syllabus_target_date;
  }
  if (typeof body.daily_hours === 'number') {
    // Through setDailyHours — the ONE writer. This is a number the student
    // themselves just typed, so the provenance is 'student' and the confirm
    // prompt (if it was showing) goes away for good.
    Object.assign(update, setDailyHours(body.daily_hours, 'student'));
  }
  if (body.done === true) update.post_signup_done = true;

  // ── WHICH CAT, AND WHAT TO LEAD WITH (sales-reported fixes, 23 Sep) ──────
  //
  // 190 students who joined in July were never asked their exam year, so
  // every surface fell back to the current year: a 2027 aspirant was shown a
  // CAT 2026 countdown and had no way to change it (Neelam's call with Harsh,
  // 9 Sep). And the section a student is weakest in — the section the plan
  // LEADS with every day (routine-engine dayShape) — was asked once at signup
  // and could never be changed ("difficulty customising the schedule when he
  // wants more focus on Quant", Anshul, 23 Sep).
  //
  // Both are the student's own answers, so both are writable only from here,
  // only by them, and only to values the product can honour: a cycle whose
  // syllabus window is still open, and one of the three sections. Either
  // change shapes TOMORROW's plan; today's frozen plan is left alone
  // (plan-freshness.ts owns when a plan may rebuild, and this is not one).
  if (body.attempt_year !== undefined) {
    const years = selectableCatCycles(new Date(), 3).map((c) => c.year);
    if (typeof body.attempt_year !== 'number' || !years.includes(body.attempt_year)) {
      return NextResponse.json({ error: `Exam year must be one of ${years.join(', ')}.` }, { status: 400 });
    }
    update.attempt_year = body.attempt_year;
  }
  if (body.weakest_section !== undefined) {
    if (typeof body.weakest_section !== 'string' || !(FOCUS_SECTIONS as readonly string[]).includes(body.weakest_section)) {
      return NextResponse.json({ error: 'Focus section must be VARC, DILR or QA.' }, { status: 400 });
    }
    update.self_reported_weakest_section = body.weakest_section;
    // A chosen section is a SELECTED_SECTION answer, never "not sure".
    update.self_report_status = 'SELECTED_SECTION';
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // A DATE CHANGE NO LONGER TOUCHES THE HOURS.
  //
  // This is where the whole "one number" problem lived. Rescheduling used to
  // re-derive the daily commitment from remaining syllabus ÷ days to the new
  // date and write it straight over study_target_hours — silently, with no
  // record of what the student had actually chosen. Move your date out by a
  // month and your 11-hour commitment became 6 without anyone telling you;
  // move it in, and it became 12. One student asked why an 11-hour plan gave
  // her four hours of tasks, and this write is a large part of the answer.
  //
  // Founder, 6 Aug: "don't change the hours on your own, unless the student
  // themselves makes the change or plans again. You won't take any action
  // yourself." So the date moves alone. The PaceCard tells them what the new
  // date costs at their existing hours BEFORE they confirm it, and if they
  // want to study more they change that number themselves, in one place.

  const { error } = await admin.from('profiles').update(update).eq('id', user.id);
  if (error) return serverError('post-signup', error);
  return NextResponse.json({ ok: true });
}
