import { NextRequest, NextResponse } from 'next/server';
import { disconnectGoogleCalendar } from '@/lib/google-oauth-utils';
import { deleteAutomatedReminders } from '@/lib/google-reminder-utils';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/google/disconnect
 * Disconnects user's Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Remove our reminder events while we still hold a valid token
    // (best-effort — disconnect proceeds even if cleanup fails)
    try {
      await deleteAutomatedReminders(user.id);
    } catch (cleanupError) {
      console.error('Reminder cleanup failed during disconnect:', cleanupError);
    }

    // Disconnect calendar
    await disconnectGoogleCalendar(user.id);

    return NextResponse.json({
      success: true,
      message: 'Google Calendar disconnected',
    });
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
