import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Disposition engine — the heart of the dialer CRM. Every call MUST end in a
// disposition; this computes when (if ever) the lead comes back:
//   interested      → follow up in 2 days
//   callback        → at the exact time the student asked for
//   converted       → gone (won)
//   not_interested  → gone forever (never resurface)
//   no_answer       → retry this evening, or next day; hot leads always roll to
//                     tomorrow; after repeated misses it goes cold (+3 days)
// Feedback is mandatory on every CONNECTED call (not on a no-answer).

// Build a UTC ISO for an IST wall-clock time `dayOffset` days from today.
function istFutureIso(dayOffset: number, hour: number, minute = 0): string {
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  const target = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + dayOffset, hour, minute);
  return new Date(target - 5.5 * 3600_000).toISOString();
}
function istHour(): number {
  return new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, email, full_name').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'sales') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { studentId, outcome, note, callbackAt, hot } = body ?? {};
  const CONNECTED = ['interested', 'callback', 'converted', 'not_interested'];
  const VALID = [...CONNECTED, 'no_answer'];
  if (typeof studentId !== 'string' || !VALID.includes(outcome)) {
    return NextResponse.json({ error: 'Invalid disposition' }, { status: 400 });
  }
  const noteText = typeof note === 'string' ? note.trim() : '';
  // Feedback is mandatory on a connected call.
  if (CONNECTED.includes(outcome) && noteText.length === 0) {
    return NextResponse.json({ error: 'Feedback is required for a connected call.' }, { status: 400 });
  }
  // A callback needs a time.
  if (outcome === 'callback' && !(typeof callbackAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(callbackAt))) {
    return NextResponse.json({ error: 'Pick a callback time.' }, { status: 400 });
  }

  // Map the disposition to a stored status + a next_action_at (the re-queue clock).
  const { data: cur } = await admin.from('lead_outreach').select('no_answer_count').eq('student_id', studentId).maybeSingle();
  const prevMisses = (cur?.no_answer_count as number | null) ?? 0;

  let status = outcome;
  let nextActionAt: string | null = null;
  let noAnswerCount = prevMisses;
  let cbAt: string | null = null;

  if (outcome === 'callback') {
    status = 'follow_up';
    cbAt = new Date((callbackAt as string).slice(0, 16) + ':00+05:30').toISOString();
    nextActionAt = cbAt;
    noAnswerCount = 0;
  } else if (outcome === 'interested') {
    nextActionAt = istFutureIso(2, 11, 0); // gentle follow-up in 2 days, late morning
    noAnswerCount = 0;
  } else if (outcome === 'no_answer') {
    noAnswerCount = prevMisses + 1;
    if (hot === true) {
      nextActionAt = istFutureIso(1, 10, 0);            // never lose a hot lead — tomorrow morning
    } else if (noAnswerCount < 2 && istHour() < 17) {
      nextActionAt = istFutureIso(0, 18, 30);           // evening retry today
    } else if (noAnswerCount < 4) {
      nextActionAt = istFutureIso(1, 18, 0);            // tomorrow evening
    } else {
      nextActionAt = istFutureIso(3, 18, 0);            // going cold — space it out
    }
  }
  // converted / not_interested → nextActionAt stays null (closed forever).

  const actor = (me?.email as string | null) ?? (me?.full_name as string | null) ?? 'sales';
  const now = new Date().toISOString();

  await admin.from('lead_outreach').upsert({
    student_id: studentId,
    status,
    callback_at: cbAt,
    next_action_at: nextActionAt,
    last_attempt_at: now,
    no_answer_count: noAnswerCount,
    notes: noteText || null,
    owner: actor,
    updated_at: now,
  });

  await admin.from('sales_activity').insert({
    student_id: studentId, actor, status: outcome, note: noteText || (outcome === 'no_answer' ? 'Did not pick up' : null), callback_at: cbAt,
  });

  return NextResponse.json({ ok: true });
}
