import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface LoggingRequest {
  hours: number;
  topics: string[];
  mood: string;
  mockScore?: { percentile: number; time: number };
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate body
    const body = (await request.json()) as LoggingRequest;

    if (!Number.isInteger(body.hours) || body.hours < 0 || body.hours > 4) {
      return NextResponse.json({ error: 'Invalid hours (0-4)' }, { status: 400 });
    }

    if (!Array.isArray(body.topics) || body.topics.length === 0 || body.topics.length > 3) {
      return NextResponse.json({ error: 'Invalid topics (1-3)' }, { status: 400 });
    }

    if (!['🙏', '💪', '🙌'].includes(body.mood)) {
      return NextResponse.json({ error: 'Invalid mood' }, { status: 400 });
    }

    // 3. Use admin client for database operations
    const admin = createAdminClient();

    // 4. Get student profile
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, buddy_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 5. Determine today's date (3 AM boundary)
    const now = new Date();
    const today3am = new Date();
    today3am.setHours(3, 0, 0, 0);
    const logDate = now < today3am ? new Date(today3am.getTime() - 86400000) : today3am;
    const dateStr = logDate.toISOString().split('T')[0];

    // 6. Check if already logged today
    const { data: existingLog } = await admin
      .from('daily_reports')
      .select('id')
      .eq('student_id', user.id)
      .eq('report_date', dateStr)
      .single();

    // 7. Prepare log data
    const logData = {
      student_id: user.id,
      report_date: dateStr,
      study_duration: body.hours,
      topics_covered: body.topics,
      mood_emoji: body.mood,
      mock_taken: !!body.mockScore,
      total_accuracy: body.mockScore?.percentile ?? null,
      notes: body.notes || null,
      quality_focus: 3, // Default
      difficulty: 3, // Default
      confidence: 4, // Default
      stress: 2, // Default
      sleep_quality: 7, // Default
      overall_energy: 4, // Default
      nutrition_exercise: false,
    };

    // 8. Insert or update log
    if (existingLog) {
      await admin
        .from('daily_reports')
        .update(logData)
        .eq('id', existingLog.id);
    } else {
      await admin
        .from('daily_reports')
        .insert(logData);
    }

    // 9. Update or create streak
    const streakUpdated = await updateStreak(user.id, admin);

    // 10. Calculate bonus (20% chance)
    let bonus: string | undefined;
    if (Math.random() < 0.2) {
      const bonuses = [
        '3-day streak unlocked!',
        '7-day streak bonus incoming!',
        'Your buddy will be impressed!',
        'Keep this momentum going!',
      ];
      bonus = bonuses[Math.floor(Math.random() * bonuses.length)];
    }

    // 11. Notify buddy in background (don't wait)
    notifyBuddy(user.id, profile.buddy_id, { hours: body.hours, mood: body.mood }).catch(
      console.error
    );

    // 12. Log analytics event
    logAnalyticsEvent(user.id, 'log_submitted', {
      hours: body.hours,
      topicCount: body.topics.length,
      hasMock: !!body.mockScore,
    }).catch(console.error);

    return NextResponse.json(
      {
        success: true,
        streak: streakUpdated,
        bonus,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Logging error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateStreak(
  studentId: string,
  admin: ReturnType<typeof createAdminClient>
) {
  // Get current streak
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
    // No streak exists, create one
    const { data: newStreak } = await admin
      .from('streak_data')
      .insert({
        student_id: studentId,
        current_streak: 1,
        longest_streak: 1,
        last_log_date: dateStr,
      })
      .select()
      .single();

    return newStreak;
  }

  if (!streak) {
    throw new Error('Could not create or fetch streak');
  }

  // Check if this is a new day
  const lastLogDate = streak.last_log_date ? new Date(streak.last_log_date) : null;
  const today = new Date(dateStr);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let newCurrent = streak.current_streak;
  let newLongest = streak.longest_streak;

  if (lastLogDate?.toISOString().split('T')[0] !== dateStr) {
    // This is a new day
    if (lastLogDate?.toISOString().split('T')[0] === yesterdayStr) {
      // Streak continues
      newCurrent = streak.current_streak + 1;
      newLongest = Math.max(newLongest, newCurrent);
    } else {
      // Streak broken (or first log)
      newCurrent = 1;
    }

    // Update streak
    const { data: updated } = await admin
      .from('streak_data')
      .update({
        current_streak: newCurrent,
        longest_streak: newLongest,
        last_log_date: dateStr,
        updated_at: new Date().toISOString(),
      })
      .eq('student_id', studentId)
      .select()
      .single();

    return updated;
  }

  // Same day re-log, don't change streak
  return streak;
}

async function notifyBuddy(
  studentId: string,
  buddyId: string | null,
  data: { hours: number; mood: string }
) {
  if (!buddyId) return;

  try {
    const admin = createAdminClient();

    // Get student name
    const { data: student } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single();

    const title = `${student?.full_name || 'Student'} logged their prep`;
    const body = `${data.hours} hours ${data.mood}`;

    // Create notification
    await admin
      .from('notifications')
      .insert({
        user_id: buddyId,
        type: 'student_logged',
        title,
        body,
        data: { student_id: studentId, hours: data.hours, mood: data.mood },
        read: false,
        channel: 'in_app',
      })
      .select()
      .single();
  } catch (error) {
    console.error('Failed to notify buddy:', error);
  }
}

async function logAnalyticsEvent(
  studentId: string,
  eventType: string,
  metadata: Record<string, unknown>
) {
  try {
    const admin = createAdminClient();
    await admin
      .from('analytics_events')
      .insert({
        student_id: studentId,
        event_type: eventType,
        metadata,
      });
  } catch (error) {
    console.error('Failed to log analytics:', error);
  }
}
