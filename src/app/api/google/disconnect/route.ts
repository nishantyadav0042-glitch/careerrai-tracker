import { NextRequest, NextResponse } from 'next/server';
import { disconnectGoogleCalendar } from '@/lib/google-oauth-utils';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/google/disconnect
 * Disconnects user's Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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
