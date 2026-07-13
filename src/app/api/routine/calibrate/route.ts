import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { serverError } from '@/lib/api-error';

const VERDICTS = new Set(['too_easy', 'just_right', 'too_much']);

// POST /api/routine/calibrate { verdict } — the one-tap daily calibration
// ("Today's plan was too easy / just right / too much"). The company's
// highest-ROI data collection: coaching institutes don't have this signal;
// within months it derives real pacing numbers instead of invented ones.
// Collect first, adjust later — the engine does NOT act on it yet.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { verdict?: unknown };
  const verdict = typeof body.verdict === 'string' && VERDICTS.has(body.verdict) ? body.verdict : null;
  if (!verdict) return NextResponse.json({ error: 'verdict must be too_easy | just_right | too_much' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('daily_routines')
    .update({ calibration: verdict })
    .eq('student_id', user.id)
    .eq('routine_date', getLogDateString());
  if (error) return serverError('calibrate', error);

  return NextResponse.json({ ok: true, verdict });
}
