import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { isRequestAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-shot production push test (founder-ordered, 21 July): a single
// highest-priority notification to every reachable student, sent from
// production infrastructure so both Google's and Apple's push services are hit
// exactly the way the daily crons hit them. Idempotent — a student who already
// has a kohli_18 row is never sent twice, so re-invoking to sweep stragglers
// is safe.
//
// Auth (hardened 24 Jul audit): requires a signed-in ADMIN session. The old
// `?key=<secret>` URL auth leaked the secret via access logs/Referer and let a
// key-holder push to any user id; the bulk response also enumerated every
// student's name (PII). Both removed.
export async function GET(request: NextRequest) {
  if (!(await isRequestAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Targeted end-to-end test: ?student=<uuid> pushes to that ONE account
  // (test accounts allowed, resend allowed) — for verifying a specific
  // device with the app force-stopped. Stamp chain: pushed_at (service
  // accepted) → received_at (device got it, app still closed) → clicked_at.
  const target = request.nextUrl.searchParams.get('student');
  if (target) {
    // 16 Aug, Notification Reliability V2 Phase 13: this remains the ONE
    // deliberate, narrow exception to "never hard-code push:true" — a
    // single-target, admin-only, explicitly-invoked device diagnostic whose
    // entire purpose is confirming the push PIPELINE itself works on one
    // named device, independent of that student's stored app-level
    // preference (an admin testing their own device, or a specific
    // student's, on request). It is exactly the "separately named,
    // explicitly documented mechanism" Phase 13 allows in place of a hidden
    // push:true — distinct type ('e2e_test'), admin-gated, single-target
    // only, never reaches a student who didn't ask. The BULK path below is
    // the one Phase 13 actually targets, and it no longer does this.
    const outcome = await dispatch({
      userId: target, type: 'e2e_test',
      title: 'CareerRai delivery test',
      body: 'If you can read this with the app closed, the push pipeline to this device is fully working.',
      url: '/student/tracker',
      reason: 'Founder-ordered end-to-end delivery test on a specific device', expectedAction: 'open_plan',
      prefs: { push: true },
    });
    const { data: sentRow } = await admin
      .from('notifications').select('id, pushed_at')
      .eq('user_id', target).eq('type', 'e2e_test')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ target, pushAccepted: outcome === 'sent', reason: outcome, notifId: sentRow?.id ?? null });
  }

  const { data: students } = await admin
    .from('profiles')
    .select('id, notif_prefs')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true)
    .not('push_subscription', 'is', null);

  const title = 'Virat ki jersey: 18. Aapke paas: 18 weeks.';
  const body =
    'Kohli is Kohli because he shows up every day. Roughly 18 weeks to CAT — give your prep that consistency. Start with today’s log.';
  const url = '/student/tracker';

  // Aggregate counts only — no per-student names in the response (PII).
  const outcomes: Record<string, number> = {};
  let pushed = 0;
  for (const s of students ?? []) {
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', s.id)
      .eq('type', 'kohli_18');
    if ((count ?? 0) > 0) {
      outcomes.already_sent = (outcomes.already_sent ?? 0) + 1;
      continue;
    }
    // 16 Aug, Phase 13: was hard-coded { push: true } — a bulk send that
    // ignored every student's actual stored preference. This is exactly the
    // "admin tool silently overriding consent" case Phase 13 targets; the
    // query already filters to students holding a live subscription, so in
    // practice this changes nothing for anyone today (every such student
    // currently also has push=true — verified in production), but it stops
    // being true by accident and starts being true by construction.
    const outcome = await dispatch({
      userId: s.id, type: 'kohli_18', title, body, url,
      reason: 'Founder-ordered live delivery test to every reachable student (21 July)',
      expectedAction: 'log_today', prefs: (s.notif_prefs as Record<string, unknown>) ?? {},
    });
    if (outcome === 'sent') {
      pushed++;
      outcomes.pushed = (outcomes.pushed ?? 0) + 1;
    } else {
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
  }

  return NextResponse.json({ eligible: (students ?? []).length, pushed, outcomes });
}
