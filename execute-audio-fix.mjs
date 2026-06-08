#!/usr/bin/env node

/**
 * EXECUTE AUDIO FIX DIRECTLY
 * Uses Supabase JavaScript SDK to clean up audio issues
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function executeAudioFix() {
  try {
    console.log('🔧 AUDIO FIX: Initializing...\n');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Step 1: Get all records before cleanup
    console.log('📊 Step 1: Fetching all buddy_feedback records...');
    const { data: beforeData, error: beforeError } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, voice_note_url, created_at')
      .limit(2000);

    if (beforeError) {
      throw new Error(`Failed to fetch records: ${beforeError.message}`);
    }

    const allRecords = beforeData || [];
    console.log(`✅ Found ${allRecords.length} total records\n`);

    // Step 2: Identify self-feedback (student_id = buddy_id)
    const selfFeedbackIds = allRecords
      .filter(r => r.student_id === r.buddy_id)
      .map(r => r.id);

    console.log(`🗑️ Step 2: Identified ${selfFeedbackIds.length} self-feedback records`);
    if (selfFeedbackIds.length > 0) {
      console.log(`   IDs to delete: ${selfFeedbackIds.slice(0, 5).join(', ')}${selfFeedbackIds.length > 5 ? '...' : ''}\n`);
    }

    // Step 3: Identify invalid feedback_type
    const invalidTypeIds = allRecords
      .filter(r =>
        !r.feedback_type ||
        !['buddy_feedback', 'student_response', 'text'].includes(r.feedback_type)
      )
      .map(r => r.id);

    console.log(`🗑️ Step 3: Identified ${invalidTypeIds.length} records with invalid feedback_type`);
    if (invalidTypeIds.length > 0) {
      console.log(`   IDs to delete: ${invalidTypeIds.slice(0, 5).join(', ')}${invalidTypeIds.length > 5 ? '...' : ''}\n`);
    }

    // Step 4: Execute deletions
    let deletedSelf = 0;
    let deletedInvalid = 0;

    // Delete self-feedback
    if (selfFeedbackIds.length > 0) {
      console.log('🔨 Deleting self-feedback records...');
      const { error: deleteSelfError, count: deleteSelfCount } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', selfFeedbackIds);

      if (deleteSelfError) {
        console.error(`   ❌ Error: ${deleteSelfError.message}`);
      } else {
        deletedSelf = selfFeedbackIds.length;
        console.log(`   ✅ Deleted ${deletedSelf} self-feedback records\n`);
      }
    }

    // Delete invalid feedback_type
    if (invalidTypeIds.length > 0) {
      console.log('🔨 Deleting invalid feedback_type records...');
      const { error: deleteInvalidError, count: deleteInvalidCount } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', invalidTypeIds);

      if (deleteInvalidError) {
        console.error(`   ❌ Error: ${deleteInvalidError.message}`);
      } else {
        deletedInvalid = invalidTypeIds.length;
        console.log(`   ✅ Deleted ${deletedInvalid} invalid records\n`);
      }
    }

    // Step 5: Verify cleanup
    console.log('✅ Step 5: Verifying cleanup...');
    const { data: afterData, error: afterError } = await supabase
      .from('buddy_feedback')
      .select('id, feedback_type, voice_note_url')
      .limit(2000);

    if (afterError) {
      throw new Error(`Failed to verify: ${afterError.message}`);
    }

    const finalRecords = afterData || [];

    // Calculate distribution
    const distribution = {};
    finalRecords.forEach(r => {
      const type = r.feedback_type || 'NULL';
      if (!distribution[type]) distribution[type] = 0;
      distribution[type]++;
    });

    const totalDeleted = deletedSelf + deletedInvalid;

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Before:       ${allRecords.length} records`);
    console.log(`Deleted:      ${totalDeleted} records (${deletedSelf} self-feedback + ${deletedInvalid} invalid type)`);
    console.log(`After:        ${finalRecords.length} records`);
    console.log('\nFinal Distribution:');
    Object.entries(distribution).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} records`);
    });
    console.log('='.repeat(60));

    console.log('\n🎉 AUDIO FIX COMPLETE!\n');
    console.log('NEXT STEPS:');
    console.log('1. Hard refresh app: Ctrl+Shift+R');
    console.log('2. Clear browser cache or use Incognito');
    console.log('3. Test: Student record → should NOT show in Buddy Feedback');
    console.log('4. Test: Buddy record → should show in Buddy Feedback\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error instanceof Error ? error.message : String(error));
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

executeAudioFix();
