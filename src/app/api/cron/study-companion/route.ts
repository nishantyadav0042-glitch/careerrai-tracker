import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_ACTIVE } from '@/lib/notification-os';
import {
  COMPANION_SLOTS, companionType, companionTip, weakestFromCoverage,
  morningCopy, factCopy, openCopy, progressCopy, logCopy, closeCopy,
  type CompanionSlot, type SlotCopy,
} from '@/lib/companion';

// The Study Companion cadence (see lib/companion.ts for the philosophy).
// One route, six Pro cron slots — vercel.json calls it with ?slot=…:
//   morning  04:00 UTC (09:30 IST)  today's plan preview
//   fact     07:30 UTC (13:00 IST)  micro-tip for their weakest section
//   open     11:30 UTC (17:00 IST)  study window opens, first target
//   [20:00 IST is decision-engine — the smart-insight slot, already live]
//   progress 15:00 UTC (20:30 IST)  their own consistency, as encouragement
//   log      16:00 UTC (21:30 IST)  the day's ONE demand, only if not logged
//   close    16:30 UTC (22:00 IST)  celebration — only if they logged
//
// Eligibility is the state machine's job: only students who can study today
// (active loggers + Day 1-7 arc). Recovery states never receive the
// cadence — the ladder owns them. Every send goes through dispatch(), so
// the BUDGET_ACTIVE cap, per-student cooldown, and measurement columns all
// apply; every slot is a distinct type on /admin/notification-health, so
// the founder sees per-slot clicked/acted rates and the data — not a
// debate — decides which slots earn their place.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slot = request.nextUrl.searchParams.get('slot') as CompanionSlot | null;
  if (!slot || !COMPANION_SLOTS.includes(slot)) {
    return NextResponse.json({ error: 'Unknown slot' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000);
  const istDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay();
  const isWeekend = istDay === 0 || istDay === 6;

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs, created_at, is_working_professional, self_reported_weakest_section, self_reported_weak_topic, study_target_hours, hours_available, weekend_hours_available')
    .eq('role', 'student')
    .eq('onboarding_completed', true);
  if (!students?.length) return NextResponse.json({ slot, sent: 0 });

  const ids = students.map((s) => s.id);
  const reportsWindowStart = new Date(now.getTime() - 21 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const needsCoverage = slot === 'morning' || slot === 'open' || slot === 'fact' || slot === 'close';

  const [
    { data: streaks },
    { data: recentReports },
    { data: sentToday },
    { data: coverageRows },
  ] = await Promise.all([
    admin.from('streak_data').select('student_id, current_streak, last_log_date').in('student_id', ids),
    admin.from('daily_reports').select('student_id, report_date').in('student_id', ids).gte('report_date', reportsWindowStart),
    admin.from('notifications').select('user_id').in('user_id', ids).eq('type', companionType(slot)).gte('created_at', todayStart),
    needsCoverage
      ? admin.from('topic_coverage').select('student_id, section, status').in('student_id', ids)
      : Promise.resolve({ data: [] as { student_id: string; section: string; status: string }[] }),
  ]);

  const streakById = new Map((streaks ?? []).map((r) => [r.student_id, r]));
  const alreadySent = new Set((sentToday ?? []).map((n) => n.user_id));
  const reportDays = new Map<string, Set<string>>();
  for (const r of recentReports ?? []) {
    if (!reportDays.has(r.student_id)) reportDays.set(r.student_id, new Set());
    reportDays.get(r.student_id)!.add(r.report_date);
  }
  const coverageById = new Map<string, { section: string; status: string }[]>();
  for (const c of coverageRows ?? []) {
    if (!coverageById.has(c.student_id)) coverageById.set(c.student_id, []);
    coverageById.get(c.student_id)!.push(c);
  }

  let sent = 0;
  let skipped = 0;

  for (const s of students) {
    if (alreadySent.has(s.id)) continue;
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const streak = streakById.get(s.id);
    const lastLog = (streak?.last_log_date as string | null) ?? null;
    // Never logged → activation ladder owns them; 2+ days quiet → recovery
    // ladder owns them. The cadence is only for students in motion.
    if (lastLog == null) { skipped++; continue; }
    const daysSinceLastLog = Math.round((Date.parse(today) - Date.parse(lastLog)) / 86_400_000);
    if (daysSinceLastLog >= 2) { skipped++; continue; }

    const days = reportDays.get(s.id) ?? new Set<string>();
    const loggedToday = days.has(today);
    const daysSinceJoin = Math.floor((now.getTime() - new Date(s.created_at as string).getTime()) / 86_400_000);
    const isArc = daysSinceJoin <= 14 && days.size < 7;

    const weakest = (s.self_reported_weakest_section as 'VARC' | 'DILR' | 'QA' | null)
      ?? weakestFromCoverage(coverageById.get(s.id) ?? [])
      ?? 'DILR';
    const hoursRaw = isWeekend
      ? (s.weekend_hours_available as number | null)
      : ((s.study_target_hours ?? s.hours_available) as number | null);
    const hoursToday = hoursRaw
      ?? (isWeekend ? (s.is_working_professional ? 4 : 3) : (s.is_working_professional ? 1.5 : 2.5));

    let copy: SlotCopy | null = null;
    let reason = '';
    switch (slot) {
      case 'morning':
        // Arc students get their own Day-N morning copy at 10:00 — no double.
        if (isArc || loggedToday) break;
        copy = morningCopy(weakest, hoursToday);
        reason = `Companion 09:30 — plan preview (${weakest} weakest, ${hoursToday}h committed)`;
        break;
      case 'fact':
        copy = factCopy(companionTip(weakest, dayOfYear));
        reason = `Companion 13:00 — ${weakest} micro-tip, day ${dayOfYear} rotation`;
        break;
      case 'open':
        if (loggedToday) break;
        copy = openCopy((s.self_reported_weak_topic as string | null) ?? null, weakest, hoursToday);
        reason = 'Companion 17:00 — study window opens';
        break;
      case 'progress': {
        if (loggedToday) break;
        const studied = days.size >= 1 ? [...days].filter((d) => d >= new Date(now.getTime() - 20 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).length : 0;
        // Under 5 days the number reads as guilt, not encouragement — silence.
        if (studied < 5) break;
        copy = progressCopy(studied, 20);
        reason = `Companion 20:30 — ${studied}/20 days studied`;
        break;
      }
      case 'log':
        // The day's one demand. Arc students already got theirs at 20:00.
        if (loggedToday || isArc) break;
        copy = logCopy();
        reason = 'Companion 21:30 — log still open';
        break;
      case 'close':
        if (!loggedToday) break; // no log, no celebration — and no guilt either
        copy = closeCopy((streak?.current_streak as number | null) ?? 0, weakest);
        reason = 'Companion 22:00 — day closed, logged';
        break;
    }
    if (!copy) { skipped++; continue; }

    const outcome = await dispatch({
      userId: s.id,
      type: companionType(slot),
      title: copy.title,
      body: copy.body,
      url: '/student/tracker',
      reason,
      expectedAction: copy.expectedAction,
      prefs,
      dailyBudget: BUDGET_ACTIVE,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ slot, sent, skipped, candidates: students.length });
}

export { POST as GET };
