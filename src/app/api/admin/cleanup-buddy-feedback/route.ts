import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Admin endpoint to clean up buddy_feedback table
 * Removes self-feedback and invalid feedback_type records
 */
async function performCleanup() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Step 1: Get current state
    console.log('📋 Checking current records...');
    const { data: before, error: beforeError } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, voice_note_url');

    if (beforeError) throw beforeError;

    const beforeCount = before?.length || 0;
    console.log(`Total records before: ${beforeCount}`);

    if (beforeCount === 0) {
      return NextResponse.json(
        {
          success: true,
          message: '✅ Database is already clean - no records to delete',
          stats: {
            before: 0,
            deleted: 0,
            after: 0
          }
        },
        { status: 200 }
      );
    }

    // Step 2: Delete self-feedback
    console.log('🗑️ Deleting self-feedback records...');
    const selfFeedbackIds = before
      ?.filter((r: any) => r.buddy_id === r.student_id)
      .map((r: any) => r.id) || [];

    let deletedSelf = 0;
    if (selfFeedbackIds.length > 0) {
      const { error: deleteSelfError } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', selfFeedbackIds);

      if (deleteSelfError) {
        console.error('Error deleting self-feedback:', deleteSelfError);
        throw deleteSelfError;
      }
      deletedSelf = selfFeedbackIds.length;
      console.log(`✅ Deleted ${deletedSelf} self-feedback records`);
    }

    // Step 3: Delete invalid feedback_type records
    console.log('🗑️ Deleting invalid feedback_type records...');
    const invalidIds = before
      ?.filter((r: any) =>
        !['buddy_feedback', 'student_response', 'text'].includes(r.feedback_type)
      )
      .map((r: any) => r.id) || [];

    let deletedInvalid = 0;
    if (invalidIds.length > 0) {
      const { error: deleteInvalidError } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', invalidIds);

      if (deleteInvalidError) {
        console.error('Error deleting invalid records:', deleteInvalidError);
        throw deleteInvalidError;
      }
      deletedInvalid = invalidIds.length;
      console.log(`✅ Deleted ${deletedInvalid} invalid feedback_type records`);
    }

    // Step 4: Verify final state
    console.log('✅ Verifying cleanup...');
    const { data: after, error: afterError } = await supabase
      .from('buddy_feedback')
      .select('id, feedback_type');

    if (afterError) throw afterError;

    const afterCount = after?.length || 0;
    const totalDeleted = deletedSelf + deletedInvalid;

    console.log(`\n📊 CLEANUP SUMMARY:`);
    console.log(`   Before: ${beforeCount} records`);
    console.log(`   Deleted: ${totalDeleted} records`);
    console.log(`   After: ${afterCount} records`);

    // Distribution after cleanup
    const distribution: Record<string, number> = {};
    after?.forEach((r: any) => {
      distribution[r.feedback_type || 'NULL'] = (distribution[r.feedback_type || 'NULL'] || 0) + 1;
    });

    return NextResponse.json(
      {
        success: true,
        message: `✅ Cleanup complete! Deleted ${totalDeleted} problematic records.`,
        stats: {
          before: beforeCount,
          deleted: totalDeleted,
          after: afterCount,
          distribution
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during cleanup'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return performCleanup();
}

export async function POST() {
  return performCleanup();
}
