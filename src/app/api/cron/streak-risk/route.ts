import { NextRequest, NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cron-auth';

// RETIRED. This cron's entire reason to exist was loss-aversion copy
// ("Streak TOOT jayegi", "Itna aage aake rukna?") — named explicitly on
// the founder's "delete forever" list during the notification-philosophy
// discussion. /api/cron/decision-engine replaces it: streak protection is
// now folded into that engine's silence-by-default model rather than a
// dedicated guilt cron. Route kept (not deleted) purely so vercel.json's
// removal of its schedule is the only revert needed if this call is wrong.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ retired: true, replacedBy: '/api/cron/decision-engine' });
}

export { POST as GET };
