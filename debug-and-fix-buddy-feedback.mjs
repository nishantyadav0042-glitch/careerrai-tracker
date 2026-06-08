import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function debugAndFix() {
  try {
    console.log('🔍 DEBUGGING BUDDY FEEDBACK ISSUE\n');
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Step 1: Check current records
    console.log('📋 Current buddy_feedback records:\n');
    const { data: allRecords, error: readError } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, voice_note_url, created_at')
      .order('created_at', { ascending: false });

    if (readError) throw readError;

    if (!allRecords || allRecords.length === 0) {
      console.log('✅ No records found - starting fresh!');
    } else {
      console.log(`Total records: ${allRecords.length}\n`);
      
      // Group by feedback_type
      const byType = {};
      allRecords.forEach(r => {
        if (!byType[r.feedback_type]) byType[r.feedback_type] = [];
        byType[r.feedback_type].push(r);
      });

      console.log('Records by feedback_type:');
      Object.entries(byType).forEach(([type, records]) => {
        console.log(`  ${type || 'NULL'}: ${records.length} records`);
      });

      // Show self-feedback records
      const selfFeedback = allRecords.filter(r => r.buddy_id === r.student_id);
      if (selfFeedback.length > 0) {
        console.log(`\n⚠️ FOUND ${selfFeedback.length} SELF-FEEDBACK RECORDS (same person)!`);
        selfFeedback.forEach(r => {
          console.log(`   - ${r.student_id} → ${r.buddy_id} (type: ${r.feedback_type})`);
        });
      }

      // Show invalid feedback_type
      const invalid = allRecords.filter(r => !['buddy_feedback', 'student_response', 'text'].includes(r.feedback_type));
      if (invalid.length > 0) {
        console.log(`\n⚠️ FOUND ${invalid.length} RECORDS WITH INVALID feedback_type!`);
        invalid.forEach(r => {
          console.log(`   - Type: "${r.feedback_type}"`);
        });
      }
    }

    // Step 2: Clean up
    console.log('\n🧹 CLEANING UP...\n');

    // Delete self-feedback
    const { error: deleteError1 } = await supabase
      .from('buddy_feedback')
      .delete()
      .eq('buddy_id', 'student_id');  // This won't work as intended, need different approach

    // Instead, let's delete records with student_id = buddy_id
    if (allRecords && allRecords.length > 0) {
      const selfIds = allRecords
        .filter(r => r.buddy_id === r.student_id)
        .map(r => r.id);

      if (selfIds.length > 0) {
        const { error: deleteSelfError } = await supabase
          .from('buddy_feedback')
          .delete()
          .in('id', selfIds);

        if (deleteSelfError) {
          console.log('⚠️ Could not delete self-feedback:', deleteSelfError.message);
        } else {
          console.log(`✅ Deleted ${selfIds.length} self-feedback records`);
        }
      }

      // Delete invalid feedback_type records
      const invalidIds = allRecords
        .filter(r => !['buddy_feedback', 'student_response', 'text'].includes(r.feedback_type))
        .map(r => r.id);

      if (invalidIds.length > 0) {
        const { error: deleteInvalidError } = await supabase
          .from('buddy_feedback')
          .delete()
          .in('id', invalidIds);

        if (deleteInvalidError) {
          console.log('⚠️ Could not delete invalid records:', deleteInvalidError.message);
        } else {
          console.log(`✅ Deleted ${invalidIds.length} invalid feedback_type records`);
        }
      }
    }

    // Step 3: Verify cleanup
    console.log('\n✅ FINAL VERIFICATION:\n');
    const { data: finalRecords } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type')
      .order('created_at', { ascending: false });

    if (!finalRecords || finalRecords.length === 0) {
      console.log('✅ DATABASE IS CLEAN - No buddy_feedback records exist');
    } else {
      console.log(`Remaining records: ${finalRecords.length}`);
      const finalByType = {};
      finalRecords.forEach(r => {
        finalByType[r.feedback_type] = (finalByType[r.feedback_type] || 0) + 1;
      });
      console.log('Final distribution:');
      Object.entries(finalByType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }

    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Hard refresh app: Ctrl+Shift+R');
    console.log('2. View buddy feedback - should be CLEAN');
    console.log('3. Record new voice message - should work correctly');

  } catch (error) {
    console.error('❌ Error:', error.message || error);
  }
}

debugAndFix();
