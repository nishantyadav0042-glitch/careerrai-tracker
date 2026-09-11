import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { sendAdminAlert } from '@/lib/email';
import { findSacredFailures } from '@/lib/os/sacred-guard';
import { readDismissedIds, withoutDismissed } from '@/lib/os/alert-dismissal';
import { findAuthOutage } from '@/lib/os/auth-health';

export const maxDuration = 60;

// ── The Founder Alert System — active, not passive ──────────────────────────
//
// Co-founder rule, 9 Aug: "I am one founder. I cannot watch a dashboard 24×7.
// A dashboard is passive; I need an active system. If a paying student hits a
// critical problem, the system comes to me — not the other way round. But
// never notify me about something the system can safely fix itself."
//
// This runs every 15 minutes, right after reconcile-payments has had its turn.
// findSacredFailures only returns states where self-heal has ALREADY failed, so
// anything here is by definition "automatic recovery did not fix it" — the one
// bar the founder set for being interrupted.
//
// Escalation is honest about the channel it actually has. `sendAdminAlert`
// emails business@careerrai.com, a live, checked inbox. That is the interrupt
// channel today. WhatsApp/push to the founder is the next channel and needs one
// config step (a founder number + the send route); until then email carries the
// critical alerts rather than a fake WhatsApp send pretending to have gone out.
//
// Idempotent: a `founder_alert_sent` marker per alert id means a failure that
// persists across runs is escalated ONCE, not every fifteen minutes. A pager
// that cries every cycle gets muted, and a muted pager is worse than none.
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/founder-alerts', async () => {

    const admin = createAdminClient();
    const now = Date.now();

    // ── Platform auth health, checked BEFORE the per-student sweep ──────────
    //
    // Incident #70 (4 Sep): phone OTP login was dead for six hours and nothing
    // paged, because findSacredFailures only sees students who already have
    // state. A student who cannot log in never becomes a row, so the outage
    // that stopped everyone was invisible to the only alarm we had.
    //
    // It runs first and separately because it is a different KIND of failure:
    // not "one student is stuck" but "the front door is locked". If both fire
    // in the same cycle, the founder should read this one first.
    const authOutage = await escalateAuthOutage(admin, now);

    // A closed alert must not page the founder either. Pushing a notification
    // for something he has already handled by hand is precisely how these
    // interrupts stop being read.
    const [rawAlerts, dismissedIds] = await Promise.all([
      findSacredFailures(admin, now),
      readDismissedIds(admin),
    ]);
    const alerts = withoutDismissed(rawAlerts, dismissedIds);
    const critical = alerts.filter((a) => a.severity === 'critical');

    if (critical.length === 0) {
      return NextResponse.json({ ok: true, critical: 0, authOutage });
    }

    // Which of these have we already paged about? Dedupe on the stable alert id.
    const ids = critical.map((a) => a.id);
    const { data: alreadySent } = await admin
      .from('notifications')
      .select('body')
      .eq('type', 'founder_alert_sent')
      .in('body', ids);
    const seen = new Set((alreadySent ?? []).map((r: { body: string }) => r.body));

    const fresh = critical.filter((a) => !seen.has(a.id));
    if (fresh.length === 0) {
      return NextResponse.json({ ok: true, critical: critical.length, newlyEscalated: 0, note: 'all already escalated', authOutage });
    }

    const rows = fresh.map((a) => `
      <div style="border-left:4px solid #dc2626;padding:10px 14px;margin:12px 0;background:#fef2f2">
        <p style="margin:0;font-size:15px;font-weight:700;color:#1c1917">${a.title}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#57534e">${a.rootCause}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#78716c">
          ${a.student.name}${a.student.phone ? ` · ${a.student.phone}` : ''}${a.amountRupees != null ? ` · ₹${a.amountRupees}` : ''}
        </p>
        <p style="margin:8px 0 0">
          <a href="https://careerrai.in${a.actionRoute}" style="background:#1c1917;color:#fff;padding:7px 14px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">${a.actionLabel} →</a>
          ${a.student.phone ? `<a href="https://wa.me/${a.student.phone.replace(/\\D/g, '')}" style="margin-left:8px;color:#0f766e;font-size:12px;font-weight:600;text-decoration:underline">Call the student</a>` : ''}
        </p>
      </div>`).join('');

    await sendAdminAlert(
      `🔴 ${fresh.length} paid student${fresh.length === 1 ? '' : 's'} need you now`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
         <h2 style="font-size:18px;color:#1c1917">Every paid student is sacred.</h2>
         <p style="font-size:13px;color:#57534e">These are paying students the system could not recover on its own. Each has a one-click fix.</p>
         ${rows}
       </div>`,
    ).catch((e) => console.error('[founder-alerts] escalation email failed', e));

    // Mark as escalated so the next run does not re-page the same failures.
    await admin.from('notifications').insert(
      fresh.map((a) => ({
        user_id: a.student.id, type: 'founder_alert_sent', title: 'Founder alert escalated',
        body: a.id, channel: 'internal', read: true,
      })),
    );

    return NextResponse.json({ ok: true, critical: critical.length, newlyEscalated: fresh.length, authOutage });
  });
}

export { GET as POST };

// How long one auth outage stays "already paged". Short enough that a founder
// who missed the first mail gets another before the day is lost; long enough
// that a six-hour outage costs four mails, not twenty-four. Re-paging a live
// outage is deliberate — unlike a stuck student, nobody else will report it,
// because nobody can log in to report it.
const AUTH_REPAGE_HOURS = 3;

/**
 * Page the founder when the front door is locked. Returns what it decided so
 * the cron response is auditable without reading the mailbox.
 */
async function escalateAuthOutage(
  admin: ReturnType<typeof createAdminClient>,
  nowMs: number,
): Promise<{ paged: boolean; code?: string; reason?: string; note?: string }> {
  const fault = await findAuthOutage(admin, nowMs).catch((e) => {
    console.error('[founder-alerts] auth health check failed', e);
    return null;
  });
  // 'degraded' is real but not act-now; it belongs in the inbox, not the pager.
  if (!fault || fault.severity !== 'critical') {
    return { paged: false, code: fault?.code };
  }

  const since = new Date(nowMs - AUTH_REPAGE_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from('notifications')
    .select('id')
    .eq('type', 'founder_alert_sent')
    .eq('body', fault.code)
    .gte('created_at', since)
    .limit(1);
  if ((recent ?? []).length > 0) {
    return { paged: false, code: fault.code, note: 'already paged' };
  }

  const ev = fault.evidence;
  await sendAdminAlert(
    '🔴 Nobody can log in — phone OTP is not working',
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
       <h2 style="font-size:18px;color:#1c1917">The front door is locked.</h2>
       <p style="font-size:14px;color:#292524">${fault.reason}</p>
       <p style="font-size:13px;color:#57534e">
         Window: last ${ev.windowMinutes} minutes ·
         codes requested <b>${ev.requested}</b> · codes that worked <b>${ev.verified}</b>
       </p>
       <p style="font-size:13px;color:#57534e">Start here: ${ev.firstCheck}</p>
       <p style="font-size:13px;color:#57534e">
         Students with a password can still sign in with phone + password — that
         path does not touch the SMS gateway.
       </p>
       <p style="margin:14px 0 0">
         <a href="https://careerrai.in${fault.destination}" style="background:#1c1917;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">${fault.suggestedAction.label} →</a>
       </p>
     </div>`,
  ).catch((e) => console.error('[founder-alerts] auth outage email failed', e));

  // The dedupe marker needs an owner (notifications.user_id is NOT NULL) and
  // the founder is the genuine recipient. If no admin profile resolves we page
  // anyway and say so: a locked front door is worth a repeat mail, and a silent
  // outage is the exact failure this function exists to end.
  const { data: founder } = await admin
    .from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle<{ id: string }>();
  if (!founder) {
    console.error('[founder-alerts] no admin profile — auth outage will re-page every run');
    return { paged: true, code: fault.code, reason: fault.reason, note: 'no dedupe marker' };
  }
  await admin.from('notifications').insert({
    user_id: founder.id, type: 'founder_alert_sent', title: 'Auth outage escalated',
    body: fault.code, channel: 'internal', read: true,
  });

  return { paged: true, code: fault.code, reason: fault.reason };
}
