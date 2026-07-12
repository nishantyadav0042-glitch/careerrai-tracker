import { NextRequest, NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSecurityAlert } from '@/lib/alerting';

// Hourly anomaly check (Vercel cron, CRON_SECRET-gated). Aggregates the last
// hour of security signals and fires a single out-of-band alert if any threshold
// is crossed. Read-only; safe to run as often as scheduled. Thresholds are
// env-tunable so they can be tightened/loosened without a deploy.
export const dynamic = 'force-dynamic';

function threshold(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countEvents(admin: any, type: string, sinceIso: string): Promise<number> {
  const { count } = await admin
    .from('security_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', type)
    .gte('created_at', sinceIso);
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - 3_600_000).toISOString();

  const [loginLockouts, otpLockouts, serverErrors, { count: refundReqs }, { count: aiCalls }] =
    await Promise.all([
      countEvents(admin, 'login_lockout', sinceIso),
      countEvents(admin, 'otp_verify_lockout', sinceIso),
      countEvents(admin, 'server_error', sinceIso),
      admin.from('refund_requests').select('*', { count: 'exact', head: true }).gte('created_at', sinceIso),
      admin.from('analytics_events').select('*', { count: 'exact', head: true }).gte('created_at', sinceIso),
    ]);

  const metrics = {
    login_lockouts: loginLockouts,
    otp_verify_lockouts: otpLockouts,
    server_errors: serverErrors,
    refund_requests: refundReqs ?? 0,
    ai_calls: aiCalls ?? 0,
  };

  // Threshold breaches → one consolidated alert.
  const alerts: string[] = [];
  if (loginLockouts >= threshold('ALERT_LOGIN_LOCKOUTS', 10))
    alerts.push(`${loginLockouts} login lockouts/hr (possible credential stuffing)`);
  if (otpLockouts >= threshold('ALERT_OTP_LOCKOUTS', 10))
    alerts.push(`${otpLockouts} OTP-verify lockouts/hr (possible OTP brute-force)`);
  if (serverErrors >= threshold('ALERT_SERVER_ERRORS', 25))
    alerts.push(`${serverErrors} server errors/hr (elevated error rate)`);
  if ((refundReqs ?? 0) >= threshold('ALERT_REFUND_REQUESTS', 5))
    alerts.push(`${refundReqs} refund requests/hr (unusual)`);
  if ((aiCalls ?? 0) >= threshold('ALERT_AI_CALLS', 500))
    alerts.push(`${aiCalls} AI calls/hr (possible quota abuse)`);

  if (alerts.length > 0) {
    await sendSecurityAlert('anomaly detected in last hour', alerts.join('; '));
  }

  return NextResponse.json({ ok: true, window: '1h', metrics, alerted: alerts.length > 0 });
}
