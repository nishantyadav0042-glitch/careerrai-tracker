import { NextRequest, NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cron-auth';
import { cleanupOldVoiceNotes } from '@/lib/voice-cleanup';

// Runs every 10 days (1st, 11th, 21st at 02:00 UTC) via Vercel Cron.
// Deletes voice note audio files >10 days old from storage and their DB rows.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await cleanupOldVoiceNotes();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export { POST as GET };
