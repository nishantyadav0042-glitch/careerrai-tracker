import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';

// Rotating Zomato/Swiggy-style copy — one personality, never the same nag twice in a row.
const REMINDER_VARIANTS: { title: string; body: (name: string) => string }[] = [
  {
    title: 'Aaj padhai hui ya nahi? 👀',
    body: () => "90 seconds. Log it before your streak files a complaint.",
  },
  {
    title: 'Knock knock. It’s your streak 🔥',
    body: () => 'It’s getting cold out here. One tap keeps it alive.',
  },
  {
    title: 'Plot twist: toppers log daily 📈',
    body: (name) => `Be the main character, ${name}. 90 seconds.`,
  },
  {
    title: 'Your books just texted us 📚',
    body: () => 'They said you two had a moment today. Make it official — log it.',
  },
  {
    title: 'Breaking news 🚨',
    body: (name) => `${name} studied all day and told no one. Don’t be tonight’s headline.`,
  },
  {
    title: 'CAT won’t wait. Neither will 3 AM ⏰',
    body: () => 'Log today’s prep — your future IIM self says thanks.',
  },
  {
    title: 'VARC, DILR ya QA? 🤔',
    body: () => 'Whatever you touched today, it counts. Log it in 90 seconds.',
  },
];

function pickVariant(name: string, streak: number) {
  // Streak-aware copy beats generic copy
  if (streak >= 7) {
    return {
      title: `${streak} days of fire 🔥 Don’t stop now`,
      body: `Day ${streak + 1} is one tap away, ${name}. Toppers don’t take L’s on technicalities.`,
    };
  }
  if (streak >= 3) {
    return {
      title: 'Your streak is on one leg 🦵🔥',
      body: `${streak} days strong — day ${streak + 1} is 90 seconds away.`,
    };
  }
  // Rotate by day of year so everyone gets fresh copy daily
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
  );
  const v = REMINDER_VARIANTS[dayOfYear % REMINDER_VARIANTS.length];
  return { title: v.title, body: v.body(name) };
}

// Called by Vercel Cron at 14:30 UTC = 8:00 PM IST every day
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Get all students
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, current_streak')
    .eq('role', 'student');
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  // Find students who haven't submitted today
  const studentIds = students.map(s => s.id);
  const { data: todayReports } = await admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today);
  const submittedIds = new Set((todayReports ?? []).map(r => r.student_id));

  const pending = students.filter(s => !submittedIds.has(s.id));

  let reminded = 0;
  for (const s of pending) {
    const prefs = s.notif_prefs ?? {};
    const firstName = s.full_name.split(' ')[0];
    const { title, body } = pickVariant(firstName, s.current_streak ?? 0);

    // In-app notification
    await admin.from('notifications').insert({
      user_id: s.id,
      type: 'daily_reminder',
      title,
      body,
      data: { url: '/student/tracker' },
      read: false,
      channel: 'in_app',
    });

    // Email
    if (prefs.email !== false && s.email) {
      await sendDailyReminder(s.email, firstName);
    }

    // Push
    if (prefs.push === true) {
      await sendPushToUser(s.id, {
        title,
        body,
        url: '/student/tracker',
      });
    }

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

// Allow Vercel cron to call via GET too
export { POST as GET };
