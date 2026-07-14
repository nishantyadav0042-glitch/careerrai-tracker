import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendExpedifyLead } from '@/lib/expedify';
import { buildStudentBrief } from '@/lib/student-brief';
import { deviceCallGuidance, type SignupDevice } from '@/lib/device-detect';

// 10:00 IST daily — sends the overnight signups (call-hours guard marked them
// 'queued') to Expedify so the AI calls at a human hour, never at 1 AM.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const { data: queued } = await admin
    .from('profiles')
    .select('id, full_name, phone, email, signup_source, signup_device, signup_browser, syllabus_target_date, dream_colleges, target_percentile, hours_available, coaching_enrolled, is_repeater, pain_points, wants_mentor')
    .eq('role', 'student')
    .eq('is_test_account', false)
    .eq('expedify_status', 'queued');
  if (!queued?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const s of queued) {
    if (!s.phone) continue;
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
  }
  return NextResponse.json({ sent, queued: queued.length });
}

export { POST as GET };
