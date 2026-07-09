'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import { Flame, Video } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { LoggingData } from './LoggingModal';
import type { MockDebriefData } from './MockDebriefModal';
import { useLogging, type InitialLogging } from '@/hooks/useLogging';

const LoggingModal = dynamic(() => import('./LoggingModal').then((m) => m.LoggingModal), { ssr: false });
const PendingDebriefCard = dynamic(() => import('./PendingDebriefCard').then((m) => m.PendingDebriefCard), { ssr: false });
const MockDebriefModal = dynamic(() => import('./MockDebriefModal').then((m) => m.MockDebriefModal), { ssr: false });
const FeedbackAnimation = dynamic(() => import('./FeedbackAnimation').then((m) => m.FeedbackAnimation), { ssr: false });

function SessionStrip({ session }: { session: TodaySession }) {
  const startsAt = new Date(session.scheduled_at);
  // eslint-disable-next-line react-hooks/purity
  const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
  const joinable = minsAway <= 15 && !!session.google_meet_link;

  return (
    <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Video className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-indigo-900 truncate">{session.title || 'Buddy session'}</p>
          <p className="text-[11px] text-indigo-600">
            {startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
      {joinable ? (
        <a href={session.google_meet_link!} target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors">
          Join →
        </a>
      ) : (
        <span className="shrink-0 text-[11px] font-medium text-indigo-500">
          {minsAway > 60 ? `in ${Math.round(minsAway / 60)}h` : `in ${Math.max(0, minsAway)}m`}
        </span>
      )}
    </div>
  );
}

interface TodaySession {
  id: string;
  title: string | null;
  scheduled_at: string;
  google_meet_link: string | null;
}

interface DailyTrackerAppProps {
  studentId?: string;
  todaySession?: TodaySession | null;
  hasBuddy?: boolean;
  initialPendingDebrief?: { report_date: string; updated_at: string } | null;
  initialLogging?: InitialLogging | null;
  hasLoggedYesterday?: boolean;
  yesterdayStr?: string;   // ISO date for the API
  yesterdayLabel?: string; // "Jun 16" for the UI
}

// Home's second hero, not a buried strip — Today's Log is one of the app's
// two core loops (the other is Today's Study Plan). Tomorrow's plan, revision
// scheduling, and Buddy feedback all read off what gets logged here, so it
// gets the same visual weight as the routine card, not a footnote under it.
export function DailyTrackerApp({
  studentId = '',
  todaySession = null,
  hasBuddy = false,
  initialPendingDebrief = null,
  initialLogging = null,
  hasLoggedYesterday = true,
  yesterdayStr = '',
  yesterdayLabel = '',
}: DailyTrackerAppProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [currentLogDate, setCurrentLogDate] = useState('');
  const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
  const [lastNudge, setLastNudge] = useState<string | null>(null);
  const [debriefInsight, setDebriefInsight] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // A mock logged in the last 48h with no debrief = the loud #1 card.
  const { data: pendingDebrief } = useQuery({
    queryKey: ['pending-debrief', studentId],
    enabled: !!studentId,
    initialData: initialPendingDebrief ?? undefined,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const supabase = createClient();
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];
      const { data: mockReport } = await supabase
        .from('daily_reports')
        .select('report_date, updated_at')
        .eq('student_id', studentId)
        .eq('mock_taken', true)
        .gte('report_date', twoDaysAgo)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!mockReport) return null;
      const { data: debrief } = await supabase
        .from('mock_debriefs')
        .select('id')
        .eq('student_id', studentId)
        .eq('log_date', mockReport.report_date)
        .maybeSingle();
      return debrief ? null : mockReport;
    },
  });

  // Force the mock debrief until it's filled — closeable, reopens next visit.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (pendingDebrief && !isDebriefOpen) {
      setCurrentLogDate(pendingDebrief.report_date);
      setIsDebriefOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDebrief]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const {
    currentStreak,
    hasLoggedToday,
    isSubmitting,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  } = useLogging(studentId, initialLogging);

  const handleLogSubmit = async (data: LoggingData): Promise<{ mockSelected: boolean }> => {
    const result = await submitLog({ ...data, ...(logDateOverride ? { log_date: logDateOverride } : {}) });
    setLogDateOverride(null);
    if (result?.milestone) setLastNudge(result.milestone);
    else if (result?.daily_nudge) setLastNudge(result.daily_nudge);
    const mockSelected = data.sections.includes('Mock');
    if (mockSelected) {
      const now = new Date();
      const today3am = new Date();
      today3am.setHours(3, 0, 0, 0);
      const logDate = now < today3am ? new Date(today3am.getTime() - 86400000) : today3am;
      setCurrentLogDate(logDate.toISOString().split('T')[0]);
      setIsLogOpen(false);
      setIsDebriefOpen(true);
      queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
    }
    return { mockSelected };
  };

  const handleDebriefSubmit = async (data: MockDebriefData) => {
    const response = await fetch('/api/logging/mock-debrief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, log_date: currentLogDate }),
    });
    if (!response.ok) throw new Error('Failed to save debrief');
    const json = (await response.json()) as { insight?: string | null };
    if (json.insight) setDebriefInsight(json.insight);
    queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
  };

  return (
    <div className="space-y-4">
      {/* Pending mock debrief — the loud #1 card until it's done */}
      {pendingDebrief && !isDebriefOpen && (
        <PendingDebriefCard
          loggedAt={pendingDebrief.updated_at}
          hasBuddy={hasBuddy}
          onStart={() => {
            setCurrentLogDate(pendingDebrief.report_date);
            setIsDebriefOpen(true);
          }}
        />
      )}

      {debriefInsight && (
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <span className="text-xs font-bold text-teal-700 shrink-0 mt-0.5">📊</span>
          <p className="flex-1 min-w-0 text-sm text-teal-900">{debriefInsight}</p>
          <button onClick={() => setDebriefInsight(null)} className="text-teal-500 hover:text-teal-700 text-xs shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Today's Log — Home's second hero, same visual weight as Today's
          Study Plan. A session happening today is nested inside it rather
          than its own section, so Home still structurally has exactly two
          things on it. */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold">Today&apos;s Log</p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500">
            <Flame className={currentStreak > 0 ? 'w-3.5 h-3.5 text-orange-500' : 'w-3.5 h-3.5 text-stone-300'} />
            {currentStreak > 0 ? `${currentStreak}d streak` : 'No streak yet'}
          </span>
        </div>

        {todaySession && <div className="mb-3"><SessionStrip session={todaySession} /></div>}

        {hasLoggedToday ? (
          <div className="py-2 text-center">
            <p className="text-base font-bold text-teal-700">Logged ✓</p>
            <p className="text-xs text-stone-500 mt-1">That&apos;s what tomorrow&apos;s plan is built from.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              onClick={() => { setLogDateOverride(null); setIsLogOpen(true); }}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-stone-900 py-3.5 text-sm font-bold text-white active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Logging…' : "Log today's study →"}
            </button>
            {!hasLoggedYesterday && yesterdayStr && (
              <button
                onClick={() => { setLogDateOverride(yesterdayStr); setIsLogOpen(true); }}
                className="w-full text-center text-xs text-stone-400 hover:text-stone-600"
              >
                Missed {yesterdayLabel}? Log it too →
              </button>
            )}
          </div>
        )}
      </Card>

      <LoggingModal isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} onSubmit={handleLogSubmit} isSubmitting={isSubmitting} />
      <MockDebriefModal isOpen={isDebriefOpen} onClose={() => setIsDebriefOpen(false)} onSubmit={handleDebriefSubmit} logDate={currentLogDate} />
      <FeedbackAnimation isVisible={showFeedback} onComplete={() => setShowFeedback(false)} streakIncrement={currentStreak} bonus={feedbackData?.bonus} noticed={lastNudge} />
    </div>
  );
}
