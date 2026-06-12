'use client';

import { useState } from 'react';
import { HeroCard } from './HeroCard';
import { LoggingModal, type LoggingData } from './LoggingModal';
import { FeedbackAnimation } from './FeedbackAnimation';
import { DailyPuzzleCard } from './DailyPuzzleCard';
import { PuzzleSolverModal, type PuzzleContent } from './PuzzleSolverModal';
import { TodoListSection } from './TodoListSection';
import { useLogging } from '@/hooks/useLogging';
import { useDailyPuzzle } from '@/hooks/useDailyPuzzle';
import { Loader2 } from 'lucide-react';

interface DailyTrackerAppProps {
  studentId?: string;
}

export function DailyTrackerApp({ studentId = '' }: DailyTrackerAppProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPuzzleOpen, setIsPuzzleOpen] = useState(false);

  const {
    currentStreak,
    maxStreak,
    hasLoggedToday,
    shieldsRemaining,
    isSubmitting,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  } = useLogging();

  const { puzzle, attempt, isLoading: puzzleLoading, submitAttempt } = useDailyPuzzle(studentId);

  const handleSubmit = async (data: LoggingData) => {
    await submitLog(data);
  };

  const puzzleContent = puzzle?.puzzle_content as PuzzleContent | undefined;
  const isPlayablePuzzle = !!puzzleContent?.question && Array.isArray(puzzleContent?.options);

  const handlePuzzleComplete = async (result: { solved: boolean; timeSeconds: number; accuracy: number }) => {
    await submitAttempt({
      solved: result.solved,
      timeSeconds: result.timeSeconds,
      accuracy: result.accuracy,
    });
  };

  return (
    <div className="space-y-6">
      {/* Hero Card - Main CTA */}
      <HeroCard
        currentStreak={currentStreak}
        maxStreak={maxStreak}
        onLogClick={() => setIsModalOpen(true)}
        isLoading={isSubmitting}
        hasLoggedToday={hasLoggedToday}
        shieldsRemaining={shieldsRemaining}
      />

      {/* Daily Puzzle */}
      {puzzleLoading ? (
        <div className="flex items-center justify-center py-6 text-stone-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading today&apos;s puzzle...</span>
        </div>
      ) : puzzle ? (
        <DailyPuzzleCard
          puzzleDate={puzzle.puzzle_date}
          puzzleType={puzzle.puzzle_type}
          difficulty={puzzle.difficulty}
          estimatedTime={puzzle.estimated_time_minutes || 15}
          isSolved={!!attempt}
          timeTaken={attempt?.time_taken_seconds ? Math.max(1, Math.round(attempt.time_taken_seconds / 60)) : undefined}
          accuracy={attempt?.accuracy}
          solution={puzzle.solution}
          explanation={puzzle.explanation}
          onSolve={() => isPlayablePuzzle && setIsPuzzleOpen(true)}
        />
      ) : (
        <div className="rounded-2xl border-2 border-stone-200 bg-stone-50 p-4 text-center">
          <p className="text-sm text-stone-600">🧩 No puzzle today — check back tomorrow!</p>
        </div>
      )}

      {/* Puzzle Solver */}
      {isPlayablePuzzle && puzzle && (
        <PuzzleSolverModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          puzzleType={puzzle.puzzle_type}
          content={puzzleContent!}
          explanation={puzzle.explanation}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* TODO List */}
      {studentId && <TodoListSection studentId={studentId} />}

      {/* Logging Modal */}
      <LoggingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Feedback Animation */}
      <FeedbackAnimation
        isVisible={showFeedback}
        onComplete={() => {
          setShowFeedback(false);
        }}
        streakIncrement={currentStreak}
        bonus={feedbackData?.bonus}
      />
    </div>
  );
}
