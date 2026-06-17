'use client';

import { useState } from 'react';
import { Video } from 'lucide-react';
import { ScheduleSessionModal } from '@/components/schedule-session-modal';

interface VideoSessionPromptClientProps {
  studentId: string;
  studentName: string;
  calendarConnected: boolean;
  /** Days since the last session, or null if never */
  daysSinceLastSession: number | null;
}

/**
 * Schedule CTA on the student detail page. Nudges harder when it's been
 * 10+ days (or never) since the last session.
 */
export function VideoSessionPromptClient({
  studentId,
  studentName,
  calendarConnected,
  daysSinceLastSession,
}: VideoSessionPromptClientProps) {
  const [open, setOpen] = useState(false);

  const overdue = daysSinceLastSession === null || daysSinceLastSession >= 10;
  const firstName = studentName.split(' ')[0];

  return (
    <>
      <div
        className="rounded-2xl p-4 flex items-center justify-between gap-3"
        style={{ backgroundColor: overdue ? '#1A1A2E' : '#f5f5f4' }}
      >
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${overdue ? 'text-white' : 'text-stone-900'}`}>
            {daysSinceLastSession === null
              ? `No session with ${firstName} yet`
              : overdue
              ? `${daysSinceLastSession} days since your last session`
              : 'Book your next session'}
          </p>
          <p className={`text-xs mt-0.5 ${overdue ? 'text-stone-400' : 'text-stone-500'}`}>
            A 30-min GMeet keeps {firstName} on track
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform active:scale-95"
          style={{ backgroundColor: overdue ? '#E8652D' : '#2A9D8F', minHeight: 44 }}
        >
          <Video className="w-4 h-4" />
          Schedule
        </button>
      </div>

      <ScheduleSessionModal
        isOpen={open}
        onClose={() => setOpen(false)}
        students={[{ id: studentId, full_name: studentName }]}
        defaultStudentId={studentId}
        calendarConnected={calendarConnected}
        onScheduled={() => {
          // server components refresh on next nav; the modal success state
          // already shows the link, nothing else needed here
        }}
      />
    </>
  );
}
