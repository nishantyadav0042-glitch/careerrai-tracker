import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitTimeline } from '@/lib/os/timeline';

// POST — record that the founder contacted a log-breaker, and what came back.
//
// The record IS the point: an interview whose answer lives only in a WhatsApp
// thread teaches the product nothing. It lands on the student's timeline
// (kind: founder_contact) so the Log Breakers page, the 360 and any later
// analysis all read the same one history. No new table — the timeline is the
// existing authority for "a thing happened to this student".

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // requireAdmin() redirects, which is the wrong shape for a JSON route —
  // same inline gate every admin API route uses (e.g. retry-unlock).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const studentId = typeof body.studentId === 'string' ? body.studentId : null;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  await emitTimeline(admin, {
    entity: 'student', entityId: studentId, kind: 'founder_contact',
    summary: note || 'Contacted on WhatsApp about stopped logging',
    actor: 'admin', metadata: { source: 'log_breakers' },
  });
  return NextResponse.json({ ok: true });
}
