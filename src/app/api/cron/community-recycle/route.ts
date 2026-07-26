import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { recycleCommunityPool } from '@/lib/community-recycle';

export const maxDuration = 60;

// Daily at 02:00 UTC (07:30 IST) — before the 8am study day begins, so the
// shelf is stocked by the time the first student opens Daily Pick.
//
// Grades every closed voting window, promotes what earned it to a permanent
// place, archives the rest, and refills the shelf from the archive if it ever
// fell below the minimum. Idempotent: a double-run is a no-op.

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  try {
    const result = await recycleCommunityPool(admin);
    console.log('[community-recycle]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[community-recycle] failed', e);
    return NextResponse.json({ error: 'Recycle failed' }, { status: 500 });
  }
}

// GET for manual runs from the admin desk / a browser check.
export const GET = POST;
