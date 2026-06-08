const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function main() {
  try {
    console.log('🚀 BUCKET CREATION & VERIFICATION\n');
    console.log('Connecting to Supabase...');
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // Test 1: Check if bucket exists
    console.log('\n1️⃣ CHECKING IF BUCKET EXISTS...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError.message);
      process.exit(1);
    }
    
    const voiceNotesBucket = buckets?.find(b => b.name === 'voice-notes');
    
    if (voiceNotesBucket) {
      console.log('✅ Bucket EXISTS');
    } else {
      console.log('❌ Bucket DOES NOT EXIST - creating...');
      
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('voice-notes', {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg']
      });
      
      if (createError && createError.statusCode !== 409) {
        console.error('❌ Creation failed:', createError.message);
        process.exit(1);
      }
      console.log('✅ Bucket created or already exists');
    }
    
    // Test 2: Verify with test upload
    console.log('\n2️⃣ TESTING BUCKET ACCESS...');
    const testBlob = new Blob(['test'], { type: 'audio/webm' });
    const testFileName = `test-${Date.now()}.webm`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voice-notes')
      .upload(testFileName, testBlob, { upsert: true });
    
    if (uploadError) {
      console.error('❌ Upload failed:', uploadError.message);
      process.exit(1);
    }
    
    console.log('✅ Upload test successful');
    
    // Clean up
    console.log('\n3️⃣ CLEANING UP...');
    await supabase.storage.from('voice-notes').remove([testFileName]);
    console.log('✅ Test file cleaned');
    
    console.log('\n' + '='.repeat(50));
    console.log('✅✅✅ BUCKET READY ✅✅✅');
    console.log('='.repeat(50) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
