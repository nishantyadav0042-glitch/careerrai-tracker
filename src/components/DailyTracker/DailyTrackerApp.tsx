'use client';

import { useState } from 'react';
import { HeroCard } from './HeroCard';
import { LoggingModal, type LoggingData } from './LoggingModal';
import { FeedbackAnimation } from './FeedbackAnimation';
import { DailyPuzzleCard } from './DailyPuzzleCard';
import { TodoListSection } from './TodoListSection';
import { useLogging } from '@/hooks/useLogging';
import { useDailyPuzzle } from '@/hooks/useDailyPuzzle';
import { Loader2 } from 'lucide-react';

interface DailyTrackerAppProps {
  studentId?: string;
}

export function DailyTrackerApp({ studentId = '' }: DailyTrackerAppProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const handleSolvePuzzle = async () => {
    // In real app, would navigate to puzzle solver
    // For now, mark as solved (phase 2)
    await submitAttempt({
      solved: true,
      timeTaken: 15,
      accuracy: 0.75,
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
          isSolved={!!attempt?.solved}
          timeTaken={attempt?.time_taken_seconds ? Math.round(attempt.time_taken_seconds / 60) : undefined}
          accuracy={attempt?.accuracy}
          onSolve={handleSolvePuzzle}
        />
      ) : null}

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
