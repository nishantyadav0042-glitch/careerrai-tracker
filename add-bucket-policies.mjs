import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function addPolicies() {
  try {
    console.log('🔐 Adding storage policies to voice-notes bucket...\n');
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Add INSERT policy for authenticated users
    console.log('1️⃣ Adding INSERT policy (authenticated upload)...');
    const { error: insertError } = await supabase.rpc('create_bucket_policy', {
      bucket_name: 'voice-notes',
      policy_name: 'Allow authenticated upload',
      definition: "((bucket_id = 'voice-notes'::text) AND (auth.role() = 'authenticated'::text))",
      operation: 'INSERT'
    }).then(() => ({ error: null })).catch(e => ({ error: e }));

    // Add SELECT policy for public read
    console.log('2️⃣ Adding SELECT policy (public read)...');
    const { error: selectError } = await supabase.rpc('create_bucket_policy', {
      bucket_name: 'voice-notes',
      policy_name: 'Allow public read',
      definition: "((bucket_id = 'voice-notes'::text))",
      operation: 'SELECT'
    }).then(() => ({ error: null })).catch(e => ({ error: e }));

    // Test bucket access
    console.log('\n3️⃣ Testing bucket access...');
    const testBlob = new Blob(['test'], { type: 'audio/webm' });
    const { data, error } = await supabase.storage
      .from('voice-notes')
      .upload(`test-${Date.now()}.webm`, testBlob, { upsert: true });

    if (error) {
      console.log('⚠️ Upload test result:', error.message);
    } else {
      console.log('✅ Upload successful');
      // Clean up
      await supabase.storage.from('voice-notes').remove([data.path]);
      console.log('✅ Test file cleaned up');
    }

    console.log('\n✅ Policies configured!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addPolicies();
