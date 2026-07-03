import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { buddyBriefCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// 03:30 UTC = 09:00 IST. The buddy's ONE scheduled push of the day: who logged
// yesterday, who's going quiet. Buddies get few notifications by design — this
// brief plus event pushes (new message, mock submitted, session request) is the
// entire buddy-side surface. Sent only to buddies with at least one student.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const yesterday = new Date(new Date(todayIST + 'T00:00:00+05:30').getTime() - 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(todayIST + 'T00:00:00+05:30').toISOString();

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, buddy_id')
    .eq('role', 'student')
    .not('buddy_id', 'is', null);
  if (!students?.length) return NextResponse.json({ sent: 0, reason: 'no_assigned_students' });

  const byBuddy = new Map<string, { id: string; name: string }[]>();
  for (const s of students) {
    if (!byBuddy.has(s.buddy_id!)) byBuddy.set(s.buddy_id!, []);
    byBuddy.get(s.buddy_id!)!.push({ id: s.id, name: s.full_name.split(' ')[0] });
  }

  const studentIds = students.map((s) => s.id);
  const buddyIds = [...byBuddy.keys()];
  const [{ data: recentReports }, { data: sentToday }, { data: buddyProfiles }] = await Promise.all([
    admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds).gte('report_date', new Date(Date.now() - 4 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })),
    admin.from('notifications').select('user_id').in('user_id', buddyIds).eq('type', 'buddy_brief').gte('created_at', todayStart),
    admin.from('profiles').select('id, notif_prefs, is_demo').in('id', buddyIds),
  ]);

  const reportDates = new Map<string, string[]>();
  for (const r of recentReports ?? []) {
    if (!reportDates.has(r.student_id)) reportDates.set(r.student_id, []);
    reportDates.get(r.student_id)!.push(r.report_date);
  }
  const already = new Set((sentToday ?? []).map((n) => n.user_id));
  const buddyById = new Map((buddyProfiles ?? []).map((b) => [b.id, b]));

  let sent = 0;
  for (const [buddyId, roster] of byBuddy) {
    if (already.has(buddyId)) continue;
    const buddy = buddyById.get(buddyId);
    if (!buddy || buddy.is_demo) continue;

    const loggedYesterday = roster.filter((s) => (reportDates.get(s.id) ?? []).includes(yesterday)).length;
    // "At risk" = no log yesterday AND none the day before.
    const twoDaysAgo = new Date(new Date(yesterday + 'T00:00:00+05:30').getTime() - 86_400_000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const atRisk = roster
      .filter((s) => {
        const dates = reportDates.get(s.id) ?? [];
        return !dates.includes(yesterday) && !dates.includes(twoDaysAgo);
      })
      .map((s) => s.name);

    const { title, body } = buddyBriefCopy(loggedYesterday, roster.length, atRisk);

    await admin.from('notifications').insert({
      user_id: buddyId, type: 'buddy_brief', title, body,
      data: { url: '/buddy/home' }, read: false, channel: 'in_app',
    });
    const prefs = (buddy.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.push === true) await sendPushToUser(buddyId, { title, body, url: '/buddy/home' });
    sent++;
  }

  return NextResponse.json({ sent, buddies: byBuddy.size });
}

export { POST as GET };
