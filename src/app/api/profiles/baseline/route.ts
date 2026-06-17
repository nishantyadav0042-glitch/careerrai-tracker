// POST /api/profiles/baseline
// Saves the student's diagnostic baseline and LOCKS it.
// Non-admin users cannot overwrite a locked baseline — enforced here, not just in the UI.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BASELINE_FIELDS = [
  'starting_percentile',
  'baseline_varc',
  'baseline_dilr',
  'baseline_qa',
  'baseline_mocks_taken',
] as const;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role, baseline_locked')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const isAdmin = profile.role === 'admin';

  if (profile.baseline_locked && !isAdmin) {
    return NextResponse.json(
      { error: 'Baseline is locked. Contact support to update your diagnostic scores.' },
      { status: 403 }
    );
  }

  const body = await req.json() as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  for (const field of BASELINE_FIELDS) {
    if (field in body) {
      const val = body[field];
      updates[field] = val === '' || val === null ? null : Number(val);
    }
  }

  // Lock on first save (non-admin). Admin saves don't re-lock (they may be correcting data).
  if (!isAdmin) {
    updates.baseline_locked = true;
  }

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.error('[baseline] update error:', error);
    return NextResponse.json({ error: 'Failed to save baseline' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, locked: !isAdmin });
}
