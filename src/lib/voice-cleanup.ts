import { createAdminClient } from '@/lib/supabase/admin';

const AUDIO_RETENTION_DAYS = 10;

interface CleanupResult {
  success: boolean;
  filesDeleted: number;
  recordsDeleted: number;
  errors: string[];
  duration: number;
}

export async function cleanupOldVoiceNotes(): Promise<CleanupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let filesDeleted = 0;
  let recordsDeleted = 0;
  const admin = createAdminClient();

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    const { data: oldRecords, error: fetchError } = await admin
      .from('buddy_feedback')
      .select('id, voice_note_url, student_id, created_at')
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    if (fetchError) {
      const msg = `Failed to fetch old records: ${fetchError.message}`;
      errors.push(msg);
      console.error(`[voice-cleanup] ${msg}`);
      return { success: false, filesDeleted: 0, recordsDeleted: 0, errors, duration: Date.now() - startTime };
    }

    if (oldRecords && oldRecords.length > 0) {
      const filePaths = oldRecords
        .filter((r) => r.voice_note_url)
        .map((r) => {
          const urlOrPath = r.voice_note_url!;
          // New rows store the storage path directly (studentId/timestamp.ext).
          // Legacy rows stored a full public URL — strip the bucket prefix.
          const marker = '/object/public/voice-notes/';
          const idx = urlOrPath.indexOf(marker);
          return idx >= 0 ? urlOrPath.slice(idx + marker.length) : urlOrPath;
        })
        .filter(Boolean) as string[];

      if (filePaths.length > 0) {
        const { error: storageError } = await admin.storage.from('voice-notes').remove(filePaths);
        if (storageError) {
          errors.push(`Storage deletion warning: ${storageError.message}`);
        } else {
          filesDeleted = filePaths.length;
        }
      }

      const recordIds = oldRecords.map((r) => r.id);
      const { error: deleteError, count } = await admin.from('buddy_feedback').delete().in('id', recordIds);
      if (deleteError) {
        errors.push(`Failed to delete database records: ${deleteError.message}`);
      } else {
        recordsDeleted = count || 0;
      }
    }

    console.log(`[voice-cleanup] done: ${filesDeleted} files, ${recordsDeleted} rows removed`);
    return { success: errors.length === 0, filesDeleted, recordsDeleted, errors, duration: Date.now() - startTime };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(msg);
    console.error(`[voice-cleanup] ${msg}`);
    return { success: false, filesDeleted, recordsDeleted, errors, duration: Date.now() - startTime };
  }
}

export async function getVoiceNotesStats() {
  try {
    const admin = createAdminClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    const [{ count: totalRecords }, { count: oldRecords }] = await Promise.all([
      admin.from('buddy_feedback').select('*', { count: 'exact', head: true }).not('voice_note_url', 'is', null),
      admin.from('buddy_feedback').select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffDate.toISOString()).not('voice_note_url', 'is', null),
    ]);

    const averageFileSize = 50 * 1024;
    const estimatedStorage = (totalRecords || 0) * averageFileSize;
    const estimatedOldStorage = (oldRecords || 0) * averageFileSize;

    return {
      totalVoiceNotes: totalRecords || 0,
      oldVoiceNotes: oldRecords || 0,
      estimatedStorageGB: (estimatedStorage / (1024 * 1024 * 1024)).toFixed(2),
      estimatedOldStorageGB: (estimatedOldStorage / (1024 * 1024 * 1024)).toFixed(2),
      retentionDays: AUDIO_RETENTION_DAYS,
    };
  } catch (error) {
    console.error('[voice-cleanup] stats failed:', error);
    return null;
  }
}
