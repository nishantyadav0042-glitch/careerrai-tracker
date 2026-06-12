'use client';

import { useState } from 'react';
import { HeroCard } from './HeroCard';
import { LoggingModal, type LoggingData } from './LoggingModal';
import { FeedbackAnimation } from './FeedbackAnimation';
import { DailyPuzzleCard, type GameType } from './DailyPuzzleCard';
import { PuzzleSolverModal, type PuzzleContent } from './PuzzleSolverModal';
import { DetectiveCaseModal, isDetectiveCase } from './DetectiveCaseModal';
import { EscapeRoomModal, isEscapeRoom } from './EscapeRoomModal';
import { MafiaLogicModal, isMafiaGame } from './MafiaLogicModal';
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

      {/* Daily Game */}
      {puzzleLoading ? (
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
      ) : (
        <div className="rounded-2xl border-2 border-stone-200 bg-stone-50 p-4 text-center">
          <p className="text-sm text-stone-600">🧩 No puzzle today — check back tomorrow!</p>
        </div>
      )}

      {/* Arrangement games: Detective + Airport (shared engine) */}
      {isCasePuzzle && puzzle && (
        <DetectiveCaseModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          content={puzzle.puzzle_content as unknown as Parameters<typeof DetectiveCaseModal>[0]['content']}
          explanation={puzzle.explanation}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Escape Room (Quant locks) */}
      {isEscape && puzzle && (
        <EscapeRoomModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          content={puzzle.puzzle_content as unknown as Parameters<typeof EscapeRoomModal>[0]['content']}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Mafia (truth-liar deduction) */}
      {isMafia && puzzle && (
        <MafiaLogicModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          content={puzzle.puzzle_content as unknown as Parameters<typeof MafiaLogicModal>[0]['content']}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Legacy single-question solver (fallback for old content) */}
      {!isCasePuzzle && !isEscape && !isMafia && isPlayablePuzzle && puzzle && (
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
