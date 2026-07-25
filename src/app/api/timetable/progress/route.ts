import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeTargets } from '@/lib/timetable';
import { computeTargetProgress, targetKey, nextAction } from '@/lib/coaching-progress';

// GET  — every coaching target with real progress against it.
// POST — record work done, in the coaching's own units ({ key, delta } or
//        { key, set }). The student is the only source for these counts, so
//        logging has to be one tap.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: tt }, { data: prog }] = await Promise.all([
    admin.from('student_timetables').select('targets, confirmed_at').eq('student_id', user.id).maybeSingle(),
    admin.from('coaching_target_progress').select('target_key, done').eq('student_id', user.id),
  ]);

  const targets = sanitizeTargets(tt?.targets);
  if (targets.length === 0) return NextResponse.json({ targets: [], headline: null });

  const doneBy = new Map<string, number>((prog ?? []).map((r) => [r.target_key as string, Number(r.done) || 0]));
  // Progress is measured from when they confirmed the plan — that is the only
  // start point we actually know. Without it we still show a required rate but
  // never grade them ahead or behind.
  const startedAt = (tt?.confirmed_at as string | null) ?? null;

  const rows = targets.map((t) => computeTargetProgress(t, doneBy.get(targetKey(t)) ?? 0, startedAt));
  // Recovery-first: the one action worth taking tonight, never a running
  // tally of how far behind they are.
  return NextResponse.json({ targets: rows, action: nextAction(rows, startedAt) });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { key, delta, set } = (await request.json().catch(() => ({}))) as {
    key?: unknown; delta?: unknown; set?: unknown;
  };
  if (typeof key !== 'string' || !key || key.length > 60) {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // The key must correspond to a target this student actually has. Otherwise
  // the table becomes a dumping ground for arbitrary client-supplied strings.
  const { data: tt } = await admin
    .from('student_timetables').select('targets').eq('student_id', user.id).maybeSingle();
  const validKeys = new Set(sanitizeTargets(tt?.targets).map(targetKey));
  if (!validKeys.has(key)) {
    return NextResponse.json({ error: 'Unknown target' }, { status: 400 });
  }

  let next: number;
  if (typeof set === 'number' && Number.isFinite(set)) {
    next = Math.max(0, Math.min(100_000, Math.floor(set)));
  } else {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) {
      return NextResponse.json({ error: 'delta or set required' }, { status: 400 });
    }
    const { data: cur } = await admin
      .from('coaching_target_progress').select('done')
      .eq('student_id', user.id).eq('target_key', key).maybeSingle();
    // Clamped, so a stuck "+1" button or a replayed request can never push a
    // student's count somewhere absurd.
    next = Math.max(0, Math.min(100_000, (Number(cur?.done) || 0) + Math.trunc(d)));
  }

  const { error } = await admin.from('coaching_target_progress').upsert({
    student_id: user.id, target_key: key, done: next, updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,target_key' });

  if (error) {
    console.error('[coaching-progress] save failed', error.message);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key, done: next });
}
