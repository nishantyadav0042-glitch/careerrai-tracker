import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// The full funnel: viewed -> started -> completed. Starting isn't finishing
// — 'completed' fires when every task for the day is ticked, carrying
// elapsed seconds since 'started'. Someone who starts and finishes in 35
// minutes is in a different state than someone who starts and vanishes for
// 5 hours; that gap is itself a quality signal, not just a vanity number.
// Fire-and-forget from the client; a failure here should never block or
// visibly disrupt the student's actual routine interaction.
interface EngagementRequest {
  event: 'viewed' | 'started' | 'completed';
  seconds_to_start?: number;
  seconds_since_started?: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as EngagementRequest;
    if (body.event !== 'viewed' && body.event !== 'started' && body.event !== 'completed') {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from('routine_engagement_events').insert({
      student_id: user.id,
      event: body.event,
      seconds_to_start: body.event === 'started' ? body.seconds_to_start ?? null : null,
      seconds_since_started: body.event === 'completed' ? body.seconds_since_started ?? null : null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Telemetry only — never surface a failure to the student.
    return NextResponse.json({ ok: false });
  }
}
