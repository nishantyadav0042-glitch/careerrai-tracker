import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_ACTIVE } from '@/lib/notification-os';
import { rankBuddies, type MatchBuddy, type MatchStudent } from '@/lib/buddy-match';
import { withCronTracking } from '@/lib/cron-run-tracker';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// Evening buddy nudge (founder ask): every evening ~7:30pm IST, free students
// (no buddy yet) get ONE extra push showcasing their best-matched IIM mentor,
// deep-linking to the buddy profile. Since 10 Aug it rides dispatch() — the
// founder sanctioned selling the mentor, but INSIDE the shared daily budget
// ('buddy_evening' IS a STUDENT_BUDGET_TYPE now), so the sell is counted,
// capped and measured like every other nudge. Idempotent per IST day.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/buddy-evening', async () => buddyEveningRun());
}

async function buddyEveningRun(): Promise<NextResponse> {
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
    // A mentor who climbed is a better hook than one who was always at the
    // top — a student sitting at 72 can picture themselves in "72 → 98" in a
    // way they cannot in "98". Same journey line the showcase card and
    // matchReason already use, so the push never tells a different story from
    // the page it opens.
    //
    // Only when the jump is REAL. One mentor has first_attempt and final both
    // at 98.6 (he cracked it first time and the setup form recorded both), and
    // "98.6 → 98.6%ile" reads as a typo, not a comeback. Number() because both
    // columns are numeric(x,2) and would otherwise print "98.60".
    const first = top.first_attempt_percentile != null ? Number(top.first_attempt_percentile) : null;
    const final = top.cat_percentile != null ? Number(top.cat_percentile) : null;
    const percentile = final == null ? null
      : first != null && final > first ? `CAT ${first} → ${final}%ile`
      : `CAT ${final}%ile`;
    // One mentor converted six institutes and lists all of them. The full list
    // pushes the body past 150 characters, so the "tap to see how" gets
    // truncated away on the lock screen — the best-known name carries it, and
    // the profile still shows every conversion.
    const school = top.iim_converted?.split(',')[0]?.trim() || null;
    const cred = [school, percentile].filter(Boolean).join(', ');
    const title = 'Are you studying the right things?';
    const body = cred
      ? `${firstName} (${cred}) tells you exactly what to study, skip & fix — tap to see how.`
      : `${firstName} tells you exactly what to study, skip & fix — tap to see how.`;
    const url = '/student/buddy';

    // Through dispatch() (founder, 10 Aug): selling the mentor is sanctioned,
    // but it sells INSIDE the shared daily budget — counted, capped, and
    // measured like every other nudge, never a bypass around them.
    const outcome = await dispatch({
      userId: s.id,
      type: 'buddy_evening',
      title, body, url,
      reason: 'Evening buddy nudge — free student, best-matched mentor',
      expectedAction: 'open_buddy',
      prefs,
      dailyBudget: BUDGET_ACTIVE,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ ok: true, sent });
}

// Vercel Cron invokes endpoints via GET; every other cron route aliases POST
// as GET. Without this, the scheduled GET hit returned 405 and this evening
// nudge silently never fired (audit, 24 Jul).
export { POST as GET };
