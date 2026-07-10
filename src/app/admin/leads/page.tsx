import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { ArrowLeft } from 'lucide-react';
import { assessLead, interventionNeeded, type LeadTier } from '@/lib/lead-intel';
import { STUDENT_BUDGET_TYPES } from '@/lib/notification-os';
import { LeadsList, type LeadRow } from './leads-list';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Leads · CareerRai' };

// The Preparation CRM list: every student who ever logged in — finished or
// dropped — tiered by what their own usage says, buckets first, 20-second
// profiles one tap away. Batch queries only (5 round trips regardless of
// student count); the per-student heavy compute lives on the detail page.
export default async function LeadsPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const twoWeeksAgoIso = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const [{ data: students }, { data: streaks }, { data: recentReports }, { data: engagement }, { data: mockRows }, { data: outreachRows }, { data: nudgeRows }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, college, is_repeater, is_working_professional, coaching_enrolled, target_percentile, onboarding_completed, onboarding_step_reached, created_at, is_premium, buddy_id')
      .eq('role', 'student').eq('is_demo', false)
      .order('created_at', { ascending: false }),
    admin.from('streak_data').select('student_id, current_streak, last_log_date'),
    admin.from('daily_reports').select('student_id, report_date').gte('report_date', weekAgo),
    admin.from('student_engagement').select('student_id, buddy_cta_clicks'),
    admin.from('mock_debriefs').select('student_id'),
    admin.from('lead_outreach').select('student_id, owner, status, next_follow_up'),
    admin.from('notifications').select('user_id, clicked_at').in('type', STUDENT_BUDGET_TYPES).gte('created_at', twoWeeksAgoIso),
  ]);

  const streakById = new Map((streaks ?? []).map((s) => [s.student_id, s]));
  const ctaById = new Map((engagement ?? []).map((e) => [e.student_id, e.buddy_cta_clicks as number]));
  const outreachById = new Map((outreachRows ?? []).map((o) => [o.student_id, o]));
  const mocksById = new Map<string, number>();
  for (const m of mockRows ?? []) mocksById.set(m.student_id, (mocksById.get(m.student_id) ?? 0) + 1);
  const loggedLast7ById = new Map<string, Set<string>>();
  for (const r of recentReports ?? []) {
    if (!loggedLast7ById.has(r.student_id)) loggedLast7ById.set(r.student_id, new Set());
    loggedLast7ById.get(r.student_id)!.add(r.report_date);
  }
  const nudgesById = new Map<string, { sent: number; clicked: number }>();
  for (const n of nudgeRows ?? []) {
    const cur = nudgesById.get(n.user_id) ?? { sent: 0, clicked: 0 };
    cur.sent++;
    if (n.clicked_at != null) cur.clicked++;
    nudgesById.set(n.user_id, cur);
  }

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const nowMs = Date.now();
  const rows: LeadRow[] = (students ?? []).map((s) => {
    const streak = streakById.get(s.id);
    const lastLog = (streak?.last_log_date as string | null) ?? null;
    const daysSinceLastLog = lastLog
      ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(lastLog)) / 86_400_000))
      : null;
    const nudges = nudgesById.get(s.id);
    const signals = {
      onboardingCompleted: s.onboarding_completed === true,
      onboardingStepReached: (s.onboarding_step_reached as number | null) ?? 0,
      daysSinceJoin: Math.floor((nowMs - new Date(s.created_at as string).getTime()) / 86_400_000),
      daysSinceLastLog,
      loggedDaysLast7: loggedLast7ById.get(s.id)?.size ?? 0,
      currentStreak: (streak?.current_streak as number | null) ?? 0,
      buddyCtaClicks: ctaById.get(s.id) ?? 0,
      mocksLogged: mocksById.get(s.id) ?? 0,
      isPremium: s.is_premium === true,
      hasBuddy: s.buddy_id != null,
      nudgesSent14d: nudges?.sent ?? 0,
      nudgesClicked14d: nudges?.clicked ?? 0,
    };
    const assessment = assessLead(signals);
    const outreach = outreachById.get(s.id);
    return {
      id: s.id,
      name: (s.full_name as string | null) ?? 'Student',
      phone: (s.phone as string | null) ?? null,
      college: (s.college as string | null) ?? null,
      isRepeater: s.is_repeater === true,
      isWorkingProfessional: s.is_working_professional === true,
      coachingEnrolled: s.coaching_enrolled === true,
      targetPercentile: (s.target_percentile as number | null) ?? null,
      tier: assessment.tier as LeadTier,
      reasons: assessment.reasons,
      needsHuman: interventionNeeded(signals),
      lastLogDaysAgo: daysSinceLastLog,
      outreachStatus: (outreach?.status as string | null) ?? 'not_contacted',
      outreachOwner: (outreach?.owner as string | null) ?? null,
      nextFollowUp: (outreach?.next_follow_up as string | null) ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <LogoutButton />
        </div>

        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Admin
        </Link>

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Leads</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Every student who ever logged in, tiered by what their own preparation says.
          </p>
        </div>

        <LeadsList rows={rows} />
      </div>
    </div>
  );
}
