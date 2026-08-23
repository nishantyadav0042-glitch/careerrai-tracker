import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { sendExpedifyLead } from '@/lib/expedify';
import { buildStudentBrief } from '@/lib/student-brief';
import { deviceCallGuidance, type SignupDevice } from '@/lib/device-detect';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// Daily flush — every queued student signed up earlier and has now had time to
// self-activate. We send to Expedify ONLY the leads still un-activated (not
// installed, or notifications off) — a call to someone who already installed
// AND switched on notifications is wasted (founder, 24 Jul). Activated students
// are marked 'skipped_activated' and never called.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/expedify-flush', async () => {
    const admin = createAdminClient();

    const { data: queued } = await admin
      .from('profiles')
      .select('id, full_name, phone, email, signup_source, signup_device, signup_browser, app_installed, notif_prefs, syllabus_target_date, dream_colleges, target_percentile, hours_available, coaching_enrolled, is_repeater, pain_points, wants_mentor')
      .eq('role', 'student')
      .eq('is_test_account', false)
      .eq('expedify_status', 'queued');
    if (!queued?.length) return NextResponse.json({ sent: 0 });

    let sent = 0;
    let skipped = 0;
    for (const s of queued) {
      if (!s.phone) continue;

      // Activated already? (installed the app AND turned notifications on) — no
      // call needed. Mark and skip so it's never picked up again.
      const prefs = (s.notif_prefs ?? {}) as { push?: boolean };
      if (s.app_installed === true && prefs.push === true) {
        await admin.from('profiles').update({ expedify_status: 'skipped_activated' })
          .eq('id', s.id).eq('expedify_status', 'queued');
        skipped++;
        continue;
      }

      try {
        // Atomically claim this row before doing anything else (bug audit,
        // 14 July): if two flush runs somehow overlap, or sendExpedifyLead's
        // own status-write fails silently after a real call was placed, the
        // row would stay 'queued' and get RE-SENT — a second AI call to the
        // same student, real money and a bad first impression. Flipping to
        // 'sending' up front is a distinct state the .eq('queued') filter on
        // any other run will never match, closing that window even if the
        // final sent/failed write below never lands.
        const { data: claimed } = await admin
          .from('profiles')
          .update({ expedify_status: 'sending' })
          .eq('id', s.id)
          .eq('expedify_status', 'queued')
          .select('id');
        if (!claimed || claimed.length === 0) continue; // already claimed elsewhere

        const { data: coverage } = await admin
          .from('topic_coverage').select('section, topic, status').eq('student_id', s.id);
        const device: SignupDevice = {
          device: (s.signup_device as SignupDevice['device']) ?? 'other',
          browser: (s.signup_browser as SignupDevice['browser']) ?? 'other',
          label: `${s.signup_device === 'ios' ? 'iPhone' : s.signup_device === 'android' ? 'Android' : 'Unknown device'} · ${s.signup_browser ?? 'unknown browser'}`,
        };
        const brief = buildStudentBrief((s.full_name as string) ?? 'there', {
          ambition_date: s.syllabus_target_date,
          dream_colleges: s.dream_colleges,
          target_percentile: s.target_percentile,
          hours_available: s.hours_available,
          coaching_enrolled: s.coaching_enrolled,
          is_repeater: s.is_repeater,
          pain_points: s.pain_points,
          wants_mentor: s.wants_mentor,
          topic_matrix: coverage ?? [],
        }, { label: device.label, guidance: deviceCallGuidance(device) });

        const res = await sendExpedifyLead({
          studentId: s.id as string,
          name: (s.full_name as string) ?? 'there',
          phone: s.phone as string,
          email: (s.email as string | null) ?? null,
          source: (s.signup_source as string | null) ?? 'self_serve',
          brief,
        });
        if (res.ok) sent++;
      } catch (err) {
        // One lead's failure must never strand the rest of the batch (bug
        // audit, 14 July) — the old loop had no per-lead try/catch.
        console.error('[expedify-flush] lead failed:', s.id, err);
      }
    }
    return NextResponse.json({ sent, skipped, queued: queued.length });
  });
}

export { POST as GET };
