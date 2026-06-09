import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendIcon } from '@/components/trend-icon';
import { CATTestWidget } from './cat-test-widget';
import { StudentHomeClient } from './home-client';
import { StreakHero } from './streak-hero';
import { BuddySignalCard } from './buddy-signal-card';
import { CATContextCard } from './cat-context-card';
import { HeatmapCard } from './heatmap-card';
import { BuddyFeedbackCard } from './buddy-feedback-card';
import { StudentVoiceNotesCard } from './student-voice-notes-card';
import { VideoSessionsCard } from './video-sessions-card';
import { computeSummary, getHeatmapData } from '@/lib/analytics';
import { getTodayIST, formatDateLong } from '@/lib/utils';
import type { DailyReport } from '@/types';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function StudentHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, buddy_id')
    .eq('id', user.id)
    .single();

  const today = getTodayIST();

  const { data: reports } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('student_id', user.id)
    .order('report_date', { ascending: false })
    .limit(30);

  const allReports = (reports ?? []) as DailyReport[];
  const last7 = allReports.slice(0, 7);
  const submittedToday = allReports.some((r) => r.report_date === today);
  const summary = computeSummary(last7, 7);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Friend';

  return (
    <StudentHomeClient>
      <div className="space-y-4 sm:space-y-5">
      {/* Greeting - COMPACT */}
      <div className="px-0.5 sm:px-1 py-1">
        <h1 className="text-lg sm:text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Hey {firstName}! 👋
        </h1>
      </div>

      {/* PHASE 3: NEW HOME PAGE REDESIGN */}
      {/* 1. STREAK HERO - PRIMARY GAMIFICATION & RETENTION */}
      <StreakHero userId={user.id} />

      {/* 2. VIDEO SESSIONS - Upcoming calls with buddy */}
      <VideoSessionsCard userId={user.id} />

      {/* 3. BUDDY FEEDBACK - PRIORITY ACTION ITEM */}
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl p-5 border-2 border-teal-200">
        <BuddyFeedbackCard studentId={user.id} buddyId={profile?.buddy_id || ''} buddyName="Your Buddy" />
      </div>

      {/* 4. STUDENT VOICE NOTES - ACTION ITEM */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-5 border-2 border-orange-200">
        <StudentVoiceNotesCard studentId={user.id} buddyId={profile?.buddy_id || ''} />
      </div>

      {/* 5. BUDDY SIGNAL - Shows relationship is real */}
      <BuddySignalCard userId={user.id} />

      {/* 6. DAYS TO CAT - Context for urgency */}
      <CATContextCard />

      {/* 7. CAT READINESS TEST (kept for prominence) */}
      <CATTestWidget userId={user.id} />

      {/* 8. TODAY STATUS */}
      <div className={cn('p-5 rounded-2xl border-2', submittedToday ? 'border-emerald-200 bg-emerald-50/40 bg-white' : 'border-orange-200 bg-orange-50/40 bg-white')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {submittedToday ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Clock className="w-4 h-4 text-orange-600" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                {submittedToday ? 'Done for today' : 'Pending'}
              </span>
            </div>
            <p className="text-base font-semibold text-stone-900">
              {submittedToday ? 'Report submitted ✓' : "Today's report not filled"}
            </p>
            <p className="text-xs text-stone-600 mt-0.5">{formatDateLong(today)}</p>
          </div>
          <Link
            href="/student/today"
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              submittedToday
                ? 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            )}
          >
            {submittedToday ? 'Edit' : 'Fill now'} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* 9. QUICK STATS FROM LAST 7 DAYS */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Your progress</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Avg study/day</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.avgStudy.toFixed(1)}</span>
              <span className="text-xs text-stone-500">hrs</span>
              <TrendIcon trend={summary.studyTrend} />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Mock tests</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.totalMocks}</span>
              <span className="text-xs text-stone-500">/ 7</span>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Confidence</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.avgConfidence.toFixed(1)}</span>
              <span className="text-xs text-stone-500">/5</span>
              <TrendIcon trend={summary.confidenceTrend} />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Stress</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.avgStress.toFixed(1)}</span>
              <span className="text-xs text-stone-500">/5</span>
              <TrendIcon trend={summary.stressTrend} invert />
            </div>
          </Card>
        </div>
      </div>

      {/* 7-Day Heatmap (14-day moved to Reports page) */}
      <HeatmapCard daysData={getHeatmapData(allReports, 7)} days={7} />

      <Link
        href="/student/reports"
        className="w-full flex items-center justify-center gap-2 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
      >
        View full report <ArrowRight className="w-4 h-4" />
      </Link>
      </div>
    </StudentHomeClient>
  );
}
