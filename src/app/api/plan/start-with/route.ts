import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QA_GROUPS } from '@/lib/topics-constants';
import { serverError } from '@/lib/api-error';

// POST /api/plan/start-with { cluster } — "Start my preparation with
// Arithmetic / Algebra / Geometry / Modern Math / Number System", or null for
// "Let CareerRai decide". Biases the Topic Selector toward that cluster;
// prerequisites and revision-due still apply, so ownership never breaks
// sequencing. (The advisor-refined version of the "priority" ask.)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { cluster?: unknown };
  const cluster = typeof body.cluster === 'string' ? body.cluster : null;
  if (cluster != null && !QA_GROUPS.some((g) => g.label === cluster)) {
    return NextResponse.json({ error: 'Unknown cluster' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ start_with: cluster }).eq('id', user.id);
  if (error) return serverError('start-with', error);
  return NextResponse.json({ ok: true, cluster });
}
