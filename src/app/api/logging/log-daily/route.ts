import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getLogDateString,
  VALID_SECTIONS,
  VALID_ENERGY,
  VALID_EMOTIONAL_CHIPS,
} from '@/lib/streak-utils';
import { MILESTONE_MESSAGES } from '@/lib/messages';
import { onboardingCopy } from '@/lib/notification-engine';
import { sendPushToUser } from '@/lib/push';
import { generateBuddyBriefing } from '@/lib/buddy-briefing';
import { checkHistoryDoorAfterLog } from '@/lib/mentor-doors';

interface LoggingRequest {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
  plan_fit?: string; // Review Engine: 'easy' | 'right' | 'too_much' | 'couldnt_finish' (legacy 'too_little')
  blocker_reason?: string; // why the plan wasn't finished (only when plan_fit='couldnt_finish')
  confidence?: number; // single-tap 1-5 "how confident about CAT right now"
  log_date?: string; // optional backdate — must be today or yesterday (IST)
  day_outcome?: string; // 'studied' | 'partial' | 'not_studied' | 'skipped'
}

// The shape of the day, asked first in the log sheet. 'not_studied' and
// 'skipped' are complete answers on their own — a day with nothing in it has
// nothing to describe, and the hours/sections validation above already allows
// that combination (0 hours, no sections).
const VALID_DAY_OUTCOME = ['studied', 'partial', 'not_studied', 'skipped'] as const;

