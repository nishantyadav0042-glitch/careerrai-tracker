import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_SECTIONS = ['VARC', 'DILR', 'QA'] as const;

// POST /api/routine/quick-setup — the one mandatory tap (weakest section) plus
// an optional weekend-hours refinement, captured just-in-time on first use of
// the routine card rather than as an extra step in the main onboarding wizard.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { weakest_section?: string; weekend_hours?: number };
  const weakest = body.weakest_section;
  if (!weakest || !(VALID_SECTIONS as readonly string[]).includes(weakest)) {
    return NextResponse.json({ error: 'weakest_section must be VARC, DILR, or QA' }, { status: 400 });
  }

  const strongest = (VALID_SECTIONS as readonly string[]).filter((s) => s !== weakest);

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {
    self_reported_weakest_section: weakest,
    // No second tap for "strongest" — inferring it from whichever remaining
    // section isn't the weakest only shapes a minor revision-phase task
    // label, so asking a second question for it isn't worth the friction.
    self_reported_strongest_section: strongest[0],
  };
  if (typeof body.weekend_hours === 'number' && body.weekend_hours >= 0 && body.weekend_hours <= 16) {
    updates.weekend_hours_available = body.weekend_hours;
  }

  const { error } = await admin.from('profiles').update(updates).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
