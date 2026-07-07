import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Founder-requested metric: what fraction of students actually commit to
// Today's Routine, not just read it. 'viewed' fires once the card has real
// data on screen; 'started' fires on the first task tap, carrying the
// elapsed seconds since 'viewed' — that number is the whole point of this
// endpoint. Fire-and-forget from the client; a failure here should never
// block or visibly disrupt the student's actual routine interaction.
interface EngagementRequest {
  event: 'viewed' | 'started';
  seconds_to_start?: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as EngagementRequest;
    if (body.event !== 'viewed' && body.event !== 'started') {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from('routine_engagement_events').insert({
      student_id: user.id,
      event: body.event,
      seconds_to_start: body.event === 'started' ? body.seconds_to_start ?? null : null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Telemetry only — never surface a failure to the student.
    return NextResponse.json({ ok: false });
  }
}