// New single-sheet log adds 'easy' + 'couldnt_finish'; 'too_little' kept for
// backward compatibility with any client still sending the old value.
const VALID_PLAN_FIT = ['easy', 'right', 'too_much', 'couldnt_finish', 'too_little'] as const;
const VALID_BLOCKER_REASON = ['college', 'office', 'travel', 'health', 'family', 'procrastination', 'mock_ran_long', 'plan_too_heavy', 'other'] as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as LoggingRequest;

    // Zero-log bug (20 July): the modal has offered 8/10-hour options since
    // 15 July, but this cap still said 6 — every 8h/10h log bounced with a 400
    // and the student saw "Failed to log". The serious day-1 students are
    // exactly the ones picking 8-10h.
    if (!Number.isInteger(body.hours) || body.hours < 0 || body.hours > 10) {
      return NextResponse.json({ error: 'Invalid hours (0-10)' }, { status: 400 });
    }
    // An honest "didn't study today" log (0 hours, no mock) carries no
    // sections — allowed. Any log with real hours must say what was studied.
    if (!Array.isArray(body.sections) || (body.sections.length === 0 && body.hours !== 0)) {
      return NextResponse.json({ error: 'Select at least one section' }, { status: 400 });
    }
    if (!body.sections.every((s) => (VALID_SECTIONS as readonly string[]).includes(s))) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }
    if (!(VALID_ENERGY as readonly string[]).includes(body.energy)) {
      return NextResponse.json({ error: 'Invalid energy' }, { status: 400 });
    }
    if (body.emotional_chips) {
      if (!body.emotional_chips.every((c) => (VALID_EMOTIONAL_CHIPS as readonly string[]).includes(c))) {
        return NextResponse.json({ error: 'Invalid emotional chip' }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, buddy_id, full_name, created_at, notif_prefs')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const todayStr = getLogDateString();
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');
    const yesterdayStr = new Date(todayDate.getTime() - 86_400_000).toISOString().split('T')[0];

    // Validate backdate: only today or yesterday allowed.
    const dateStr = body.log_date ?? todayStr;
    if (dateStr !== todayStr && dateStr !== yesterdayStr) {
      return NextResponse.json({ error: 'Can only log today or yesterday' }, { status: 400 });
    }

    const { data: existingLog } = await admin
      .from('daily_reports')
      .select('id, updated_at')
      .eq('student_id', user.id)
      .eq('report_date', dateStr)
      .maybeSingle();

    // Capture the pre-reset streak so we can detect a lapse-recovery: the RPC
    // below resets current_streak to 1 once a gap is crossed.
    const { data: prevStreak } = await admin
      .from('streak_data')
      .select('current_streak, last_log_date')
      .eq('student_id', user.id)
      .maybeSingle();

    // Rate limit: block hammering (same report updated within last 15 seconds)
    if (existingLog?.updated_at) {
      const secsSinceUpdate = (Date.now() - new Date(existingLog.updated_at).getTime()) / 1000;
      if (secsSinceUpdate < 15) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    }

    // Atomic: both daily_reports and streak_data are updated inside a single Postgres
    // transaction so a mid-flight server crash cannot leave them out of sync.
    const { data: rpcResult, error: rpcError } = await admin.rpc('upsert_log_and_streak', {
      p_student_id:      user.id,
      p_report_date:     dateStr,
      p_study_duration:  body.hours,
      p_topics_covered:  body.sections,
      p_mood_emoji:      body.energy,
      p_mock_taken:      body.sections.includes('Mock'),
      p_notes:           body.notes || null,
      p_emotional_chips: body.emotional_chips ?? [],
    });
    if (rpcError) throw rpcError;

    // Review Engine signals (plan_fit, why-not-finished, confidence) — persisted
    // on the row the RPC just wrote (kept out of the RPC so its transaction
    // contract is untouched). All best-effort: a failed capture must never fail
    // the log. These are the fields the new single-sheet log actually acts on.
    const reviewUpdate: Record<string, unknown> = {};
    if (typeof body.plan_fit === 'string' && (VALID_PLAN_FIT as readonly string[]).includes(body.plan_fit)) {
      reviewUpdate.plan_fit = body.plan_fit;
    }
    if (typeof body.blocker_reason === 'string' && (VALID_BLOCKER_REASON as readonly string[]).includes(body.blocker_reason)) {
      reviewUpdate.blocker_reason = body.blocker_reason;
    }
    if (typeof body.confidence === 'number' && Number.isInteger(body.confidence) && body.confidence >= 1 && body.confidence <= 5) {
      reviewUpdate.confidence = body.confidence;
    }
    if (typeof body.day_outcome === 'string' && (VALID_DAY_OUTCOME as readonly string[]).includes(body.day_outcome)) {
      reviewUpdate.day_outcome = body.day_outcome;
    }
    if (Object.keys(reviewUpdate).length > 0) {
      void admin.from('daily_reports').update(reviewUpdate)
        .eq('student_id', user.id).eq('report_date', dateStr)
        .then(({ error }: { error: unknown }) => { if (error) console.error('[log] review-signal update failed', error); });
    }

    const streakUpdated = rpcResult;
    // Authoritative "is this a brand-new log" flag, computed INSIDE the same
    // transaction as the insert (bug audit, 14 July) — the route's own
    // pre-fetched `existingLog` is a separate read before the RPC runs, so
    // two near-simultaneous first-time submissions could both see it as null
    // and both fire the recovery-event/onboarding-notification side effects
    // below. `is_new_log` reflects what the RPC itself actually inserted.
    const isNewLog = (streakUpdated as { is_new_log?: boolean })?.is_new_log ?? !existingLog;

    // Miss-recovery: a fresh log today after a 2+ day gap with a prior streak is
    // a comeback — the #1 retention event. Record it and gently nudge the buddy.
    if (isNewLog && prevStreak?.last_log_date && (prevStreak.current_streak ?? 0) > 0) {
      const gap = Math.round((Date.parse(dateStr) - Date.parse(prevStreak.last_log_date as string)) / 86_400_000);
      if (gap >= 2) {
        const missedDays = gap - 1;
        void admin.from('recovery_events').insert({
          student_id: user.id,
          missed_days: missedDays,
          previous_streak: prevStreak.current_streak as number,
        }).then(({ error }) => { if (error) console.error('recovery_events insert', error); });
        notifyBuddyRecovery(user.id, profile.buddy_id, missedDays).catch(console.error);
      }
    }

    const dailyNudge = await computePrescriptiveLine(user.id, body.sections, isNewLog, admin, body.emotional_chips);

    // Milestone message beats the random bonus — milestone days are rare and meaningful.
    const newStreak = (streakUpdated as { current_streak: number }).current_streak;
    const milestone: string | null = MILESTONE_MESSAGES[newStreak as keyof typeof MILESTONE_MESSAGES] ?? null;

    let bonus: string | undefined;
    if (!milestone && Math.random() < 0.2) {
      const bonuses = [
        '3-day streak incoming!',
        'Your buddy will see this!',
        'Keep this momentum going!',
        'Solid consistency — keep it up!',
      ];
      bonus = bonuses[Math.floor(Math.random() * bonuses.length)];
    }

    // First-7-days celebration: an immediate "Day X done" push right after the
    // log that completed that day — the positive-reinforcement half of the
    // onboarding arc (the morning/evening crons own the "still pending" half).
    if (isNewLog && profile.created_at && Date.now() - new Date(profile.created_at).getTime() <= 14 * 86_400_000) {
      void (async () => {
        const { count: loggedDayCount } = await admin
          .from('daily_reports')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id);
        const dayNumber = loggedDayCount ?? 0;
        const copy = onboardingCopy(dayNumber, 'done', profile.full_name?.split(' ')[0] ?? 'there');
        if (!copy) return;
        await admin.from('notifications').insert({
          user_id: user.id, type: 'onboarding_done', title: copy.title, body: copy.body,
          data: { url: '/student/tracker' }, read: false, channel: 'in_app',
        });
        const prefs = (profile.notif_prefs ?? {}) as Record<string, unknown>;
        if (prefs.push === true) await sendPushToUser(user.id, { ...copy, url: '/student/tracker' });
      })().catch(console.error);
    }

    notifyBuddy(user.id, profile.buddy_id, { hours: body.hours, energy: body.energy }).catch(console.error);
    if (body.sections.includes('Mock')) {
      notifyBuddyMock(user.id, profile.buddy_id, dateStr).catch(console.error);
      // AI copilot: regenerate the buddy's facts-briefing NOW, so it's already
      // waiting — the mock-debrief moment is the highest-leverage use of it.
      if (profile.buddy_id) void generateBuddyBriefing(user.id, profile.buddy_id).catch(console.error);
    }
    if (body.emotional_chips && body.emotional_chips.length > 0 && !body.emotional_chips.includes('all_good')) {
      notifyBuddyEmotional(user.id, profile.buddy_id, body.emotional_chips).catch(console.error);
      if (profile.buddy_id) void generateBuddyBriefing(user.id, profile.buddy_id).catch(console.error);
    }
    // #10 product analytics: hour_of_day + day_of_week drive retention heatmaps;
    // is_first_today distinguishes new logs from edits for funnel analysis.
    const nowUtc = new Date();
    // Mentor Door 1 — HISTORY: after every log, check whether this student's
    // preparation history just became rich enough for real mentoring (5 logged
    // days, or 3 + a mock). Recorded dormant; fire-and-forget.
    if (isNewLog) void checkHistoryDoorAfterLog(admin, user.id);

    logAnalyticsEvent(user.id, 'log_submitted', {
      hours: body.hours,
      sectionCount: body.sections.length,
      hasMock: body.sections.includes('Mock'),
      emotionalChips: body.emotional_chips ?? [],
      is_first_today: isNewLog,
      hour_of_day: nowUtc.getUTCHours(),
      day_of_week: nowUtc.getUTCDay(),
    }).catch(console.error);

    // report_date returned so the client never has to recompute the log-date
    // boundary itself (bug audit, 14 July) — the old client-side recompute in
    // DailyTrackerApp.handleLogSubmit used the browser's LOCAL setHours(3),
    // which could disagree with this server's IST-correct dateStr and file a
    // mock debrief under the wrong day, leaving it permanently "pending".
    return NextResponse.json({ success: true, streak: streakUpdated, bonus, daily_nudge: dailyNudge, milestone, report_date: dateStr }, { status: 200 });
  } catch (error) {
    console.error('Logging error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Evidence Engine — 5-rule prescriptive engine, single-user data, no AI.
// Every log gets at most ONE line back.
// Priority: first-ever > emotional flag > consistency gap > avoidance >
// no-mock-in-7-days > same-section tunnel vision.
async function computePrescriptiveLine(
  studentId: string,
  todaySections: string[],
  isNewLogForDate: boolean,
  admin: ReturnType<typeof createAdminClient>,
  emotionalChips?: string[]
): Promise<string | null> {
  try {
    const { data: recent } = await admin
      .from('daily_reports')
      .select('topics_covered, report_date, mock_taken, emotional_chips, study_duration')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(14);

    // Rule 1: first-ever log
    const priorCount = (recent ?? []).length - (isNewLogForDate ? 1 : 0);
    if (priorCount <= 0) {
      return "First log done. Do this daily and in 2 weeks you'll see a pattern you can't see now.";
    }
    if (!recent || recent.length < 3) return null;

    // Rule 2: emotional distress signal — respond to the person, not just the data
    if (emotionalChips && emotionalChips.length > 0 && !emotionalChips.includes('all_good')) {
      if (emotionalChips.includes('mock_scared')) {
        return 'Mock fear is information — tell your buddy which section made you blank. That\'s the debrief agenda.';
      }
      if (emotionalChips.includes('burned_out')) {
        return 'Burnout logged. One easy session tomorrow is better than skipping. Tell your buddy.';
      }
      if (emotionalChips.includes('comparing')) {
        return 'Comparison mode is expensive prep time. Your only benchmark is last week\'s you.';
      }
      if (emotionalChips.includes('lost_confidence')) {
        return 'Confidence dips after a hard day — your buddy has been exactly here. Talk to them.';
      }
      if (emotionalChips.includes('feeling_behind')) {
        return `${daysBetween(recent[0]?.report_date)} days of data say you're showing up. That's not behind — that's the work.`;
      }
    }

    // Rule 3: consistency signal — logged fewer than 4 of last 7 days
    const last7 = recent.slice(0, 7);
    const studyDaysIn7 = last7.filter((r) => (r.study_duration as number) > 0).length;
    if (last7.length >= 7 && studyDaysIn7 < 4) {
      return `${studyDaysIn7}/7 study days last week. CAT rewards consistency more than intensity.`;
    }

    const coreSections = ['VARC', 'DILR', 'QA'];

    // Rule 4: avoiding a section 3+ days running
    const avoidedFor: Record<string, number> = {};
    for (const section of coreSections) {
      if (todaySections.includes(section)) continue;
      let daysMissed = 0;
      for (const report of recent) {
        const covered = (report.topics_covered as string[]) ?? [];
        if (!covered.includes(section)) daysMissed++;
        else break;
      }
      if (daysMissed >= 3) avoidedFor[section] = daysMissed;
    }
    const worst = Object.entries(avoidedFor).sort(([, a], [, b]) => b - a)[0];
    if (worst) {
      const [section, days] = worst;
      return `Day ${days} of skipping ${section} — that's the section costing you percentile.`;
    }

    // Rule 5: no mock in 7+ days (and today isn't one)
    if (!todaySections.includes('Mock') && recent.length >= 7) {
      const hadRecentMock = recent.slice(0, 7).some((r) => r.mock_taken);
      if (!hadRecentMock) {
        return 'A week without a mock. Book one — your trend needs a data point.';
      }
    }

    // Rule 6: same single section 4+ days running
    const todayCore = todaySections.filter((s) => coreSections.includes(s));
    if (todayCore.length === 1) {
      const section = todayCore[0];
      let runLength = 0;
      for (const report of recent) {
        const covered = ((report.topics_covered as string[]) ?? []).filter((s) => coreSections.includes(s));
        if (covered.length === 1 && covered[0] === section) runLength++;
        else break;
      }
      if (runLength >= 4) {
        return `${runLength} days straight on ${section}. Tomorrow touch your weakest section instead.`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function daysBetween(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return Math.round((Date.now() - d.getTime()) / 86_400_000);
}


async function notifyBuddy(studentId: string, buddyId: string | null, data: { hours: number; energy: string }) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'student_logged',
      title: `${student?.full_name || 'Student'} logged their prep`,
      body: `${data.hours}h · ${data.energy}`,
      data: { student_id: studentId, hours: data.hours, energy: data.energy },
      read: false,
      channel: 'in_app',
    });
  } catch (error) {
    console.error('Failed to notify buddy:', error);
  }
}

// The mock-logged ping — the debrief loop starts here. The 20 minutes after
// a mock are worth more than the 3 hours in it.
async function notifyBuddyMock(studentId: string, buddyId: string | null, logDate: string) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    const name = student?.full_name?.split(' ')[0] || 'Your student';
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'mock_logged',
      title: `${name} finished a mock`,
      body: 'Debrief within 24h — walk it with them while it’s fresh.',
      data: { student_id: studentId, log_date: logDate },
      read: false,
      channel: 'in_app',
      link_url: `/buddy/students/${studentId}`,
    });
  } catch (error) {
    console.error('Failed to send mock notification:', error);
  }
}

