import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buddyId } = await request.json();

    if (!buddyId) {
      return NextResponse.json({ error: 'buddyId required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Create a notification for the buddy about the session request
    try {
      await admin
        .from('notifications')
        .insert({
          user_id: buddyId,
          type: 'session_request',
          title: 'Session Request',
          message: 'A student requested to schedule a session with you',
          related_user_id: user.id,
          read: false,
        });
    } catch (notifError) {
      console.error('Warning: Failed to create notification:', notifError);
    }

    return NextResponse.json(
      { success: true, message: 'Session request sent to buddy' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error handling session request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
