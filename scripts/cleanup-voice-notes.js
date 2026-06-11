#!/usr/bin/env node

/**
 * 🎙️ Voice Notes Cleanup Script
 * Run this daily to automatically delete voice notes older than 10 days
 *
 * Usage:
 *   node scripts/cleanup-voice-notes.js
 *
 * Schedule with cron (Linux/Mac):
 *   0 2 * * * cd /path/to/project && node scripts/cleanup-voice-notes.js
 *
 * Schedule with Task Scheduler (Windows):
 *   - Create task to run: node scripts/cleanup-voice-notes.js
 *   - Set to run daily at 2 AM
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const RETENTION_DAYS = 10;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
  );
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Main cleanup function
 */
async function cleanupVoiceNotes() {
  console.log('🎙️ ========================================');
  console.log('   VOICE NOTES CLEANUP - Daily Job');
  console.log('   ' + new Date().toISOString());
  console.log('========================================');

  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    console.log(`📅 Deleting files older than: ${cutoffDate.toISOString()}`);

    // Step 1: Find old records
    console.log('\n📊 Step 1: Finding old voice notes...');
    const { data: oldRecords, error: fetchError } = await supabase
      .from('buddy_feedback')
      .select('id, voice_note_url, student_id, created_at')
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    if (fetchError) {
      throw new Error(`Failed to fetch old records: ${fetchError.message}`);
    }

    console.log(`   ✓ Found ${oldRecords?.length || 0} old voice notes`);

    if (!oldRecords || oldRecords.length === 0) {
      console.log('   ✓ No files to delete');
      console.log('\n✅ Cleanup completed successfully!');
      return { filesDeleted: 0, recordsDeleted: 0 };
    }

    // Step 2: Delete from storage
    console.log('\n📦 Step 2: Deleting files from storage...');
    const filePaths = oldRecords
      .map((r) => r.voice_note_url?.split('/').pop())
      .filter(Boolean);

    let filesDeleted = 0;
    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('voice-notes')
        .remove(filePaths);

      if (storageError) {
        console.warn(`   ⚠️  Storage warning: ${storageError.message}`);
        console.log('   ℹ️  Continuing with database cleanup...');
      } else {
        filesDeleted = filePaths.length;
        console.log(`   ✓ Deleted ${filesDeleted} files from storage`);
      }
    }

    // Step 3: Delete from database
    console.log('\n🗄️  Step 3: Deleting records from database...');
    const recordIds = oldRecords.map((r) => r.id);
    const { error: deleteError, count } = await supabase
      .from('buddy_feedback')
      .delete()
      .in('id', recordIds);

    if (deleteError) {
      throw new Error(`Failed to delete records: ${deleteError.message}`);
    }

    const recordsDeleted = count || 0;
    console.log(`   ✓ Deleted ${recordsDeleted} records from database`);

    // Step 4: Get stats
    console.log('\n📈 Step 4: Storage statistics...');
    const { count: totalRecords } = await supabase
      .from('buddy_feedback')
      .select('*', { count: 'exact', head: true })
      .not('voice_note_url', 'is', null);

    const estimatedStorage = ((totalRecords || 0) * 50 * 1024) / (1024 * 1024 * 1024);
    console.log(`   Total voice notes remaining: ${totalRecords || 0}`);
    console.log(`   Estimated storage used: ${estimatedStorage.toFixed(2)} GB`);

    console.log('\n✅ Cleanup completed successfully!');
    console.log(`   Files deleted: ${filesDeleted}`);
    console.log(`   Records deleted: ${recordsDeleted}`);
    console.log('========================================\n');

    return { filesDeleted, recordsDeleted };
  } catch (error) {
    console.error('\n❌ Cleanup failed!');
    console.error(`   Error: ${error.message}`);
    console.error('========================================\n');
    process.exit(1);
  }
}

// Run the cleanup
cleanupVoiceNotes().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
