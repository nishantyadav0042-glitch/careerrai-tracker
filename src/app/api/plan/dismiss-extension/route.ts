import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Persist the dismiss — see plan-extended-alert.tsx's header note ─────────
//
// The banner was supposed to be "shown once" (founder, 6 Aug) but the X only
// ever set local component state, so every reload/reopen reset it to
// visible again. This is the write the dismiss was always missing: mark the
// specific extension row so the server-side query in tracker/page.tsx can
// exclude it going forward, on every device, permanently — not just for the
// current tab.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('plan_extensions')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('student_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
