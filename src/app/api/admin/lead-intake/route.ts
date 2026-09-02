import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { salesPrincipal } from '@/lib/sales-authz';
import { runLeadIntake } from '@/lib/lead-intake';

// "Run today's intake now" — the founder's button on /admin/sales/capacity.
//
// The same engine the scheduler runs, with the admin recorded as the actor.
// Safe to press twice: the daily fuse and ON CONFLICT DO NOTHING make a
// second run in the same day a no-op that says so.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const run = await runLeadIntake(admin, { trigger: 'admin', actorId: principal.id });
  return NextResponse.json(run, { status: run.state === 'SOURCE_UNAVAILABLE' ? 503 : run.state === 'PARTIAL' ? 500 : 200 });
}
