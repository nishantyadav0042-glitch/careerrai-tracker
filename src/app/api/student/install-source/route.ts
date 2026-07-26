import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

// POST /api/student/install-source — records where a student installed from,
// exactly once. First value wins: a student who installs from Play and later
// opens the site in a browser tab stays a "play" student, because the question
// this answers is "which channel produced this student", not "which window are
// they in right now" (journey.ts's display_mode already answers that).
const VALID = ['play', 'pwa', 'ios', 'browser'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { source } = await request.json().catch(() => ({ source: null }));
  if (typeof source !== 'string' || !VALID.includes(source)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createAdminClient();
  // is null → set it. Already set → untouched (no upgrade, no overwrite).
  const { error } = await admin.from('profiles')
    .update({ install_source: source, install_source_at: new Date().toISOString() })
    .eq('id', user.id).is('install_source', null);
  if (error) console.error('[install-source] failed', error.message);
  return NextResponse.json({ ok: true });
}
