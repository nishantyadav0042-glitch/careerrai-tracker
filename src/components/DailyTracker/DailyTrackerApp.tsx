'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import { HeroCard } from './HeroCard';
import type { LoggingData } from './LoggingModal';
const LoggingModal = dynamic(
  () => import('./LoggingModal').then((m) => m.LoggingModal),
  { ssr: false }
);
const PendingDebriefCard = dynamic(
  () => import('./PendingDebriefCard').then((m) => m.PendingDebriefCard),
  { ssr: false }
);
import { BuddyInsightCard } from './BuddyInsightCard';
import { BrainBreakCard } from './BrainBreakCard';
import { SafeCard } from './SafeCard';
import type { MockDebriefData } from './MockDebriefModal';
import type { GameType } from './DailyPuzzleCard';
import type { PuzzleContent } from './PuzzleSolverModal';
import { isDetectiveCase, isEscapeRoom, isMafiaGame } from './game-types';

// Heavy modals — only loaded when the user actually opens them.
const MockDebriefModal = dynamic(
  () => import('./MockDebriefModal').then((m) => m.MockDebriefModal),
  { ssr: false }
);
const MissRecoveryModal = dynamic(
  () => import('./MissRecoveryModal').then((m) => m.MissRecoveryModal),
  { ssr: false }
);
const FeedbackAnimation = dynamic(
  () => import('./FeedbackAnimation').then((m) => m.FeedbackAnimation),
  { ssr: false }
);
const DailyPuzzleCard = dynamic(
  () => import('./DailyPuzzleCard').then((m) => m.DailyPuzzleCard),
  { ssr: false }
);
const PuzzleSolverModal = dynamic(
  () => import('./PuzzleSolverModal').then((m) => m.PuzzleSolverModal),
  { ssr: false }
);
const DetectiveCaseModal = dynamic(
  () => import('./DetectiveCaseModal').then((m) => m.DetectiveCaseModal),
  { ssr: false }
);
const EscapeRoomModal = dynamic(
  () => import('./EscapeRoomModal').then((m) => m.EscapeRoomModal),
  { ssr: false }
);
const MafiaLogicModal = dynamic(
  () => import('./MafiaLogicModal').then((m) => m.MafiaLogicModal),
  { ssr: false }
);
import { useLogging, type InitialLogging } from '@/hooks/useLogging';
import { useDailyPuzzle } from '@/hooks/useDailyPuzzle';
import { Loader2, Video } from 'lucide-react';

