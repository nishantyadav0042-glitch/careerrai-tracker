import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface LoggingRequest {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
}

const VALID_SECTIONS = ['VARC', 'DILR', 'QA', 'Mock', 'Revision'];
const VALID_ENERGY = ['🙏', '💪', '🔥'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as LoggingRequest;

    if (!Number.isInteger(body.hours) || body.hours < 0 || body.hours > 6) {
      return NextResponse.json({ error: 'Invalid hours (0-6)' }, { status: 400 });
    }
    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json({ error: 'Select at least one section' }, { status: 400 });
    }
    if (!body.sections.every((s) => VALID_SECTIONS.includes(s))) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }
    if (!VALID_ENERGY.includes(body.energy)) {
      return NextResponse.json({ error: 'Invalid energy' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, buddy_id')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // 3 AM boundary
    const now = new Date();
    const today3am = new Date();
    today3am.setHours(3, 0, 0, 0);
    const logDate = now < today3am ? new Date(today3am.getTime() - 86400000) : today3am;
    const dateStr = logDate.toISOString().split('T')[0];

    const { data: existingLog } = await admin
      .from('daily_reports')
      .select('id')
      .eq('student_id', user.id)
      .eq('report_date', dateStr)
      .maybeSingle();

    const logData = {
      student_id: user.id,
      report_date: dateStr,
      study_duration: body.hours,
      topics_covered: body.sections,
      mood_emoji: body.energy,
      mock_taken: body.sections.includes('Mock'),
      total_accuracy: null,
      notes: body.notes || null,
      emotional_chips: body.emotional_chips ?? [],
      // Keep legacy numeric fields at defaults
      quality_focus: 3,
      difficulty: 3,
      confidence: 4,
      stress: 2,
      sleep_quality: 7,
      overall_energy: 4,
      nutrition_exercise: false,
    };

    if (existingLog) {
      await admin.from('daily_reports').update(logData).eq('id', existingLog.id);
    } else {
      await admin.from('daily_reports').insert(logData);
    }

    // Study streak counts study days — a 0-hour log keeps the record, not the flame.
    const streakUpdated = body.hours > 0
      ? await updateStreak(user.id, admin)
      : await getStreak(user.id, admin);
    const dailyNudge = await computePrescriptiveLine(user.id, body.sections, !existingLog, admin, body.emotional_chips);

    let bonus: string | undefined;
    if (Math.random() < 0.2) {
      const bonuses = [
        '3-day streak incoming!',
        'Your buddy will see this!',
        'Keep this momentum going!',
        'Solid consistency — keep it up!',
      ];
      bonus = bonuses[Math.floor(Math.random() * bonuses.length)];
    }

    notifyBuddy(user.id, profile.buddy_id, { hours: body.hours, energy: body.energy }).catch(console.error);
    if (body.sections.includes('Mock')) {
      notifyBuddyMock(user.id, profile.buddy_id, dateStr).catch(console.error);
    }
    if (body.emotional_chips && body.emotional_chips.length > 0 && !body.emotional_chips.includes('all_good')) {
      notifyBuddyEmotional(user.id, profile.buddy_id, body.emotional_chips).catch(console.error);
    }
    logAnalyticsEvent(user.id, 'log_submitted', {
      hours: body.hours,
      sectionCount: body.sections.length,
      hasMock: body.sections.includes('Mock'),
      emotionalChips: body.emotional_chips ?? [],
    }).catch(console.error);

    return NextResponse.json({ success: true, streak: streakUpdated, bonus, daily_nudge: dailyNudge }, { status: 200 });
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

async function getStreak(studentId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from('streak_data')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await admin
    .from('streak_data')
    .insert({ student_id: studentId, current_streak: 0, longest_streak: 0 })
    .select()
    .single();
  return created;
}

async function updateStreak(studentId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: streak, error: getError } = await admin
    .from('streak_data')
    .select('*')
    .eq('student_id', studentId)
    .single();

  const now = new Date();
  const today3am = new Date();
  today3am.setHours(3, 0, 0, 0);
  const logDate = now < today3am ? new Date(today3am.getTime() - 86400000) : today3am;
  const dateStr = logDate.toISOString().split('T')[0];

  if (getError && getError.code === 'PGRST116') {
    const { data: newStreak } = await admin
      .from('streak_data')
      .insert({ student_id: studentId, current_streak: 1, longest_streak: 1, last_log_date: dateStr })
      .select()
      .single();
    return newStreak;
  }

  if (!streak) throw new Error('Could not create or fetch streak');

  const today = new Date(dateStr);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const lastLogDateStr = streak.last_log_date ? new Date(streak.last_log_date).toISOString().split('T')[0] : null;

  if (lastLogDateStr !== dateStr) {
    const newCurrent =
      lastLogDateStr === yesterdayStr ? streak.current_streak + 1 : 1;
    const newLongest = Math.max(streak.longest_streak, newCurrent);

    const { data: updated } = await admin
      .from('streak_data')
      .update({ current_streak: newCurrent, longest_streak: newLongest, last_log_date: dateStr, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .select()
      .single();

    return updated;
  }

  return streak;
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

async function logAnalyticsEvent(studentId: string, eventType: string, metadata: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    await admin.from('analytics_events').insert({ student_id: studentId, event_type: eventType, metadata });
  } catch (error) {
    console.error('Failed to log analytics:', error);
  }
}
