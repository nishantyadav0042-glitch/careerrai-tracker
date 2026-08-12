import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPeerRows } from '@/lib/os/peer-cohort-data';
import { peerPulse, cohortInsights, selfVsObserved, populationProofAllowed } from '@/lib/os/peer-cohort';

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
  const pulse = peerPulse(me, rows);

  // The density gate, applied HERE rather than in the component, so no client
  // can render population numbers we have decided are not yet credible — and
  // so the numbers never even reach the browser to be found in a network tab.
  //
  // planGap is exempt by design: it is built from this student's own record,
  // says nothing about how many of us there are, and is the one line on this
  // card that makes the app look useful rather than small.
  const allowed = populationProofAllowed(pulse.studiedToday);

  return NextResponse.json({
    pulse: allowed ? pulse : null,
    insights: allowed ? cohortInsights(me, rows, thisYear) : [],
    planGap: selfVsObserved(me),
  });
}
