import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { checkSalesTarget, isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';

// Repair one unmatched vendor event by attributing it to a student BY HAND.
//
// This is the escape hatch that makes "never guess" affordable. The webhook
// refuses to pick a student from a phone number; a human with context can still
// say who was called — and when they do, the repair is recorded as a repair,
// not laundered into looking like the vendor got it right.
//
// Admin only. The attribution is stored with who made it and when, so a future
// reader can tell a correlated event from a human judgement call.

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { eventId, studentId, discard, note } = (await request.json().catch(() => ({}))) ?? {};
  if (!isUuid(eventId)) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

  const { data: ev, error: evErr } = await admin
    .from('expedify_events').select('id, resolution, student_id').eq('id', eventId).maybeSingle();
  if (evErr) return NextResponse.json({ error: 'Could not read the event — try again.' }, { status: 503 });
  if (!ev) return NextResponse.json({ error: 'No such event.' }, { status: 404 });
  if (ev.resolution === 'matched') {
    // A correlated event is already attributed by OUR reference. Overwriting it
    // by hand would replace evidence with an opinion.
    return NextResponse.json({ error: 'This event is already correlated and cannot be repaired by hand.' }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (discard === true) {
    const { error } = await admin.from('expedify_events').update({
      resolution: 'discarded', resolved_by: principal.id, resolved_at: now,
      resolution_note: typeof note === 'string' ? note.slice(0, 500) : 'Discarded by admin',
    }).eq('id', eventId);
    if (error) return NextResponse.json({ error: 'Could not discard — try again.' }, { status: 500 });
    await auditSales(principal.id, 'vendor_event_discarded', { type: 'vendor_event', id: eventId },
      { before: ev.resolution, after: 'discarded', reason: typeof note === 'string' ? note : undefined });
    return NextResponse.json({ ok: true, resolution: 'discarded' });
  }

  const target = await checkSalesTarget(admin, studentId);
  if (!target.ok) {
    if (target.reason === 'unavailable') return NextResponse.json({ error: 'Could not verify the student — try again.' }, { status: 503 });
    return NextResponse.json({ error: 'Not a valid student.', reason: target.reason }, { status: 400 });
  }

  const { error } = await admin.from('expedify_events').update({
    student_id: studentId,
    // 'repaired', never 'matched'. The distinction is the whole point: matched
    // means the vendor returned our reference; repaired means a human decided.
    resolution: 'repaired',
    resolved_by: principal.id,
    resolved_at: now,
    resolution_note: typeof note === 'string' ? note.slice(0, 500) : null,
  }).eq('id', eventId);
  if (error) {
    console.error('[vendor-repair] update failed:', error.message);
    return NextResponse.json({ error: 'Could not repair — try again.' }, { status: 500 });
  }

  await auditSales(principal.id, 'vendor_event_repaired', { type: 'vendor_event', id: eventId },
    { before: ev.student_id ?? null, after: studentId, reason: typeof note === 'string' ? note : undefined });

  return NextResponse.json({ ok: true, resolution: 'repaired', studentId });
}
