'use client';

import { WeeklySignalCard } from '@/components/weekly-signal-card';

interface BuddyStudentViewClientProps {
  studentId: string;
  studentName: string;
  studentPercentile: number | null;
  buddyId: string;
}

export function BuddyStudentViewClient({
  studentId,
  studentName,
  studentPercentile,
  buddyId
}: BuddyStudentViewClientProps) {

  const scrollToFeedback = () => {
    const el = document.getElementById('feedback-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* Weekly Signal Card — top of detail page (client) */}
      <WeeklySignalCard
        studentId={studentId}
        studentName={studentName}
        onFeedback={scrollToFeedback}
      />


    </>
  );
}
