import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createAutomatedReminders } from '@/lib/google-reminder-utils';

/**
 * POST /api/google/setup-reminders
 * Creates automated daily reminders for the user based on their role
 */
export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's role
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.role) {
      return NextResponse.json(
        { error: 'Could not determine user role' },
        { status: 400 }
      );
    }

    // Create reminders
    const result = await createAutomatedReminders(user.id, profile.role);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to create reminders' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${result.reminders.length} reminder(s) created`,
      reminders: result.reminders,
    });
  } catch (error) {
    console.error('Error setting up reminders:', error);

    if (error instanceof Error && error.message.includes('User has not connected Google Calendar')) {
      return NextResponse.json(
        { error: 'Google Calendar not connected' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to set up reminders' },
      { status: 500 }
    );
  }
}
