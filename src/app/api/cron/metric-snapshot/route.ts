import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { computeHealthScalars, evaluateAlerts, type HealthScalars } from '@/lib/mission-control';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Hourly Mission Control snapshot: records the headline health scalars so the
// live page can show deltas (▲/▼ vs yesterday), and fires an admin alert the
// moment a threshold breaches — so nobody has to be staring at the dashboard.
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/metric-snapshot', async () => {
    const admin = createAdminClient();

    const now = await computeHealthScalars(admin);

    // Previous snapshot for delta + alert comparison.
    const { data: prevRows } = await admin
      .from('metric_snapshots').select('metrics').order('captured_at', { ascending: false }).limit(1);
    const prev = (prevRows?.[0]?.metrics as HealthScalars | undefined) ?? null;

    await admin.from('metric_snapshots').insert({ metrics: now });

    const alerts = evaluateAlerts(now, prev);
    if (alerts.length > 0) {
      try {
        const { sendAdminAlert } = await import('@/lib/email');
        const body = alerts.map((a) => `<p><strong>[${a.level.toUpperCase()}] ${a.metric}</strong> — ${a.message}</p>`).join('');
        await sendAdminAlert(`⚠️ Mission Control: ${alerts.length} alert${alerts.length === 1 ? '' : 's'}`, body);
      } catch (e) {
        console.error('[metric-snapshot] alert email failed:', e);
      }
    }

    return NextResponse.json({ snapshot: now, alerts });
  });
}
