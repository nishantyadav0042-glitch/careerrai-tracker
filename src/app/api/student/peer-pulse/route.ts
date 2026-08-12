import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPeerRows } from '@/lib/os/peer-cohort-data';
import { peerPulse, cohortInsights, selfVsObserved } from '@/lib/os/peer-cohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// GET /api/student/peer-pulse — "you are not alone" + "students like you".
//
// Wiring only. Every judgement about what may be said, and when silence is the
// correct answer, lives in lib/os/peer-cohort.ts where it is tested without a
// database. This route's whole job is: authenticate, load rows, hand them over,
// return what came back.
//
// It returns an EMPTY payload rather than a 404 or an error when there is not
// enough evidence to say anything. A quiet card is a correct state here, not a
// failure — the base is small, and pretending otherwise is the one thing this
// feature must never do.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  let rows;
  try {
    rows = await loadPeerRows(admin, now);
  } catch (e) {
    // Never let a social nicety break Home. The card renders nothing.
    console.error('[peer-pulse] load failed', e);
    return NextResponse.json({ pulse: null, insights: [], planGap: null });
  }

  const me = rows.find((r) => r.studentId === user.id);
  if (!me) return NextResponse.json({ pulse: null, insights: [], planGap: null });

  const thisYear = now.getUTCFullYear();

  return NextResponse.json({
    pulse: peerPulse(me, rows),
    insights: cohortInsights(me, rows, thisYear),
    planGap: selfVsObserved(me),
  });
}
