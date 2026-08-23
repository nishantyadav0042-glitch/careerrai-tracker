import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { readRows, isUnavailable } from '@/lib/truth/source';
import { readRowsForIds } from '@/lib/truth/batch';

// ── B3b #8 — read safety ONLY ──────────────────────────────────────────────
//
// The simplest of the four, and its whole risk is in one read:
//
//   profiles      → students        → who is eligible   → gates all
//   notifications → alreadyPinged   → 6-day dedup       → DUPLICATE founder ping
//
// `(recentPings ?? [])` made an unavailable read indistinguishable from "nobody
// has been pinged in six days", so a dead query would send the founder ping to
// the ENTIRE cohort a second time inside the dedup window. There is no
// numeric claim here and no scoring — the damage is purely repetition, which
// on a personal-voice message is its own kind of untruth.
type PingStudent = { id: string; full_name: string; notif_prefs: unknown };

function pingSourceDead(reason: string, total: number) {
  console.error('[nishant-weekly] source unavailable — no ping was sent', reason);
  return NextResponse.json(
    { ok: false, skipped: 'source_unavailable', reason, sent: 0, total }, { status: 503 });
}

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// Founder weekly check-in — personal, from Nishant, not from "the system".
// Runs every Sunday at 08:00 UTC (1:30 PM IST).
// At 20 users, sends to all. Scale: move to random 10% once >50 students.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/nishant-weekly', async () => nishantWeeklyRun());
}

async function nishantWeeklyRun(): Promise<NextResponse> {
  const admin = createAdminClient();

  const studentsSource = await readRows<PingStudent>('profiles(students)', () =>
    admin.from('profiles').select('id, full_name, notif_prefs').eq('role', 'student'));
  if (isUnavailable(studentsSource)) return pingSourceDead(studentsSource.reason, 0);
  const students = studentsSource.state === 'value' ? studentsSource.value : [];
  if (!students.length) return NextResponse.json({ ok: true, sent: 0 });

  // Dedup: don't send if already got one in the last 6 days
  const since6d = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const studentIds = students.map((s) => s.id);
  const pingsSource = await readRowsForIds<string, { user_id: string }>(
    'notifications(dedup)', studentIds, (chunk) =>
      admin.from('notifications').select('user_id').in('user_id', chunk)
        .eq('type', 'founder_ping').gte('created_at', since6d));
  if (isUnavailable(pingsSource)) {
    return pingSourceDead(`notifications(dedup): ${pingsSource.reason}`, students.length);
  }
  const alreadyPinged = new Set(
    (pingsSource.state === 'value' ? pingsSource.value : []).map((n) => n.user_id));

  const eligible = students.filter((s) => !alreadyPinged.has(s.id));

  const title = 'Hey, Nishant here.';
  const body = 'Just checking — how\'s CAT prep going? Reply anytime, I read everything.';

  let sent = 0;
  for (const s of eligible) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    const outcome = await dispatch({
      userId: s.id, type: 'founder_ping', title, body, url: '/student/buddy',
      reason: 'Weekly personal check-in from the founder — no reply in the last 6 days', expectedAction: 'open_buddy', prefs,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ ok: true, sent, total: students.length });
}

export { POST as GET };