// ── Feature flags — disable without deleting (re-enable by changing to true) ──
// Brain break: unvalidated break-containment hypothesis; hidden for 60-day cohort.
const BRAIN_BREAK_ENABLED = true;
// Daily puzzle: content pipeline not ready; hidden until populated.
const DAILY_PUZZLE_ENABLED = false;

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
          <p className="text-xs font-semibold text-indigo-900 truncate">
            {session.title || 'Buddy session'}
          </p>
          <p className="text-[11px] text-indigo-600">
            {startsAt.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            })}
          </p>
        </div>
      </div>
      {joinable ? (
        <a
          href={session.google_meet_link!}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
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
  buddyId?: string | null;
  buddyName?: string | null;
  initialPendingDebrief?: { report_date: string; updated_at: string } | null;
  initialFeedback?: { feedback_text: string; feedback_date: string; feedback_type: string } | null;
  recovery?: { missedDays: number; previousStreak: number } | null;
  initialLogging?: InitialLogging | null;
  missionName?: string;
  missionFocus?: string;
  daysInMission?: number;
  missionTarget?: number;
  hasLoggedYesterday?: boolean;
  yesterdayStr?: string;   // ISO date for the API
  yesterdayLabel?: string; // "Jun 16" for the UI
}

export function DailyTrackerApp({
  studentId = '',
  todaySession = null,
  hasBuddy = false,
  buddyId = null,
  buddyName = null,
  initialPendingDebrief = null,
  initialFeedback = null,
  recovery = null,
  initialLogging = null,
  missionName = '',
  missionFocus = '',
  daysInMission = 0,
  missionTarget = 30,
  hasLoggedYesterday = true,
  yesterdayStr = '',
  yesterdayLabel = '',
}: DailyTrackerAppProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [isPuzzleOpen, setIsPuzzleOpen] = useState(false);
  const [currentLogDate, setCurrentLogDate] = useState('');
  const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
  const [lastNudge, setLastNudge] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(!!recovery);
  const [debriefInsight, setDebriefInsight] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // A mock logged in the last 48h with no debrief = the loud #1 card.
  // initialPendingDebrief comes from the server component (zero client waterfall on load).
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

  // Force the mock debrief: if a mock was logged but isn't debriefed yet, open
  // the debrief automatically — on first load and on every later visit — until
  // the student fills it. It stays closeable (so nobody is bricked); closing it
  // just brings back the loud pending-debrief card, and it reopens next visit.
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
    maxStreak,
    hasLoggedToday,
    isSubmitting,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  } = useLogging(studentId, initialLogging);

  const { puzzle, attempt, isLoading: puzzleLoading, submitAttempt } = useDailyPuzzle(studentId, DAILY_PUZZLE_ENABLED);

  const handleLogSubmit = async (data: LoggingData): Promise<{ mockSelected: boolean }> => {
    const result = await submitLog({ ...data, ...(logDateOverride ? { log_date: logDateOverride } : {}) });
    setLogDateOverride(null);
    if (result?.milestone) setLastNudge(result.milestone);
    else if (result?.daily_nudge) setLastNudge(result.daily_nudge);
    const mockSelected = data.sections.includes('Mock');
    if (mockSelected) {
      // Compute today's log date (same 3 AM boundary logic)
      const now = new Date();
      const today3am = new Date();
      today3am.setHours(3, 0, 0, 0);
      const logDate = now < today3am ? new Date(today3am.getTime() - 86400000) : today3am;
      setCurrentLogDate(logDate.toISOString().split('T')[0]);
      setIsLogOpen(false);
      setIsDebriefOpen(true);
      // If they skip the debrief, the pending card takes over on home
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

  const rawContent = puzzle?.puzzle_content;
  const puzzleContent = rawContent as PuzzleContent | undefined;
  const isEscape = isEscapeRoom(rawContent);
  const isMafia = isMafiaGame(rawContent);
  const isCasePuzzle = !isEscape && !isMafia && isDetectiveCase(rawContent);
  const isPlayablePuzzle =
    isCasePuzzle || isEscape || isMafia || (!!puzzleContent?.question && Array.isArray(puzzleContent?.options));

  const gameType: GameType = isEscape
    ? 'escape_room'
    : isMafia
    ? 'mafia'
    : isCasePuzzle && (rawContent as { game_type?: string }).game_type === 'airport'
    ? 'airport'
    : 'detective';

  const handlePuzzleComplete = async (result: { solved: boolean; timeSeconds: number; accuracy: number }) => {
    await submitAttempt({ solved: result.solved, timeSeconds: result.timeSeconds, accuracy: result.accuracy });
  };

  void maxStreak; // available for future use in HeroCard

  return (
    <div className="space-y-5">
      {/* Miss-recovery — the compassionate restart for a returning student. */}
      {recovery && showRecovery && !hasLoggedToday && (
        <MissRecoveryModal
          missedDays={recovery.missedDays}
          previousStreak={recovery.previousStreak}
          onRestart={() => { setShowRecovery(false); setIsLogOpen(true); }}
          onDismiss={() => setShowRecovery(false)}
        />
      )}

      {/* 0. Pending mock debrief — the loud #1 card until it's done */}
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

      {/* Post-debrief insight — one factual sentence, manually dismissible */}
      {debriefInsight && (
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <span className="text-xs font-bold text-teal-700 shrink-0 mt-0.5">📊</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-teal-900">{debriefInsight}</p>
          </div>
          <button
            onClick={() => setDebriefInsight(null)}
            className="text-teal-500 hover:text-teal-700 text-xs shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Hero — Monthly mission ring + streak + log */}
      <HeroCard
        missionName={missionName}
        missionFocus={missionFocus}
        daysInMission={daysInMission}
        missionTarget={missionTarget}
        currentStreak={currentStreak}
        onLogClick={() => { setLogDateOverride(null); setIsLogOpen(true); }}
        isLoading={isSubmitting}
        hasLoggedToday={hasLoggedToday}
        showLogYesterday={!hasLoggedYesterday}
        onLogYesterdayClick={() => { setLogDateOverride(yesterdayStr); setIsLogOpen(true); }}
        yesterdayLabel={yesterdayLabel}
      />

      {/* 2. Daily Puzzle — hidden until content pipeline is ready */}
      {DAILY_PUZZLE_ENABLED && (puzzleLoading ? (
        <div className="flex items-center justify-center py-6 text-stone-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading today&apos;s puzzle...</span>
        </div>
      ) : puzzle ? (
        <DailyPuzzleCard
          puzzleDate={puzzle.puzzle_date}
          puzzleType={puzzle.puzzle_type}
          gameType={gameType}
          difficulty={puzzle.difficulty}
          title={(rawContent as { title?: string } | undefined)?.title}
          estimatedTime={puzzle.estimated_time_minutes || 15}
          isSolved={!!attempt}
          timeTaken={attempt?.time_taken_seconds ? Math.max(1, Math.round(attempt.time_taken_seconds / 60)) : undefined}
          accuracy={attempt?.accuracy}
          solution={puzzle.solution}
          explanation={puzzle.explanation}
          onSolve={() => isPlayablePuzzle && setIsPuzzleOpen(true)}
        />
      ) : null)}

      {/* 3. Buddy insight — 1 line */}
      {studentId && (
        <SafeCard>
          <BuddyInsightCard studentId={studentId} buddyId={buddyId} buddyName={buddyName} dailyNudge={lastNudge} initialFeedback={initialFeedback} />
        </SafeCard>
      )}

      {/* 4. Today's session strip */}
      {todaySession && <SessionStrip session={todaySession} />}

      {/* 5. Brain Break — 90-sec sprint games */}
      {BRAIN_BREAK_ENABLED && studentId && (
        <SafeCard>
          <BrainBreakCard studentId={studentId} />
        </SafeCard>
      )}

      {/* Puzzle modals — only rendered when DAILY_PUZZLE_ENABLED */}
      {DAILY_PUZZLE_ENABLED && isCasePuzzle && puzzle && (
        <DetectiveCaseModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={puzzle.puzzle_content as any}
          explanation={puzzle.explanation}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {DAILY_PUZZLE_ENABLED && isEscape && puzzle && (
        <EscapeRoomModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={puzzle.puzzle_content as any}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {DAILY_PUZZLE_ENABLED && isMafia && puzzle && (
        <MafiaLogicModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={puzzle.puzzle_content as any}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {DAILY_PUZZLE_ENABLED && !isCasePuzzle && !isEscape && !isMafia && isPlayablePuzzle && puzzle && (
        <PuzzleSolverModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          puzzleType={puzzle.puzzle_type}
          content={puzzleContent!}
          explanation={puzzle.explanation}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Layer 1 Log */}
      <LoggingModal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        onSubmit={handleLogSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Layer 2 Debrief */}
      <MockDebriefModal
        isOpen={isDebriefOpen}
        onClose={() => setIsDebriefOpen(false)}
        onSubmit={handleDebriefSubmit}
        logDate={currentLogDate}
      />

      {/* Feedback Animation */}
      <FeedbackAnimation
        isVisible={showFeedback}
        onComplete={() => setShowFeedback(false)}
        streakIncrement={currentStreak}
        bonus={feedbackData?.bonus}
        noticed={lastNudge}
      />
    </div>
  );
}
