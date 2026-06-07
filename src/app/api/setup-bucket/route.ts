/**
 * Setup Bucket API - Creates the voice-notes bucket with proper configuration
 * This endpoint uses the service role key for admin operations
 * Call this once to set up the bucket, then it's done
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Create Supabase client with service role (admin) privileges
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Step 1: Create the bucket
    console.log('Creating voice-notes bucket...');

    const { data: bucket, error: createError } = await supabase.storage.createBucket(
      'voice-notes',
      {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'],
      }
    );

    if (createError && createError.statusCode !== 409) {
      // 409 means bucket already exists, which is fine
      throw new Error(`Failed to create bucket: ${createError.message}`);
    }

    console.log('✅ Bucket created or already exists');

    // Step 2: Create storage policies (these might already exist)
    console.log('Creating storage policies...');

    // Policy 1: Allow authenticated users to upload
    try {
      await supabase.storage.createPolicy('voice-notes', {
        definition: "((bucket_id = 'voice-notes'::text) AND (auth.role() = 'authenticated'::text))",
        operation: 'INSERT',
        name: 'Allow authenticated upload',
      } as any);
      console.log('✅ Upload policy created');
    } catch (err) {
      console.log('⚠️ Upload policy (may already exist)');
    }

    // Policy 2: Allow public read
    try {
      await supabase.storage.createPolicy('voice-notes', {
        definition: "((bucket_id = 'voice-notes'::text))",
        operation: 'SELECT',
        name: 'Allow public reads',
      } as any);
      console.log('✅ Read policy created');
    } catch (err) {
      console.log('⚠️ Read policy (may already exist)');
    }

    // Step 3: Verify bucket is accessible
    console.log('Verifying bucket access...');
    const { data: testUpload, error: testError } = await supabase.storage
      .from('voice-notes')
      .upload(`setup-test-${Date.now()}.webm`, new Blob(['test'], { type: 'audio/webm' }), {
        upsert: true,
      });

    if (testError) {
      return NextResponse.json(
        {
          success: false,
          error: `Bucket created but test upload failed: ${testError.message}`,
          details: testError,
        },
        { status: 500 }
      );
    }

    // Clean up test file
    try {
      if (testUpload) {
        await supabase.storage
          .from('voice-notes')
          .remove([testUpload.path]);
      }
    } catch {
      // Cleanup not critical
    }

    return NextResponse.json(
      {
        success: true,
        message: '✅ voice-notes bucket is now set up and working!',
        bucket: {
          name: 'voice-notes',
          public: true,
          tested: true,
        },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during setup',
      },
      { status: 500 }
    );
  }
}
