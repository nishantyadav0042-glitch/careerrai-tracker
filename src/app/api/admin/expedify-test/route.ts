import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { sendExpedifyLead } from '@/lib/expedify';
import { buildStudentBrief } from '@/lib/student-brief';

// One-tap end-to-end test of the Expedify hand-off, admin-only. Fires a
// realistic dummy lead through the EXACT same pipeline a real signup uses and
// returns Expedify's raw response — so the founder can verify the key, URL,
// and payload from the browser without waiting for a real signup.
//
//   GET /api/admin/expedify-test?phone=9XXXXXXXXX
//
// ⚠ Uses a real phone number you control: if the integration works, Expedify's
// workflow WILL place an actual AI call to it within a minute.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const phone = normalizeIndianPhone(request.nextUrl.searchParams.get('phone'));
  if (!phone) {
    return NextResponse.json({ error: 'Pass your own number: /api/admin/expedify-test?phone=9XXXXXXXXX — Expedify will actually call it.' }, { status: 400 });
  }

  // A realistic brief, exactly the shape a real /start signup produces.
  const brief = buildStudentBrief('Test Student', {
    ambition_date: '2026-10-15',
    dream_colleges: ['IIM Ahmedabad', 'IIM Calcutta'],
    target_percentile: 95,
    hours_available: 4,
    coaching_enrolled: false,
    is_repeater: false,
    pain_points: ['consistency', 'dilr_sets'],
    wants_mentor: true,
    topic_matrix: [
      { section: 'QA', topic: 'Percentages', status: 'practicing' },
      { section: 'QA', topic: 'Algebra Basics', status: 'learning' },
      { section: 'VARC', topic: 'Reading Comprehension', status: 'learning' },
      { section: 'DILR', topic: 'Arrangements', status: 'not_started' },
      { section: 'DILR', topic: 'Games & Tournaments', status: 'not_started' },
    ],
  });

  const result = await sendExpedifyLead({
    name: 'Test Student (CareerRai)',
    phone,
    email: null,
    source: 'test',
    brief,
  });

  return NextResponse.json({
    verdict: !result.configured
      ? '❌ Not configured — add EXPEDIFY_WEBHOOK_URL (+ EXPEDIFY_API_KEY) in Vercel and redeploy.'
      : result.ok
        ? '✅ Expedify accepted the lead. If your workflow is active, the AI should call this number within a minute.'
        : '❌ Expedify rejected the request — see httpStatus/responseBody below (wrong key, suspended account, or field-name mismatch).',
    ...result,
    sentPhone: phone,
  });
}
