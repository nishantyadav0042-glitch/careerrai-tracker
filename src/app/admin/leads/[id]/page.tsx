import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, PhoneCall } from 'lucide-react';
import { computePrepMemory, computeTopicMemory } from '@/lib/prep-memory-data';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { assessLead, whyContactToday, stepLabel, TIER_META } from '@/lib/lead-intel';
import { OutreachPanel } from './outreach-panel';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TIER_STYLE: Record<string, string> = {
  ready: 'bg-teal-100 text-teal-800',
  high_risk: 'bg-rose-100 text-rose-800',
  dropped_setup: 'bg-amber-100 text-amber-800',
  new: 'bg-blue-100 text-blue-800',
  warming: 'bg-stone-100 text-stone-600',
  inactive: 'bg-stone-100 text-stone-500',
  converted: 'bg-purple-100 text-purple-800',
};

// One page, 20 seconds: who is this, what's their real struggle, why call
// today, what to mention. Every insight is the same signal the student's
// own app shows them — the pitch and the product can never disagree.
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const { data: profile } = await admin.from('profiles')
    .select('id, full_name, phone, college, category, course_year, work_ex_months, is_repeater, is_working_professional, coaching_enrolled, target_percentile, attempt_year, exam_target, dream_colleges, onboarding_completed, onboarding_step_reached, created_at, is_premium, buddy_id')
    .eq('id', id).eq('role', 'student').single();
  if (!profile) notFound();

  const archetype = { isRepeater: !!profile.is_repeater, isWorkingProfessional: !!profile.is_working_professional };
  const signupDate = (profile.created_at as string).split('T')[0];

  const [
    { prepMemory, studentState, signals, revisionDueCount },
    topicMemory,
    { data: streak },
    { data: engagement },
    { data: outreach },
    { data: recentLogs },
    { data: mocks },
  ] = await Promise.all([
    computePrepMemory(admin, id, archetype, signupDate),
    computeTopicMemory(admin, id, archetype),
    admin.from('streak_data').select('current_streak, last_log_date').eq('student_id', id).maybeSingle(),
    admin.from('student_engagement').select('buddy_cta_clicks').eq('student_id', id).maybeSingle(),
    admin.from('lead_outreach').select('owner, status, next_follow_up, notes').eq('student_id', id).maybeSingle(),
    admin.from('daily_reports').select('report_date, study_duration, mock_taken').eq('student_id', id).order('report_date', { ascending: false }).limit(10),
    admin.from('mock_debriefs').select('taken_on, overall_percentile').eq('student_id', id).order('taken_on', { ascending: false }),
  ]);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const lastLog = (streak?.last_log_date as string | null) ?? null;
  const daysSinceLastLog = lastLog ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(lastLog)) / 86_400_000)) : null;
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const daysSinceJoin = Math.floor((Date.now() - new Date(profile.created_at as string).getTime()) / 86_400_000);
  const lastMock = mocks?.[0]?.taken_on as string | undefined;
  const daysSinceLastMock = lastMock ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(lastMock)) / 86_400_000)) : null;
  const avoidedSignal = signals.find((s) => s.key.startsWith('avoid_'));

  const base = {
    onboardingCompleted: profile.onboarding_completed === true,
    onboardingStepReached: (profile.onboarding_step_reached as number | null) ?? 0,
    daysSinceJoin,
    daysSinceLastLog,
    loggedDaysLast7: prepMemory.last7.daysStudied,
    currentStreak: (streak?.current_streak as number | null) ?? 0,
    buddyCtaClicks: (engagement?.buddy_cta_clicks as number | null) ?? 0,
    mocksLogged: prepMemory.mockTrend.count,
    isPremium: profile.is_premium === true,
    hasBuddy: profile.buddy_id != null,
  };
  const assessment = assessLead(base);
  const whyToday = whyContactToday({
    ...base,
    revisionDueCount,
    daysSinceLastMock,
    avoidedSection: avoidedSignal ? avoidedSignal.key.replace('avoid_', '') : null,
  });

  const totalTopics = Object.keys(TOPIC_METADATA).length;
  const studiedOnce = topicMemory.filter((t) => t.status !== 'not_started').length;

  // Biggest gaps — top 3, real signals only, never padded to three.
  const gaps: string[] = [];
  if (daysSinceLastMock == null && base.onboardingCompleted) gaps.push('Never taken a mock');
  else if (daysSinceLastMock != null && daysSinceLastMock > 14) gaps.push(`No mock for ${daysSinceLastMock} days`);
  if (revisionDueCount > 5) gaps.push(`${revisionDueCount} topics overdue for revision`);
  for (const s of signals) { if (gaps.length < 3) gaps.push(s.label); }

  // Coarse timeline — real dated events only, newest first. Fine-grained
  // history accrues from the events we log going forward; nothing here is
  // backfilled or guessed.
  const timeline: { date: string; label: string }[] = [];
  timeline.push({ date: signupDate, label: 'Joined CareerRai' });
  for (const m of (mocks ?? [])) {
    timeline.push({ date: m.taken_on as string, label: `Mock logged${m.overall_percentile != null ? ` · ${m.overall_percentile}%ile` : ''}` });
  }
  for (const r of (recentLogs ?? []).slice(0, 6)) {
    if (!r.mock_taken) timeline.push({ date: r.report_date as string, label: `Logged ${r.study_duration ?? '?'}h study` });
  }
  timeline.sort((a, b) => b.date.localeCompare(a.date));

  const wa = profile.phone ? `https://wa.me/${(profile.phone as string).replace(/\D/g, '')}` : null;
  const firstName = ((profile.full_name as string | null) ?? 'Student').split(' ')[0];

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">
        <div className="flex items-center justify-between">
          <Logo />
          <LogoutButton />
        </div>

        <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700">
          <ArrowLeft className="w-4 h-4" /> All leads
        </Link>

        {/* Identity strip */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{profile.full_name}</h1>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', TIER_STYLE[assessment.tier])}>
              {TIER_META[assessment.tier].label}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {[
              profile.is_repeater ? 'Repeater' : 'First attempt',
              profile.is_working_professional ? 'Working professional' : 'Student',
              profile.coaching_enrolled ? 'In coaching' : 'No coaching',
              profile.target_percentile != null ? `Target ${profile.target_percentile}%ile` : null,
              `Day ${daysSinceJoin + 1}`,
              daysSinceLastLog != null ? `Last active ${daysSinceLastLog === 0 ? 'today' : `${daysSinceLastLog}d ago`}` : 'Never logged',
            ].filter(Boolean).join(' · ')}
          </p>
          {profile.college != null && <p className="text-xs text-stone-400 mt-0.5">{profile.college as string}</p>}
          <div className="mt-2 flex items-center gap-2">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800">
                <PhoneCall className="w-3.5 h-3.5" /> WhatsApp {firstName}
              </a>
            )}
            <span className="text-xs text-stone-400">{profile.phone as string | null}</span>
          </div>
        </div>

        {/* Why contact today — renders only when a real signal fired. */}
        {whyToday && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700 mb-1">Why contact today</p>
            <p className="text-sm font-semibold text-orange-900">{whyToday}</p>
          </div>
        )}

        {/* Dropped mid-setup — the one thing that matters for this tier. */}
        {!base.onboardingCompleted && (
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">Setup incomplete</p>
            <p className="text-sm text-stone-700">
              Stopped at <span className="font-semibold">&ldquo;{stepLabel(base.onboardingStepReached)}&rdquo;</span> — step {base.onboardingStepReached + 1} of 11.
              Whatever they answered before stopping is saved below.
            </p>
          </Card>
        )}

        {/* Preparation summary */}
        {base.onboardingCompleted && (
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Preparation summary</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-stone-500">Studied once</span><span className="font-bold text-stone-900">{studiedOnce}/{totalTopics}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Revision due</span><span className={cn('font-bold', revisionDueCount > 5 ? 'text-rose-600' : 'text-stone-900')}>{revisionDueCount}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Mocks</span><span className="font-bold text-stone-900">{prepMemory.mockTrend.count}{prepMemory.mockTrend.latestPercentile != null ? ` · ${prepMemory.mockTrend.latestPercentile}%ile` : ''}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Consistency</span><span className="font-bold text-stone-900">{prepMemory.last30.daysStudied}/30 days</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Momentum</span><span className="font-bold text-stone-900 capitalize">{studentState.momentum}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Risk</span><span className={cn('font-bold capitalize', studentState.risk.level === 'high' ? 'text-rose-600' : studentState.risk.level === 'medium' ? 'text-orange-600' : 'text-teal-600')}>{studentState.risk.level}</span></div>
            </div>
          </Card>
        )}

        {/* Biggest gaps — what to mention on the call. Facts, not a script:
            the human writes the message, these are the ingredients. */}
        {gaps.length > 0 && (
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Worth mentioning on the call</p>
            <ul className="space-y-1.5">
              {gaps.slice(0, 3).map((g) => (
                <li key={g} className="text-sm text-stone-700 flex gap-2"><span className="text-stone-300">•</span>{g}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Timeline */}
        {timeline.length > 1 && (
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">Recent journey</p>
            <div className="space-y-1.5">
              {timeline.slice(0, 12).map((e, i) => (
                <div key={`${e.date}-${i}`} className="flex items-baseline gap-3 text-sm">
                  <span className="w-16 shrink-0 text-xs text-stone-400 tabular-nums">
                    {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-stone-700">{e.label}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Outreach — the team's working state. */}
        <OutreachPanel
          studentId={id}
          initial={{
            owner: (outreach?.owner as string | null) ?? '',
            status: (outreach?.status as string | null) ?? 'not_contacted',
            next_follow_up: (outreach?.next_follow_up as string | null) ?? '',
            notes: (outreach?.notes as string | null) ?? '',
          }}
        />
      </div>
    </div>
  );
}
