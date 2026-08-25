import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { NotifPrefs } from '@/types';
import { paymentsEnabled } from '@/lib/feature-flags';
import { getActiveScholarship, scholarshipDisplay } from '@/lib/pricing';
import { ProfilePanelTabs } from '@/components/profile-panel-tabs';
import { ProfileOverview } from './profile-overview';
import { HistorySection } from './history-section';
import { SettingsSection } from './settings-section';

export default async function StudentProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, email, exam_target, buddy_id, notif_prefs, created_at, dream_colleges, subscription_status, subscription_plan, subscription_renews_at, baseline_varc, baseline_dilr, baseline_qa, is_working_professional, is_repeater, push_subscription, push_died_at')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');

  // Compute refund window dates from profile (needed for parallel queries below)
  const joinedAt = new Date(profile.created_at);
  const firstMonthEnd = new Date(joinedAt.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const isInFirstMonth = new Date() <= new Date(joinedAt.getTime() + 30 * 24 * 3600 * 1000);
  const REFUND_DAYS_REQUIRED = 20;
   
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Fire all remaining queries in parallel — reduces 7 sequential round-trips to 1 batch.
  const [
    buddyResult,
    buddyFeedbackResult,
    daysLoggedResult,
    streakResult,
    latestTestResult,
    firstMonthDaysResult,
    refundReqResult,
    activeScholarship,
  ] = await Promise.all([
    profile.buddy_id
      ? admin.from('profiles').select('full_name, college, cat_percentile, buddy_bio').eq('id', profile.buddy_id).single()
      : Promise.resolve({ data: null }),
    profile.buddy_id
      ? admin.from('buddy_feedback').select('created_at, feedback_date').eq('buddy_id', profile.buddy_id).gte('created_at', thirtyDaysAgoIso).limit(20)
      : Promise.resolve({ data: null }),
    admin.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    admin.from('streak_data').select('current_streak, longest_streak').eq('student_id', user.id).maybeSingle(),
    admin.from('test_results').select('percentile').eq('student_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', user.id).lte('report_date', firstMonthEnd),
    admin.from('refund_requests').select('status, requested_at').eq('student_id', user.id).maybeSingle(),
    paymentsEnabled() ? getActiveScholarship(user.id) : Promise.resolve(null),
  ]);

  const buddy = buddyResult.data as { full_name: string; college: string | null; cat_percentile: number | null; buddy_bio: string | null } | null;

  // Response rate: avg gap between feedback creation and the day it covers (last 30 days)
  let responseHours: number | null = null;
  const recentFeedback = buddyFeedbackResult.data as { created_at: string; feedback_date: string }[] | null;
  if (recentFeedback && recentFeedback.length > 0) {
    const gaps = recentFeedback
      .map((f) => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3600000)
      .filter((h) => h >= 0 && h < 24 * 7);
    if (gaps.length > 0) {
      responseHours = Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length));
    }
  }

  const { count: daysLogged } = daysLoggedResult;
  const streak = streakResult.data;
  const latestTest = latestTestResult.data;
  const bestStreak = streak?.longest_streak ?? 0;
  const latestPercentile: number | null = latestTest?.percentile ?? null;
  const targetPercentile = 90;
  const progressPct = latestPercentile ? Math.min(100, Math.round((latestPercentile / targetPercentile) * 100)) : 0;

  const refundDaysLogged = firstMonthDaysResult.count ?? 0;
  const refundEligible = refundDaysLogged >= REFUND_DAYS_REQUIRED;
  const existingRefundReq = refundReqResult.data as { status: 'pending' | 'approved' | 'rejected'; requested_at: string } | null;

  let scholarship: { label: string; pricing: ReturnType<typeof scholarshipDisplay> } | null = null;
  if (activeScholarship) scholarship = { label: 'Founder scholarship', pricing: scholarshipDisplay(activeScholarship) };


  const displayName = profile.full_name ?? 'Student';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const buddyInitials = buddy ? (buddy.full_name ?? '').split(' ').map((n: string) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?' : '';
  const defaultPrefs: NotifPrefs = { daily_reminder: true, reminder_time: '20:00', email: true, push: false };
  const prefs: NotifPrefs = { ...defaultPrefs, ...(profile.notif_prefs ?? {}) };

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Profile</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>You</h1>
      </div>

      <ProfilePanelTabs
        profile={
          <ProfileOverview
            displayName={displayName}
            email={profile.email}
            examTarget={profile.exam_target}
            initials={initials}
            profile={profile}
            buddy={buddy}
            buddyInitials={buddyInitials}
            buddyId={profile.buddy_id}
            responseHours={responseHours}
            daysLogged={daysLogged ?? 0}
            bestStreak={bestStreak}
            latestPercentile={latestPercentile}
            targetPercentile={targetPercentile}
            progressPct={progressPct}
            isInFirstMonth={isInFirstMonth}
            refundDaysLogged={refundDaysLogged}
            refundEligible={refundEligible}
            existingRefundReq={existingRefundReq ? { status: existingRefundReq.status, requestedAt: existingRefundReq.requested_at } : null}
            REFUND_DAYS_REQUIRED={REFUND_DAYS_REQUIRED}
            scholarship={scholarship}
            prefs={prefs}
            hasPushSubscription={!!profile.push_subscription}
            pushDiedAt={(profile.push_died_at as string | null) ?? null}
          />
        }
        history={<HistorySection />}
        settings={<SettingsSection />}
      />

      {/* EveningBuddyPop stood here — a THIRD buddy-pitch mechanism with its
          own localStorage throttle, on the student's own profile screen.
          Removed with the storefront (founder, 26 Aug): one pitch per student
          per study day, owned by promo_impressions, and My Profile is not a
          sales surface. */}
    </div>
  );
}
