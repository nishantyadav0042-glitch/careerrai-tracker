import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { computeDailyInsight, loadSuppressedInsightKeys, recordInsightShown } from '@/lib/daily-insight';
import { dispatch, outcomeWroteRow } from '@/lib/notification-os';
import { withCronTracking } from '@/lib/cron-run-tracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily one-liner insight (founder, 21 July) — 5 PM IST, before the evening
// study block: one specific, data-earned sentence per student ("this is the
// pattern / one advice from CareerRai"), never a generic stat dump. Students
// need ≥2 logged days (patterns need history — never-logged students are the
// activation cadence's job, not this one's). Once per day per student,
// enforced by the daily_insight notification marker; volume capped by the
// shared notification budget in dispatch().
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/daily-insight', async () => dailyInsightRun());
}

async function dailyInsightRun(): Promise<NextResponse> {
  const admin = createAdminClient();

  const todayStart =
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  const [{ data: students }, { data: sentToday }, { data: reports }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, notif_prefs, is_repeater, is_working_professional')
      .eq('role', 'student')
      .eq('onboarding_completed', true)
      .not('is_demo', 'is', true),  // test accounts stay IN: this cron IS the student experience (founder tests as a student); demo accounts are shared logins and stay out
    admin.from('notifications').select('user_id').eq('type', 'daily_insight').gte('created_at', todayStart),
    admin.from('daily_reports').select('student_id, report_date'),
  ]);

  const alreadySent = new Set((sentToday ?? []).map((n) => n.user_id as string));
  const daysByStudent = new Map<string, Set<string>>();
  for (const r of reports ?? []) {
    if (!daysByStudent.has(r.student_id as string)) daysByStudent.set(r.student_id as string, new Set());
    daysByStudent.get(r.student_id as string)!.add(r.report_date as string);
  }

  let sent = 0;
  let skipped = 0;
  for (const s of students ?? []) {
    if (alreadySent.has(s.id)) { skipped++; continue; }
    if ((daysByStudent.get(s.id)?.size ?? 0) < 2) { skipped++; continue; }

    // Same 7-day memory the home card uses — one shared authority, so the
    // push and the screen can never disagree about what is "today's" insight.
    const suppressedKeys = await loadSuppressedInsightKeys(admin, s.id).catch(() => new Set<string>());
    const insight = await computeDailyInsight(admin, s.id, {
      isRepeater: s.is_repeater === true,
      isWorkingProfessional: s.is_working_professional === true,
    }, undefined, { suppressedKeys }).catch(() => null);
    if (!insight) { skipped++; continue; }

    const outcome = await dispatch({
      userId: s.id,
      type: 'daily_insight',
      title: insight.title,
      body: insight.text,
      url: '/student/tracker',
      reason: `Daily insight · ${insight.kind}`,
      expectedAction: 'open_plan',
      prefs: (s.notif_prefs ?? {}) as Record<string, unknown>,
    });
    // ── RECORD WHAT THE STUDENT WAS SHOWN, NOT WHAT THE PUSH DID ──────────
    //
    // This gate used to be `outcome === 'sent'`, on the reasoning that "only a
    // delivered push counts as shown". That is right for budget_exhausted and
    // duplicate_suppressed — in both, dispatch() creates NO row, so nothing was
    // shown and silencing tomorrow would be wrong.
    //
    // It is WRONG for 'failed' and 'daily_cap'. In both of those dispatch() has
    // ALREADY WRITTEN THE NOTIFICATION ROW; only the push leg did not land. The
    // student still sees the insight in their tray. Skipping the record left
    // the ledger empty, so tomorrow nothing was suppressed, the same rule fired
    // again, and the same insight was written again — every day, forever.
    //
    // Measured in production 27 Aug, before this fix: of 54 students receiving
    // a daily insight in 14 days, 21 had ZERO successful sends and therefore no
    // ledger rows at all, and 28 received an IDENTICAL insight body on three or
    // more days. One account received "Only 0 of 5 VARC tasks done" on eleven
    // consecutive days with nine `failed` sends and an empty ledger.
    //
    // The condition is therefore "did a row get written", not "did the push
    // arrive" — which is exactly the distinction the delivery model already
    // draws everywhere else: the row is the EVENT, pushed_at is the DELIVERY.
    // outcomeWroteRow() is the authority, not a list repeated here. 'failed'
    // alone was ambiguous — it meant both "the insert failed" (no row) and
    // "the push failed" (row exists). dispatch() now separates them.
    const rowWasWritten = outcomeWroteRow(outcome);
    if (outcome === 'sent') sent++; else skipped++;
    if (rowWasWritten) {
      await recordInsightShown(admin, s.id, insight).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
