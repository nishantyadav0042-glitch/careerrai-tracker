'use client';

import { VideoSessionPrompt } from '@/components/video-session-prompt';

interface VideoSessionPromptClientProps {
  studentId: string;
  studentName: string;
  buddyId: string;
  buddyName: string;
  lastSessionDate: Date | null;
}

export function VideoSessionPromptClient({
  studentId,
  studentName,
  buddyId,
  buddyName,
  lastSessionDate,
}: VideoSessionPromptClientProps) {
  return (
    <VideoSessionPrompt
      studentId={studentId}
      studentName={studentName}
      buddyId={buddyId}
      buddyName={buddyName}
      lastSessionDate={lastSessionDate}
      isOpen={true}
    />
  );
}
