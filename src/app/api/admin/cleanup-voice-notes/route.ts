/**
 * 🎙️ Voice Notes Cleanup API Endpoint
 * Manually trigger cleanup of old voice notes (older than 10 days)
 *
 * POST /api/admin/cleanup-voice-notes
 * Headers: Authorization: Bearer {admin_token}
 *
 * Only accessible to admin users
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDIO_RETENTION_DAYS = 10;

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Check if user is admin
 */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    return data?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * POST: Trigger cleanup of old voice notes
 */
export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify the token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const userIsAdmin = await isAdmin(user.id);
    if (!userIsAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Proceed with cleanup
    const result = await cleanupOldVoiceNotes();

    return NextResponse.json({
      success: result.success,
      message: 'Voice notes cleanup completed',
      filesDeleted: result.filesDeleted,
      recordsDeleted: result.recordsDeleted,
      durationMs: result.duration,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Cleanup endpoint error:', msg);

    return NextResponse.json(
      { error: 'Cleanup failed', details: msg },
      { status: 500 }
    );
  }
}

/**
 * GET: Get statistics about voice notes storage
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const userIsAdmin = await isAdmin(user.id);
    if (!userIsAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get stats
    const stats = await getVoiceNotesStats();

    return NextResponse.json({
      success: true,
      stats,
      retentionPolicy: {
        days: AUDIO_RETENTION_DAYS,
        description: `Voice notes are automatically deleted after ${AUDIO_RETENTION_DAYS} days`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stats endpoint error:', msg);

    return NextResponse.json(
      { error: 'Failed to get stats', details: msg },
      { status: 500 }
    );
  }
}

/**
 * Delete old voice notes (>10 days old)
 */
async function cleanupOldVoiceNotes() {
  const startTime = Date.now();
  const errors: string[] = [];
  let filesDeleted = 0;
  let recordsDeleted = 0;

  try {
    console.log('🎙️ Starting cleanup...');

    // Calculate cutoff date (10 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    // Fetch old records
    const { data: oldRecords, error: fetchError } = await supabase
      .from('buddy_feedback')
      .select('id, voice_note_url')
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    if (fetchError) {
      errors.push(`Fetch error: ${fetchError.message}`);
      return {
        success: false,
        filesDeleted: 0,
        recordsDeleted: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }

    // Delete storage files
    if (oldRecords && oldRecords.length > 0) {
      const filePaths = oldRecords
        .map((r) => r.voice_note_url?.split('/').pop())
        .filter(Boolean) as string[];

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('voice-notes')
          .remove(filePaths);

        if (storageError) {
          errors.push(`Storage error: ${storageError.message}`);
        } else {
          filesDeleted = filePaths.length;
        }
      }

      // Delete database records
      const recordIds = oldRecords.map((r) => r.id);
      const { error: deleteError, count } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', recordIds);

      if (deleteError) {
        errors.push(`Database error: ${deleteError.message}`);
      } else {
        recordsDeleted = count || 0;
      }
    }

    return {
      success: errors.length === 0,
      filesDeleted,
      recordsDeleted,
      errors,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(msg);

    return {
      success: false,
      filesDeleted,
      recordsDeleted,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Get storage statistics
 */
async function getVoiceNotesStats() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

  const { count: totalRecords } = await supabase
    .from('buddy_feedback')
    .select('*', { count: 'exact', head: true })
    .not('voice_note_url', 'is', null);

  const { count: oldRecords } = await supabase
    .from('buddy_feedback')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', cutoffDate.toISOString())
    .not('voice_note_url', 'is', null);

  return {
    totalVoiceNotes: totalRecords || 0,
    oldVoiceNotes: oldRecords || 0,
    estimatedStorageGB: (((totalRecords || 0) * 50 * 1024) / (1024 * 1024 * 1024)).toFixed(2),
    estimatedOldStorageGB: (((oldRecords || 0) * 50 * 1024) / (1024 * 1024 * 1024)).toFixed(2),
  };
}
