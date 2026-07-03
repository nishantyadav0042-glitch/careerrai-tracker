import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import {
  pickGrowthVariant, GROWTH_NUDGE_URLS, type GrowthNudgeType,
} from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// 07:30 UTC = 13:00 IST (lunch break — the Zomato slot). Growth nudges for
// students PAST their first 7 days: upgrade, mock discipline. The first-week
// activation arc (onboarding-morning + the onboarding branch of daily-reminder)
// owns brand-new students entirely — this cron explicitly skips anyone still
// inside that window so the two systems never double-message the same day.
// HARD RULES so this never becomes spam:
//   1. At most ONE growth push per student per day (highest priority wins).
//   2. Upgrade nudges at most every 3 days; mock nudge at most every 7.
//   3. Demo accounts and students with a buddy never get upgrade nudges.
const GROWTH_TYPES: GrowthNudgeType[] = ['upgrade_mock', 'upgrade_progress', 'mock_nudge'];

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, buddy_id, notif_prefs, dream_colleges, created_at, is_demo')
    .eq('role', 'student')
    .eq('is_demo', false);
  if (!students?.length) return NextResponse.json({ sent: 0 });

  const ids = students.map((s) => s.id);
  const [
    { data: logCounts },
    { data: recentGrowthNotifs },
    { data: streaks },
    { data: debriefs },
  ] = await Promise.all([
    admin.from('daily_reports').select('student_id, report_date, mock_taken').in('student_id', ids),
    admin.from('notifications').select('user_id, type, created_at').in('user_id', ids).in('type', GROWTH_TYPES).gte('created_at', daysAgo(8)),
    admin.from('streak_data').select('student_id, current_streak').in('student_id', ids),
    admin.from('mock_debriefs').select('student_id').in('student_id', ids),
  ]);

  const logsByStudent = new Map<string, { total: number; lastMockAt: string | null }>();
  for (const r of logCounts ?? []) {
    const cur = logsByStudent.get(r.student_id) ?? { total: 0, lastMockAt: null };
    cur.total++;
    if (r.mock_taken && (!cur.lastMockAt || r.report_date > cur.lastMockAt)) cur.lastMockAt = r.report_date;
    logsByStudent.set(r.student_id, cur);
  }
  const streakById = new Map((streaks ?? []).map((s) => [s.student_id, s.current_streak ?? 0]));
  const hasDebrief = new Set((debriefs ?? []).map((d) => d.student_id));

  // Recency guards from the notifications log itself (idempotent by design).
  const lastByUserType = new Map<string, string>();
  const sentTodayUsers = new Set<string>();
  for (const n of recentGrowthNotifs ?? []) {
    const key = `${n.user_id}:${n.type}`;
    const prev = lastByUserType.get(key);
    if (!prev || n.created_at > prev) lastByUserType.set(key, n.created_at);
    if (n.created_at >= todayStart) sentTodayUsers.add(n.user_id);
  }
  const sentWithin = (userId: string, type: string, days: number) => {
    const last = lastByUserType.get(`${userId}:${type}`);
    return !!last && now - new Date(last).getTime() < days * 86_400_000;
  };

  let sent = 0;
  const breakdown: Record<string, number> = {};

  for (const s of students) {
    if (sentTodayUsers.has(s.id)) continue;
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const logs = logsByStudent.get(s.id) ?? { total: 0, lastMockAt: null };
    const signupDays = (now - new Date(s.created_at).getTime()) / 86_400_000;
    const noBuddy = !s.buddy_id;
    const daysSinceMock = logs.lastMockAt
      ? (now - new Date(logs.lastMockAt + 'T00:00:00+05:30').getTime()) / 86_400_000
      : Infinity;

    // Still inside the first-7-days window — the onboarding arc owns them.
    if (logs.total < 7 && signupDays <= 14) continue;

    // Priority order: convert mock-takers > convert consistent loggers > mock
    // discipline. Exactly one (or none) fires.
    let type: GrowthNudgeType | null = null;
    if (noBuddy && hasDebrief.has(s.id) && !sentWithin(s.id, 'upgrade_mock', 3) && !sentWithin(s.id, 'upgrade_progress', 3)) {
      type = 'upgrade_mock';
    } else if (noBuddy && logs.total >= 3 && !sentWithin(s.id, 'upgrade_progress', 3) && !sentWithin(s.id, 'upgrade_mock', 3)) {
      type = 'upgrade_progress';
    } else if (logs.total >= 2 && daysSinceMock >= 7 && !sentWithin(s.id, 'mock_nudge', 7)) {
      type = 'mock_nudge';
    }
    if (!type) continue;

    const { title, body } = pickGrowthVariant(type, {
      name: s.full_name.split(' ')[0],
      streak: streakById.get(s.id) ?? 0,
      dreamCollege: ((s.dream_colleges as string[] | null)?.[0]) ?? null,
    }, []);
    const url = GROWTH_NUDGE_URLS[type];

    await admin.from('notifications').insert({
      user_id: s.id, type, title, body, data: { url }, read: false, channel: 'in_app',
    });
    if (prefs.push === true) await sendPushToUser(s.id, { title, body, url });
    sent++;
    breakdown[type] = (breakdown[type] ?? 0) + 1;
  }

  return NextResponse.json({ sent, breakdown, students: students.length });
}

export { POST as GET };
