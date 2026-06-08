import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function main() {
  try {
    console.log('🚀 BUCKET CREATION & VERIFICATION\n');
    console.log('Connecting to Supabase...');
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // Step 1: List buckets
    console.log('\n1️⃣ CHECKING EXISTING BUCKETS...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError.message);
      process.exit(1);
    }
    
    console.log(`Found ${buckets.length} buckets`);
    buckets.forEach(b => console.log(`  - ${b.name} (public: ${b.public})`));
    
    const voiceNotesBucket = buckets?.find(b => b.name === 'voice-notes');
    
    if (!voiceNotesBucket) {
      console.log('\n2️⃣ CREATING BUCKET...');
      
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('voice-notes', {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg']
      });
      
      if (createError && createError.statusCode !== 409) {
        console.error('❌ Creation failed:', createError);
        process.exit(1);
      }
      console.log('✅ Bucket created successfully');
    } else {
      console.log('\n✅ voice-notes bucket already exists');
    }
    
    // Step 2: Test upload
    console.log('\n3️⃣ TESTING BUCKET ACCESS...');
    const testBlob = new Blob(['test'], { type: 'audio/webm' });
    const testFileName = `test-${Date.now()}.webm`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voice-notes')
      .upload(testFileName, testBlob, { upsert: true });
    
    if (uploadError) {
      console.error('❌ Upload failed:', uploadError);
      process.exit(1);
    }
    
    console.log('✅ Upload successful');
    
    // Cleanup
    console.log('\n4️⃣ CLEANUP...');
    await supabase.storage.from('voice-notes').remove([testFileName]);
    console.log('✅ Cleaned up test file');
    
    console.log('\n' + '='.repeat(50));
    console.log('✅✅✅ BUCKET IS READY ✅✅✅');
    console.log('='.repeat(50));
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Hard refresh: Ctrl+Shift+R');
    console.log('2. Visit: /admin/voice-test');
    console.log('3. Storage test should show ✅ GREEN');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message || error);
    process.exit(1);
  }
}

main();
