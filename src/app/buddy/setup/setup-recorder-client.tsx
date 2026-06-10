'use client';

import { BuddyAudioRecorder } from '@/components/buddy-audio-recorder';

// Server components can't pass event handlers to client components, so the
// reload-on-complete callback lives in this client wrapper instead.
export function SetupRecorderClient({ buddyId }: { buddyId: string }) {
  return (
    <BuddyAudioRecorder
      buddyId={buddyId}
      onUploadComplete={() => {
        window.location.reload();
      }}
    />
  );
}
