/**
 * Simple bucket verification endpoint
 * Tests if voice-notes bucket exists and is accessible
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated', auth: 'FAIL' },
        { status: 401 }
      );
    }

    // Test 1: Try to list contents of voice-notes bucket
    // This works with anon key if bucket is public
    const { data: files, error: bucketError } = await supabase.storage
      .from('voice-notes')
      .list('', { limit: 1 });

    let bucketStatus = 'UNKNOWN';

    if (!bucketError) {
      bucketStatus = 'PASS';
    } else if ((bucketError as any).statusCode === 404) {
      bucketStatus = 'FAIL - Not Found';
    } else if (bucketError.message.includes('permission')) {
      bucketStatus = 'FAIL - Permission Denied';
    } else {
      bucketStatus = `FAIL - ${bucketError.message}`;
    }

    // Test 2: Try a simple upload to test write access
    const testBlob = new Blob(['test'], { type: 'audio/webm' });
    const testFile = new File([testBlob], 'test.webm', { type: 'audio/webm' });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voice-notes')
      .upload(`test-${Date.now()}.webm`, testFile, {
        upsert: false,
      });

    let uploadStatus = 'UNKNOWN';
    if (!uploadError) {
      uploadStatus = 'PASS';
      // Clean up test file
      await supabase.storage
        .from('voice-notes')
        .remove([uploadData.path]);
    } else if (uploadError.message.includes('permission')) {
      uploadStatus = 'FAIL - Permission Denied';
    } else {
      uploadStatus = `FAIL - ${uploadError.message}`;
    }

    return NextResponse.json(
      {
        success: bucketStatus === 'PASS' && uploadStatus === 'PASS',
        auth: 'PASS',
        bucket: bucketStatus,
        upload: uploadStatus,
        user: user.email,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
