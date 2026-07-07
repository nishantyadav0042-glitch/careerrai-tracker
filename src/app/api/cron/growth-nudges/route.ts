import { NextRequest, NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cron-auth';

// RETIRED. This cron pitched buddy upgrades and mock discipline through
// the push channel — exactly what the founder's notification-philosophy
// discussion ruled out explicitly: "the notification should never sell...
// once students realise notifications are marketing, they're dead
// forever." Marketing has other surfaces (in-app cards, the homepage
// mentor recommendation); the push channel stays reserved for
// /api/cron/decision-engine's real preparation signals. Route kept (not
// deleted) so this is a one-line revert if the call is wrong.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ retired: true, reason: 'notifications must never sell — see decision-engine philosophy' });
}

export { POST as GET };
