'use client';

import { useState } from 'react';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';
import { WeeklySignalCard } from '@/components/weekly-signal-card';
import { Mic } from 'lucide-react';

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
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);

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
        onVoiceNote={() => setIsRecorderOpen(true)}
        onFeedback={scrollToFeedback}
      />

      {/* Voice Note Recorder Button (Floating) */}
      <button
        onClick={() => setIsRecorderOpen(true)}
        className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-30 flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all font-semibold group text-sm md:text-base"
      >
        <Mic className="w-4 md:w-5 h-4 md:h-5 group-hover:animate-pulse" />
        <span className="hidden md:inline">Voice Note</span>
        <span className="md:hidden">Voice</span>
      </button>

      {/* Voice Note Recorder Modal */}
      <VoiceNoteRecorder
        studentId={studentId}
        buddyId={buddyId}
        studentName={studentName}
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onSendComplete={() => setIsRecorderOpen(false)}
        feedbackType="buddy_feedback"
      />
    </>
  );
}
