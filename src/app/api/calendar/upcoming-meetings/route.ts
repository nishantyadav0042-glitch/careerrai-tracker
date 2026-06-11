import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface UpcomingMeeting {
  id: string;
  title: string | null;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string | null;
  counterpartName: string;
  counterpartCollege: string | null;
  role: 'buddy' | 'student';
}

/**
 * GET /api/calendar/upcoming-meetings
 * Next scheduled sessions for the signed-in user (buddy or student),
 * including sessions still inside their live window.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const role: 'buddy' | 'student' = profile?.role === 'buddy' ? 'buddy' : 'student';
    const ownerCol = role === 'buddy' ? 'buddy_id' : 'student_id';
    const counterpartCol = role === 'buddy' ? 'student_id' : 'buddy_id';

    // Include sessions that started up to 90 min ago so the live-window
    // card doesn't vanish the second a meeting begins.
    const windowStart = new Date(Date.now() - 90 * 60_000).toISOString();

    // Try to fetch with google_meet_link; if column doesn't exist yet, fall back to basic fields
    const { data: sessions, error } = await admin
      .from('video_sessions')
      .select('id, title, scheduled_at, duration_minutes, google_meet_link, student_id, buddy_id')
      .eq(ownerCol, user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', windowStart)
      .order('scheduled_at', { ascending: true })
      .limit(3);

    // If the google_meet_link column doesn't exist (migration not applied), try without it
    if (error?.code === 'PGRST116' || error?.message?.includes('column')) {
      console.warn('google_meet_link column not found (migration 015 not applied yet), retrying without it');
      const { data: fallbackSessions, error: fallbackError } = await admin
        .from('video_sessions')
        .select('id, title, scheduled_at, duration_minutes, student_id, buddy_id')
        .eq(ownerCol, user.id)
        .eq('session_status', 'scheduled')
        .gte('scheduled_at', windowStart)
        .order('scheduled_at', { ascending: true })
        .limit(3);

      if (fallbackError) {
        console.error('upcoming-meetings fallback query failed:', fallbackError);
        return NextResponse.json({ error: 'Failed to load meetings.' }, { status: 500 });
      }

      // Map fallback sessions with null meet links
      const rows = (fallbackSessions ?? []).map(s => ({
        ...s,
        google_meet_link: null
      }));

      const active = rows.filter((s) => {
        const endMs =
          new Date(s.scheduled_at).getTime() + (s.duration_minutes || 30) * 60_000;
        return endMs > Date.now();
      });

      const counterpartIds = [...new Set(active.map((s) => s[counterpartCol]))];
      const names = new Map<string, { full_name: string; college: string | null }>();
      if (counterpartIds.length) {
        const { data: people } = await admin
          .from('profiles')
          .select('id, full_name, college')
          .in('id', counterpartIds);
        for (const p of people ?? []) {
          names.set(p.id, { full_name: p.full_name, college: p.college });
        }
      }

      const meetings: UpcomingMeeting[] = active.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledAt: s.scheduled_at,
        durationMinutes: s.duration_minutes || 30,
        meetLink: s.google_meet_link,
        counterpartName: names.get(s[counterpartCol])?.full_name ?? 'Your buddy',
        counterpartCollege: names.get(s[counterpartCol])?.college ?? null,
        role,
      }));

      return NextResponse.json({ meetings });
    }

    if (error) {
      console.error('upcoming-meetings query failed:', error);
      return NextResponse.json({ error: 'Failed to load meetings.' }, { status: 500 });
    }

    const rows = sessions ?? [];

    // Drop sessions whose live window has fully ended
    const active = rows.filter((s) => {
      const endMs =
        new Date(s.scheduled_at).getTime() + (s.duration_minutes || 30) * 60_000;
      return endMs > Date.now();
    });

    const counterpartIds = [...new Set(active.map((s) => s[counterpartCol]))];
    const names = new Map<string, { full_name: string; college: string | null }>();
    if (counterpartIds.length) {
      const { data: people } = await admin
        .from('profiles')
        .select('id, full_name, college')
        .in('id', counterpartIds);
      for (const p of people ?? []) {
        names.set(p.id, { full_name: p.full_name, college: p.college });
      }
    }

    const meetings: UpcomingMeeting[] = active.map((s) => ({
      id: s.id,
      title: s.title,
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes || 30,
      meetLink: s.google_meet_link,
      counterpartName: names.get(s[counterpartCol])?.full_name ?? 'Your buddy',
      counterpartCollege: names.get(s[counterpartCol])?.college ?? null,
      role,
    }));

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error('upcoming-meetings error:', error);
    return NextResponse.json({ error: 'Failed to load meetings.' }, { status: 500 });
  }
}
