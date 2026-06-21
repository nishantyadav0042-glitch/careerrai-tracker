import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Daily cron: re-anchors the read-only demo account's dates relative to "today"
// so the demo never looks stale — the latest mock stays ~3 days old, the booked
// "mock analysis together" session stays ~2 days out, feedback stays recent, and
// the daily-log streak stays unbroken ending yesterday. All handled by the
// refresh_demo_dates() Postgres function.
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; also accept the
  // app's existing x-cron-secret convention.
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (request.headers.get('x-cron-secret') === secret) return true;
  return false;
}

async function run(): Promise<NextResponse> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('refresh_demo_dates');
  if (error) {
    console.error('[refresh-demo] rpc error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}
