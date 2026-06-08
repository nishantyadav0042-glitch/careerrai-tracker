import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function check() {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('📋 Checking buddy_feedback records...\n');
    
    const { data, error } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, voice_note_url, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    console.log('Records found:', data?.length || 0);
    data?.forEach((r, i) => {
      console.log(`\n${i+1}. ID: ${r.id}`);
      console.log(`   Type: ${r.feedback_type}`);
      console.log(`   Student: ${r.student_id}`);
      console.log(`   Buddy: ${r.buddy_id}`);
      console.log(`   Has voice: ${r.voice_note_url ? 'YES' : 'NO'}`);
      console.log(`   Created: ${new Date(r.created_at).toLocaleString()}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
