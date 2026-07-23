import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString, daysSinceLastLog } from '@/lib/streak-utils';

// POST /api/streak/restore — Snapchat-style manual streak restore. The student
// taps "Restore" on a broken streak; we spend one shield to bridge the gap,
// re-anchor the streak as active, and record the covered days so the streak
// engine (compute_momentum_streak) keeps it bridged on their next log. No
// auto-restore — the student does it themselves, and only if they hold a shield.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: sd } = await admin
    .from('streak_data')
    .select('current_streak, last_log_date, shields, restored_dates')
    .eq('student_id', user.id)
    .maybeSingle();

  if (!sd || !sd.last_log_date) {
    return NextResponse.json({ error: 'No streak to restore yet.' }, { status: 400 });
  }

  const since = daysSinceLastLog(sd.last_log_date as string);
  // Only a genuinely broken streak (missed at least one full day) can be
  // restored — today is still loggable, so since <= 1 is "not broken".
  if (since == null || since <= 1) {
    return NextResponse.json({ error: "Your streak isn't broken — just log today to keep it." }, { status: 400 });
  }
  if ((sd.shields ?? 0) < 1) {
    return NextResponse.json({ error: 'No restores left. Log 21 days to earn another shield.' }, { status: 400 });
  }

  // The missed days = every date strictly between the last log and today.
  const today = getLogDateString();
  const start = new Date(sd.last_log_date + 'T00:00:00Z');
  const end = new Date(today + 'T00:00:00Z');
  const missed: string[] = [];
  for (let d = new Date(start.getTime() + 86_400_000); d < end; d = new Date(d.getTime() + 86_400_000)) {
    missed.push(d.toISOString().slice(0, 10));
  }
  const existing = (sd.restored_dates as string[] | null) ?? [];
  // Already fully restored (double-tap / already handled) → nothing to spend.
  if (missed.every((m) => existing.includes(m))) {
    return NextResponse.json({ error: 'This streak is already restored.' }, { status: 400 });
  }
  const restoredDates = [...new Set([...existing, ...missed])];

  // Re-anchor as active (logged "yesterday") so the streak shows restored
  // immediately and today's log continues it; spend one shield.
  const yesterday = new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10);
  const newShields = Math.max(0, (sd.shields ?? 0) - 1);

  const { error } = await admin
    .from('streak_data')
    .update({ restored_dates: restoredDates, last_log_date: yesterday, shields: newShields, updated_at: new Date().toISOString() })
    .eq('student_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not restore — please try again.' }, { status: 500 });

  return NextResponse.json({ ok: true, streak: sd.current_streak ?? 0, shields: newShields });
}
