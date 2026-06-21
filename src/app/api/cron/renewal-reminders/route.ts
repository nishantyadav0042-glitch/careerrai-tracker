import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';

// Kind dunning: nudge active students before their term ends so the journey
// never lapses by surprise. Reminds at 7, 3 and 1 days out. Runs daily.
const THRESHOLDS = [7, 3, 1];
const MS_PER_DAY = 86_400_000;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const windowEnd = new Date(now + 8 * MS_PER_DAY).toISOString();

  const { data: upcoming, error } = await admin
    .from('profiles')
    .select('id, subscription_renews_at')
    .eq('subscription_status', 'active')
    .not('subscription_renews_at', 'is', null)
    .lte('subscription_renews_at', windowEnd)
    .gt('subscription_renews_at', new Date(now).toISOString());

  if (error) {
    console.error('[renewal-reminders]', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
  if (!upcoming?.length) return NextResponse.json({ reminded: 0 });

  let reminded = 0;
  for (const p of upcoming) {
    const daysLeft = Math.ceil((new Date(p.subscription_renews_at as string).getTime() - now) / MS_PER_DAY);
    if (!THRESHOLDS.includes(daysLeft)) continue;

    // Dedup: don't send the same threshold twice (cron may run more than once).
    const since = new Date(now - 20 * 3600 * 1000).toISOString();
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', p.id)
      .eq('type', 'renewal_reminder')
      .contains('data', { days: daysLeft })
      .gte('created_at', since)
      .maybeSingle();
    if (existing) continue;

    await admin.from('notifications').insert({
      user_id: p.id,
      type: 'renewal_reminder',
      title: daysLeft === 1 ? 'Your journey pauses tomorrow' : `Your journey pauses in ${daysLeft} days`,
      body: 'Reactivate from your profile to keep your streak, mocks, debriefs and buddy without a break.',
      data: { days: daysLeft },
      read: false,
      channel: 'in_app',
    });
    reminded++;
  }

  return NextResponse.json({ reminded });
}

export { POST as GET };
