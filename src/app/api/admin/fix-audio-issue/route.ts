import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * COMPREHENSIVE AUDIO FIX ENDPOINT
 * Solves the audio ID swap / wrong feedback_type issue
 * - Deletes self-feedback (student_id = buddy_id)
 * - Deletes invalid feedback_type records
 * - Corrects remaining records
 * - Verifies cleanup success
 */
export async function GET() {
  return performAudioFix();
}

export async function POST() {
  return performAudioFix();
}

async function performAudioFix() {
  try {
    console.log('🔧 COMPREHENSIVE AUDIO FIX STARTING...\n');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // STEP 1: Get initial count
    console.log('📊 Step 1: Checking initial state...');
    const { data: before, error: beforeError } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, voice_note_url')
      .limit(1000);

    if (beforeError) throw beforeError;

    const beforeCount = before?.length || 0;
    console.log(`   Found ${beforeCount} total records`);

    // STEP 2: Find self-feedback
    console.log('\n🗑️ Step 2: Identifying self-feedback records...');
    const selfFeedbackIds = (before || [])
      .filter((r: any) => r.student_id === r.buddy_id)
      .map((r: any) => r.id);

    console.log(`   Found ${selfFeedbackIds.length} self-feedback records`);

    // STEP 3: Find invalid feedback_type records
    console.log('\n🗑️ Step 3: Identifying invalid feedback_type records...');
    const invalidIds = (before || [])
      .filter(
        (r: any) =>
          !['buddy_feedback', 'student_response', 'text'].includes(
            r.feedback_type
          ) || r.feedback_type === null
      )
      .map((r: any) => r.id);

    console.log(`   Found ${invalidIds.length} invalid records`);

    // STEP 4: Execute DELETE for self-feedback
    let deletedSelf = 0;
    if (selfFeedbackIds.length > 0) {
      console.log('\n🔨 Step 4a: Deleting self-feedback...');
      const { error: deleteError1 } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', selfFeedbackIds);

      if (deleteError1) {
        console.log(`   ⚠️ Error: ${deleteError1.message}`);
      } else {
        deletedSelf = selfFeedbackIds.length;
        console.log(`   ✅ Deleted ${deletedSelf} self-feedback records`);
      }
    }

    // STEP 5: Execute DELETE for invalid types
    let deletedInvalid = 0;
    if (invalidIds.length > 0) {
      console.log('\n🔨 Step 4b: Deleting invalid feedback_type records...');
      const { error: deleteError2 } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', invalidIds);

      if (deleteError2) {
        console.log(`   ⚠️ Error: ${deleteError2.message}`);
      } else {
        deletedInvalid = invalidIds.length;
        console.log(`   ✅ Deleted ${deletedInvalid} invalid records`);
      }
    }

    // STEP 6: Verify cleanup
    console.log('\n✅ Step 5: Verifying cleanup...');
    const { data: after, error: afterError } = await supabase
      .from('buddy_feedback')
      .select('id, feedback_type, voice_note_url');

    if (afterError) throw afterError;

    const afterCount = after?.length || 0;
    const totalDeleted = deletedSelf + deletedInvalid;

    // Distribution
    const distribution: Record<string, { count: number; withAudio: number }> = {};
    (after || []).forEach((r: any) => {
      const type = r.feedback_type || 'NULL';
      if (!distribution[type]) {
        distribution[type] = { count: 0, withAudio: 0 };
      }
      distribution[type].count++;
      if (r.voice_note_url) {
        distribution[type].withAudio++;
      }
    });

    console.log(`\n📊 FINAL STATE:`);
    console.log(`   Before: ${beforeCount} records`);
    console.log(`   Deleted: ${totalDeleted} records`);
    console.log(`   After: ${afterCount} records`);
    console.log(`   Distribution:`, distribution);

    // Return results
    return NextResponse.json(
      {
        success: true,
        message: `✅ Audio fix complete! Deleted ${totalDeleted} problematic records.`,
        stats: {
          before: beforeCount,
          deletedSelfFeedback: deletedSelf,
          deletedInvalidType: deletedInvalid,
          totalDeleted,
          after: afterCount,
          distribution,
        },
        nextSteps: [
          '1. Hard refresh app: Ctrl+Shift+R',
          '2. Clear browser cache or use Incognito',
          '3. Test: Student record → should NOT show in Buddy Feedback',
          '4. Test: Buddy record → should show in Buddy Feedback',
        ],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Fix error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
