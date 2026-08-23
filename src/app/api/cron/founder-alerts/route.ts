import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { sendAdminAlert } from '@/lib/email';
import { findSacredFailures } from '@/lib/os/sacred-guard';

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
    const alerts = await findSacredFailures(admin, Date.now());
    const critical = alerts.filter((a) => a.severity === 'critical');

    if (critical.length === 0) {
      return NextResponse.json({ ok: true, critical: 0 });
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
      return NextResponse.json({ ok: true, critical: critical.length, newlyEscalated: 0, note: 'all already escalated' });
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

    return NextResponse.json({ ok: true, critical: critical.length, newlyEscalated: fresh.length });
  });
}

export { GET as POST };
