import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function deepDebug() {
  try {
    console.log('🔍 DEEP DEBUG: Investigating Audio ID Swap Issue\n');
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: records, error } = await supabase
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, voice_note_url, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!records || records.length === 0) {
      console.log('✅ No buddy_feedback records - database is clean!');
      return;
    }

    console.log(`Found ${records.length} buddy_feedback records:\n`);
    
    records.forEach((r, i) => {
      console.log(`${i+1}. Record ID: ${r.id}`);
      console.log(`   Type: ${r.feedback_type || 'NULL'}`);
      console.log(`   FROM (buddy_id): ${r.buddy_id}`);
      console.log(`   TO (student_id): ${r.student_id}`);
      console.log(`   Has Audio: ${r.voice_note_url ? '✓' : '✗'}`);
      console.log('');
    });

    console.log('\n🔎 ANOMALY CHECK:\n');
    
    const selfFeedback = records.filter(r => r.buddy_id === r.student_id);
    if (selfFeedback.length > 0) {
      console.log(`⚠️ SELF-FEEDBACK (${selfFeedback.length} records):`);
      selfFeedback.forEach(r => {
        console.log(`   - ${r.student_id} sent to themselves`);
      });
    } else {
      console.log('✅ No self-feedback records');
    }

    const wrongType = records.filter(r => !['buddy_feedback', 'student_response', 'text'].includes(r.feedback_type));
    if (wrongType.length > 0) {
      console.log(`\n⚠️ INVALID FEEDBACK_TYPE (${wrongType.length} records):`);
      wrongType.forEach(r => {
        console.log(`   - "${r.feedback_type}"`);
      });
    }

  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.log('\nNote: Network blocked from this system');
  }
}

deepDebug();
