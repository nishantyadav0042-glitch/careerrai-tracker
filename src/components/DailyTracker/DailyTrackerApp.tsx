'use client';

import { useState } from 'react';
import { HeroCard } from './HeroCard';
import { LoggingModal, type LoggingData } from './LoggingModal';
import { FeedbackAnimation } from './FeedbackAnimation';
import { useLogging } from '@/hooks/useLogging';

export function DailyTrackerApp() {
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

  const handleSubmit = async (data: LoggingData) => {
    await submitLog(data);
  };

  return (
    <>
      {/* Hero Card - Main CTA */}
      <HeroCard
        currentStreak={currentStreak}
        maxStreak={maxStreak}
        onLogClick={() => setIsModalOpen(true)}
        isLoading={isSubmitting}
        hasLoggedToday={hasLoggedToday}
        shieldsRemaining={shieldsRemaining}
      />

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
    </>
  );
}
