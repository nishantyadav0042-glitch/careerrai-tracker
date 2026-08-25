import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// The mentor describes their week. Consumed by lib/session-slots to compute
// what a student may choose, and enforced by the availability trigger
// (migration 20260824h) so a booking outside it is refused by the database
// rather than by whichever caller remembered to check.
//
// Absence of a row means NOT BOOKABLE — never "bookable with defaults". A
// mentor who has not described their week has not agreed to anything.

export const dynamic = 'force-dynamic';

const DEFAULTS = {
  timezone: 'Asia/Kolkata',
  work_days: [1, 2, 3, 4, 5],
  start_minute: 10 * 60,
  end_minute: 19 * 60,
  slot_minutes: 45,
  buffer_minutes: 15,
  horizon_days: 14,
  min_notice_minutes: 120,
};

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('buddy_availability').select('*').eq('buddy_id', user.id).maybeSingle();

  if (error) {
    console.error('[buddy/availability] read failed:', error.message);
    return NextResponse.json({ error: 'Could not load your calendar.' }, { status: 503 });
  }
  // `configured: false` with suggested defaults — the mentor still has to
  // agree to them. Pre-filling a form is not consent.
  return NextResponse.json({ configured: data != null, availability: data ?? DEFAULTS });
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const days = Array.isArray(b.work_days)
    ? [...new Set(b.work_days.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort()
    : [];
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);

  const row = {
    buddy_id: user.id,
    timezone: typeof b.timezone === 'string' && b.timezone.length > 0 ? b.timezone : DEFAULTS.timezone,
    work_days: days,
    start_minute: num(b.start_minute, DEFAULTS.start_minute),
    end_minute: num(b.end_minute, DEFAULTS.end_minute),
    slot_minutes: num(b.slot_minutes, DEFAULTS.slot_minutes),
    buffer_minutes: num(b.buffer_minutes, DEFAULTS.buffer_minutes),
    max_per_day: typeof b.max_per_day === 'number' ? Math.round(b.max_per_day) : null,
    horizon_days: num(b.horizon_days, DEFAULTS.horizon_days),
    min_notice_minutes: num(b.min_notice_minutes, DEFAULTS.min_notice_minutes),
    active: b.active !== false,
    updated_at: new Date().toISOString(),
  };

  // Readable errors for the cases a mentor can actually cause. Everything else
  // is caught by the CHECK constraints, which are the real guarantee.
  if (days.length === 0) {
    return NextResponse.json({ error: 'Pick at least one working day.' }, { status: 400 });
  }
  if (row.end_minute <= row.start_minute) {
    return NextResponse.json({ error: 'Your finish time must be after your start time.' }, { status: 400 });
  }
  if (row.slot_minutes > row.end_minute - row.start_minute) {
    return NextResponse.json({ error: 'A session does not fit inside those hours.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('buddy_availability')
    .upsert(row, { onConflict: 'buddy_id' });
  if (error) {
    console.error('[buddy/availability] save failed:', error.message);
    return NextResponse.json({ error: 'Could not save your calendar — check the values and try again.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, configured: true });
}
