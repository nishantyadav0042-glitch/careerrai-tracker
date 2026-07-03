import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { LogoutButton } from '@/components/logout-button';
import { PushToggle } from '@/components/push-toggle';
import { ShareProgressButton } from '@/components/share-progress-button';
import { Check, GraduationCap, Clock } from 'lucide-react';
import type { NotifPrefs } from '@/types';
import { DreamCollegesCard } from '@/components/dream-colleges-card';
import { MembershipCard } from '@/components/membership-card';
import { EditProfileTrigger } from './edit-profile-trigger';
import { RefundCard } from './refund-card';
import { paymentsEnabled } from '@/lib/feature-flags';
import { getActiveScholarship, scholarshipDisplay } from '@/lib/pricing';
import { rankBuddies, matchReason, type MatchBuddy, type MatchStudent } from '@/lib/buddy-match';
import { RecommendedBuddies, type RecommendedBuddy } from '@/components/recommended-buddies';

export default async function StudentProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, email, exam_target, buddy_id, notif_prefs, created_at, dream_colleges, subscription_status, subscription_plan, subscription_renews_at, baseline_varc, baseline_dilr, baseline_qa, is_working_professional, is_repeater')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');

  // Compute refund window dates from profile (needed for parallel queries below)
  const joinedAt = new Date(profile.created_at);
  const firstMonthEnd = new Date(joinedAt.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const isInFirstMonth = new Date() <= new Date(joinedAt.getTime() + 30 * 24 * 3600 * 1000);
  const REFUND_DAYS_REQUIRED = 20;

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
    showcaseBuddiesResult,
  ] = await Promise.all([
    profile.buddy_id
      ? admin.from('profiles').select('full_name, college, cat_percentile, buddy_bio').eq('id', profile.buddy_id).single()
      : Promise.resolve({ data: null }),
    profile.buddy_id
      ? admin.from('buddy_feedback').select('created_at, feedback_date').eq('buddy_id', profile.buddy_id).gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()).limit(20)
      : Promise.resolve({ data: null }),
    admin.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    admin.from('streak_data').select('current_streak, longest_streak').eq('student_id', user.id).maybeSingle(),
    admin.from('test_results').select('percentile').eq('student_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', user.id).lte('report_date', firstMonthEnd),
    admin.from('refund_requests').select('status, requested_at').eq('student_id', user.id).maybeSingle(),
    paymentsEnabled() ? getActiveScholarship(user.id) : Promise.resolve(null),
    // Free students browse real, setup-complete buddies; contact is what they pay for.
    profile.buddy_id
      ? Promise.resolve({ data: null })
      : admin.from('profiles')
          .select('id, full_name, avatar_url, cat_percentile, first_attempt_percentile, cat_year, iim_converted, current_company, strongest_section, student_types_helped, how_i_work, linkedin_url')
          .eq('role', 'buddy').eq('is_demo', false).eq('buddy_onboarding_completed', true)
          .not('cat_percentile', 'is', null),
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
  const existingRefundReq = refundReqResult.data as { status: string; requested_at: string } | null;

  let scholarship: { label: string; pricing: ReturnType<typeof scholarshipDisplay> } | null = null;
  if (activeScholarship) scholarship = { label: 'Founder scholarship', pricing: scholarshipDisplay(activeScholarship) };

  // Rank showcase buddies for this student (weakest section + profile type)
  const showcaseRaw = (showcaseBuddiesResult.data ?? []) as unknown as MatchBuddy[];
  const recommendedBuddies: RecommendedBuddy[] = rankBuddies(profile as MatchStudent, showcaseRaw)
    .slice(0, 4)
    .map((b) => ({ ...b, reason: matchReason(profile as MatchStudent, b) }));

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

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{displayName}</div>
            {profile.email && <div className="text-sm text-stone-600">{profile.email}</div>}
            <div className="mt-1"><Badge color="stone">{profile.exam_target ?? 'CAT Student'}</Badge></div>
            <EditProfileTrigger />
          </div>
        </div>
      </Card>

      {/* Progress Summary */}
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Your Progress</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{daysLogged ?? 0}</div>
            <div className="text-xs text-stone-500 mt-0.5">Days logged</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{bestStreak}</div>
            <div className="text-xs text-stone-500 mt-0.5">Best streak</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{latestPercentile ? `${Math.round(latestPercentile)}%` : '—'}</div>
            <div className="text-xs text-stone-500 mt-0.5">Latest %ile</div>
          </div>
        </div>
        {latestPercentile !== null && (
          <div className="mb-4">
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-stone-500 mt-1.5">You&apos;re {progressPct}% of the way to your {targetPercentile}%ile target</p>
          </div>
        )}
        <ShareProgressButton daysLogged={daysLogged ?? 0} bestStreak={bestStreak} percentile={latestPercentile} />
      </Card>

      <DreamCollegesCard initial={(profile.dream_colleges as string[] | null) ?? []} />

      {paymentsEnabled() && (
        <MembershipCard
          status={(profile.subscription_status as 'free_beta' | 'active' | 'expired' | 'paused' | 'refund_requested') ?? 'free_beta'}
          plan={(profile.subscription_plan as string | null) ?? null}
          renewsAt={(profile.subscription_renews_at as string | null) ?? null}
          fullName={profile.full_name}
          scholarship={scholarship}
        />
      )}

      {/* Refund guarantee */}
      {(isInFirstMonth || existingRefundReq) && (
        <RefundCard
          daysLogged={refundDaysLogged}
          required={REFUND_DAYS_REQUIRED}
          eligible={refundEligible}
          existingRequest={existingRefundReq ? { status: existingRefundReq.status as 'pending' | 'approved' | 'rejected', requestedAt: existingRefundReq.requested_at } : null}
        />
      )}

      {/* Free students: browse real mentors — the product behind the paywall */}
      {!profile.buddy_id && <RecommendedBuddies buddies={recommendedBuddies} studentName={displayName} />}

      {/* Buddy Trust Signals */}
      {buddy && (
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">Your Buddy</div>
        {buddy ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {buddyInitials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-stone-900">{buddy.full_name}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {buddy.college && (
                    <Badge color="blue"><GraduationCap className="w-3 h-3 inline mr-1" />{buddy.college}</Badge>
                  )}
                  {buddy.cat_percentile && (
                    <Badge color="orange">{Number(buddy.cat_percentile).toFixed(0)}%ile CAT</Badge>
                  )}
                </div>
              </div>
            </div>
            {buddy.buddy_bio && (
              <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-teal-300 pl-3">
                &quot;{buddy.buddy_bio}&quot;
              </p>
            )}
            {responseHours !== null && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <Clock className="w-3.5 h-3.5" />
                Responds within {responseHours} hr{responseHours === 1 ? '' : 's'} — verified
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-900">Not yet assigned</span>
          </div>
        )}
        {profile.buddy_id && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <Badge color="green"><Check className="w-3 h-3 inline mr-1" />Connected</Badge>
          </div>
        )}
      </Card>
      )}

      <NotifPrefsPanel initial={prefs} label1="Daily reminder" label2="Email notifications" />

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Push notifications</div>
        <PushToggle initialEnabled={prefs.push ?? false} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        <p className="text-xs text-stone-400 mt-2">Get instant alerts on your device even when the app is closed.</p>
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Member since</div>
        <div className="text-sm font-semibold text-stone-900">
          {new Date(profile.created_at).toLocaleDateString('en-IN', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </div>
      </Card>

      <LogoutButton />
    </div>
  );
}
