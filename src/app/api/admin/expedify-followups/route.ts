import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { sendExpedifyLead } from '@/lib/expedify';
import { buildStudentBrief } from '@/lib/student-brief';
import { deviceCallGuidance, type SignupDevice } from '@/lib/device-detect';
import { getSalesReadyToCall } from '@/lib/admin-filters';

// Batch follow-up hand-off: takes the TOP OF THE SALES QUEUE and hands each
// student to Expedify as a `follow_up` lead, so its AI agent calls them today.
//
//   GET /api/admin/expedify-followups?limit=20            → dry run, sends nothing
//   GET /api/admin/expedify-followups?limit=20&send=1     → actually dials
//
// Admin-only. Default is a DRY RUN: this endpoint spends money and rings real
// students' phones, so seeing the exact list before it fires is the default and
// `send=1` is the deliberate act.
//
// Why this exists rather than the flush cron: that cron only handles the signup
// queue (expedify_status = 'queued') — brand-new students who haven't activated.
// These are established students being re-engaged, which is a different lead
// type on Expedify's side and a different state machine on ours.
export const maxDuration = 300;

// The queue's #1 is the single hottest lead we have. Founder, 29 Jul: don't
// spend it on an agent test — that call is worth making personally. Skipping
// the top N is therefore the DEFAULT, not an opt-in.
const DEFAULT_SKIP_TOP = 1;

// Never dial the same student twice inside this window, even if the URL is
// opened again or two runs overlap.
const COOLDOWN_DAYS = 14;

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Same CSRF reasoning as /api/admin/expedify-test: this GET places real phone
  // calls, so a logged-in admin must not be able to trigger it from a crafted
  // <img>/<a> on another site. A cross-site GET never carries this header.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-site request blocked.' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Number(params.get('limit') ?? 20)));
  const skipTop = Math.max(0, Number(params.get('skipTop') ?? DEFAULT_SKIP_TOP));
  const send = params.get('send') === '1';

  // ONE definition of "who is ready for the buddy call", shared with
  // /admin/sales-queue and the dashboard count. A second ranking here would
  // mean the founder's screen and the dialler disagree about who is hottest.
  const queue = await getSalesReadyToCall(admin);

  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();
  const ids = queue.map((r) => r.id);
  // A plain .in() read plus a JS comparison, deliberately — the same call this
  // codebase already made for the Daily Pick shelf. A nested PostgREST
  // or(...)/and(...) is a filter no test can exercise, and the thing hanging off
  // this one is whether a real student's phone rings twice.
  const { data: prior } = ids.length
    ? await admin.from('profiles').select('id, expedify_followup_at').in('id', ids)
    : { data: [] };
  const lastFollowUp = new Map<string, string | null>(
    (prior ?? []).map((r) => [r.id as string, (r.expedify_followup_at as string | null) ?? null]),
  );
  const onCooldown = new Set(
    [...lastFollowUp.entries()].filter(([, at]) => at != null && at >= cutoff).map(([id]) => id),
  );

  const skipped: { name: string | null; reason: string }[] = [];
  const eligible: typeof queue = [];
  queue.forEach((row, rank) => {
    if (rank < skipTop) { skipped.push({ name: row.full_name, reason: `top ${skipTop} — reserved for a personal call` }); return; }
    if (onCooldown.has(row.id)) { skipped.push({ name: row.full_name, reason: `called within ${COOLDOWN_DAYS} days` }); return; }
    // A number Expedify can't dial is worse than no lead: it burns a slot and
    // reports a failure that looks like an agent bug. 3 of the top 25 are
    // stored without the +91 country code, so normalise before deciding.
    if (!normalizeIndianPhone(row.phone)) { skipped.push({ name: row.full_name, reason: 'no usable phone number' }); return; }
    if (eligible.length < limit) eligible.push(row);
  });

  const results: { name: string | null; phone: string; ok: boolean; status: number | null; error: string | null }[] = [];

  for (const row of eligible) {
    const phone = normalizeIndianPhone(row.phone)!;
    if (!send) {
      results.push({ name: row.full_name, phone, ok: false, status: null, error: 'dry run — add &send=1 to dial' });
      continue;
    }
    try {
      // Claim before dialling, exactly as the flush cron does: stamp first, so
      // an overlapping run or a lost response can never produce a second call.
      //
      // The compare-and-set predicate is ONE plain filter, chosen from what we
      // read a moment ago: never-called rows must still be null, previously-
      // called rows must still be older than the cutoff. Either way a
      // concurrent run that already stamped this student matches neither, so it
      // claims nothing and no second call goes out.
      const claim = admin
        .from('profiles')
        .update({ expedify_followup_at: new Date().toISOString() })
        .eq('id', row.id);
      const guarded = lastFollowUp.get(row.id) == null
        ? claim.is('expedify_followup_at', null)
        : claim.lt('expedify_followup_at', cutoff);
      const { data: claimed } = await guarded
        .select('id, full_name, email, signup_device, signup_browser, signup_source, syllabus_target_date, dream_colleges, target_percentile, hours_available, coaching_enrolled, is_repeater, pain_points, wants_mentor');
      if (!claimed || claimed.length === 0) { continue; } // someone else got it
      const s = claimed[0];

      const { data: coverage } = await admin
        .from('topic_coverage').select('section, topic, status').eq('student_id', row.id);

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
        // studentId is deliberately OMITTED: passing it makes sendExpedifyLead
        // write expedify_status, which would overwrite this student's SIGNUP
        // call outcome with a follow-up result. expedify_followup_at above is
        // this dispatch's own record.
        name: (s.full_name as string) ?? 'there',
        phone,
        email: (s.email as string | null) ?? null,
        source: (s.signup_source as string | null) ?? 'sales_queue',
        leadType: 'follow_up',
        brief,
      });
      results.push({ name: row.full_name, phone, ok: res.ok, status: res.httpStatus, error: res.error ?? (res.ok ? null : res.responseBody) });
    } catch (err) {
      // One lead's failure must never strand the rest of the batch.
      console.error('[expedify-followups] lead failed:', row.id, err);
      results.push({ name: row.full_name, phone, ok: false, status: null, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    dryRun: !send,
    queueSize: queue.length,
    attempted: results.length,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.error?.startsWith('dry run')).length,
    skipped,
    results,
  });
}
