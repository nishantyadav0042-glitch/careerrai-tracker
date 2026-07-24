import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendPushToUser } from '@/lib/push';
import { rankBuddies, type MatchBuddy, type MatchStudent } from '@/lib/buddy-match';

// Evening buddy nudge (founder ask): every evening ~7:30pm IST, free students
// (no buddy yet) get ONE extra push showcasing their best-matched IIM mentor,
// deep-linking to the buddy profile. Deliberately an EXTRA nudge, not a
// replacement — and kept OUT of the study-companion budget (type
// 'buddy_evening' is not a STUDENT_BUDGET_TYPE) so it never starves the daily
// log reminder. Idempotent per IST day.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const todayStart = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  // Buddy pool — fetched once, ranked per student.
  const { data: buddies } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, cat_percentile, first_attempt_percentile, cat_year, iim_converted, current_company, strongest_section, student_types_helped, how_i_work, linkedin_url')
    .eq('role', 'buddy')
    .eq('buddy_onboarding_completed', true)
    .not('cat_percentile', 'is', null)
    .not('is_test_account', 'is', true);
  if (!buddies?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no_buddies' });

  // Free students with a live push subscription. Premium/assigned students are
  // filtered out (buddy_id null + is_premium not true).
  const { data: students } = await admin
    .from('profiles')
    .select('id, is_premium, notif_prefs, baseline_varc, baseline_dilr, baseline_qa, is_working_professional, is_repeater')
    .eq('role', 'student')
    .is('buddy_id', null)
    .not('push_subscription', 'is', null);
  if (!students?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no_students' });

  // Idempotency: who already got today's buddy nudge.
  const { data: already } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', 'buddy_evening')
    .gte('created_at', todayStart);
  const sentToday = new Set((already ?? []).map((r) => r.user_id));

  let sent = 0;
  for (const s of students) {
    if (s.is_premium === true) continue;               // free only
    if (sentToday.has(s.id)) continue;                 // already nudged today
    const prefs = (s.notif_prefs ?? {}) as { push?: boolean };
    if (prefs.push === false) continue;                // respect an explicit opt-out

    const ranked = rankBuddies(s as MatchStudent, buddies as MatchBuddy[]);
    const top = ranked[0];
    if (!top) continue;

    const firstName = (top.full_name || 'Your buddy').split(' ')[0];
    const cred = [top.iim_converted, top.cat_percentile ? `CAT ${top.cat_percentile}%ile` : null]
      .filter(Boolean).join(', ');
    const title = 'Are you studying the right things?';
    const body = cred
      ? `${firstName} (${cred}) tells you exactly what to study, skip & fix — tap to see how.`
      : `${firstName} tells you exactly what to study, skip & fix — tap to see how.`;
    const url = '/student/buddy';

    const { data: row } = await admin
      .from('notifications')
      .insert({
        user_id: s.id, type: 'buddy_evening', title, body,
        data: { url }, read: false, channel: 'in_app',
        reason: 'Evening buddy nudge — free student, best-matched mentor',
        expected_action: 'open_buddy',
      })
      .select('id')
      .single();

    const res = await sendPushToUser(s.id, { title, body, url, notifId: row?.id as string | undefined });
    if (res.ok && row?.id) {
      await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', row.id);
    }
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}

// Vercel Cron invokes endpoints via GET; every other cron route aliases POST
// as GET. Without this, the scheduled GET hit returned 405 and this evening
// nudge silently never fired (audit, 24 Jul).
export { POST as GET };
