/**
 * 🎙️ Voice Audio Cleanup Service
 * Automatically deletes audio files older than 10 days from Supabase Storage
 * This prevents storage from filling up and reduces costs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDIO_RETENTION_DAYS = 10;

// Create Supabase client with service role (full access)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface CleanupResult {
  success: boolean;
  filesDeleted: number;
  recordsDeleted: number;
  errors: string[];
  duration: number;
}

/**
 * Delete voice notes older than 10 days
 * This removes both database records and storage files
 */
export async function cleanupOldVoiceNotes(): Promise<CleanupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let filesDeleted = 0;
  let recordsDeleted = 0;

  try {
    console.log('🎙️ Starting voice notes cleanup...');
    console.log(`   Removing files older than ${AUDIO_RETENTION_DAYS} days`);

    // 1. Fetch old records from database
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    const { data: oldRecords, error: fetchError } = await supabase
      .from('buddy_feedback')
      .select('id, voice_note_url, student_id, created_at')
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    if (fetchError) {
      const msg = `Failed to fetch old records: ${fetchError.message}`;
      errors.push(msg);
      console.error(`   ✗ ${msg}`);
      return {
        success: false,
        filesDeleted: 0,
        recordsDeleted: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }

    console.log(`   Found ${oldRecords?.length || 0} records to delete`);

    // 2. Delete files from storage
    if (oldRecords && oldRecords.length > 0) {
      const filePaths = oldRecords
        .filter((r) => r.voice_note_url)
        .map((r) => r.voice_note_url!.split('/').pop()) // Extract filename
        .filter(Boolean) as string[];

      if (filePaths.length > 0) {
        console.log(`   Deleting ${filePaths.length} files from storage...`);

        const { error: storageError } = await supabase.storage
          .from('voice-notes')
          .remove(filePaths);

        if (storageError) {
          const msg = `Storage deletion warning: ${storageError.message}`;
          errors.push(msg);
          console.warn(`   ⚠ ${msg}`);
          // Continue anyway - delete database records even if storage deletion fails
        } else {
          filesDeleted = filePaths.length;
          console.log(`   ✓ Deleted ${filesDeleted} files from storage`);
        }
      }
    }

    // 3. Delete records from database
    if (oldRecords && oldRecords.length > 0) {
      const recordIds = oldRecords.map((r) => r.id);

      const { error: deleteError, count } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', recordIds);

      if (deleteError) {
        const msg = `Failed to delete database records: ${deleteError.message}`;
        errors.push(msg);
        console.error(`   ✗ ${msg}`);
      } else {
        recordsDeleted = count || 0;
        console.log(`   ✓ Deleted ${recordsDeleted} database records`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cleanup complete! (${duration}ms)`);
    console.log(`   Files deleted: ${filesDeleted}`);
    console.log(`   Records deleted: ${recordsDeleted}`);

    return {
      success: errors.length === 0,
      filesDeleted,
      recordsDeleted,
      errors,
      duration,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(msg);
    console.error(`✗ Cleanup failed: ${msg}`);

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
 * Get statistics about voice notes storage
 */
export async function getVoiceNotesStats() {
  try {
    // Get total records
    const { count: totalRecords } = await supabase
      .from('buddy_feedback')
      .select('*', { count: 'exact', head: true })
      .not('voice_note_url', 'is', null);

    // Get old records (older than 10 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    const { count: oldRecords } = await supabase
      .from('buddy_feedback')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    // Get storage usage (approximate based on count * average file size)
    const averageFileSize = 50 * 1024; // ~50KB per audio file (90 sec WebM)
    const estimatedStorage = (totalRecords || 0) * averageFileSize;
    const estimatedOldStorage = (oldRecords || 0) * averageFileSize;

    return {
      totalVoiceNotes: totalRecords || 0,
      oldVoiceNotes: oldRecords || 0,
      estimatedStorageGB: (estimatedStorage / (1024 * 1024 * 1024)).toFixed(2),
      estimatedOldStorageGB: (
        estimatedOldStorage /
        (1024 * 1024 * 1024)
      ).toFixed(2),
      retentionDays: AUDIO_RETENTION_DAYS,
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return null;
  }
}

/**
 * Schedule cleanup to run daily (for use in cron jobs)
 * This would be called by a scheduled service
 */
export async function scheduleAutoCleanup() {
  console.log('🎙️ Setting up daily voice notes cleanup...');

  // This would be called by an external scheduler (GitHub Actions, Vercel Cron, etc.)
  // Example cron expression: 0 2 * * * (2 AM daily)

  return {
    schedule: '0 2 * * * (2 AM UTC daily)',
    command: 'npm run cleanup:voice-notes',
    description: 'Automatically delete voice notes older than 10 days',
  };
}