async function notifyBuddyEmotional(studentId: string, buddyId: string | null, chips: string[]) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    const name = student?.full_name?.split(' ')[0] || 'Your student';
    const chipLabels: Record<string, string> = {
      mock_scared: 'scared by their mock',
      burned_out: 'feeling burned out',
      comparing: 'comparing themselves to others',
      family_pressure: 'under family pressure',
      lost_confidence: 'losing confidence',
      feeling_behind: 'feeling behind',
    };
    const described = chips.map((c) => chipLabels[c] ?? c).join(', ');
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'emotional_flag',
      title: `${name} flagged an emotional block`,
      body: `They marked: ${described}. Check in with them.`,
      data: { student_id: studentId, chips },
      read: false,
      channel: 'in_app',
      link_url: `/buddy/students/${studentId}`,
    });
  } catch (error) {
    console.error('Failed to send emotional notification:', error);
  }
}

// A student came back after a lapse — the buddy's window to welcome, not scold.
async function notifyBuddyRecovery(studentId: string, buddyId: string | null, missedDays: number) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    const name = student?.full_name?.split(' ')[0] || 'Your student';
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'student_recovered',
      title: `${name} is back after ${missedDays} day${missedDays === 1 ? '' : 's'}`,
      body: 'A good moment to reach out — welcome them back, no guilt.',
      data: { student_id: studentId, missed_days: missedDays },
      read: false,
      channel: 'in_app',
      link_url: `/buddy/students/${studentId}`,
    });
  } catch (error) {
    console.error('Failed to send recovery notification:', error);
  }
}

async function logAnalyticsEvent(studentId: string, eventType: string, metadata: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    await admin.from('analytics_events').insert({ student_id: studentId, event_type: eventType, metadata });
  } catch (error) {
    console.error('Failed to log analytics:', error);
  }
}
