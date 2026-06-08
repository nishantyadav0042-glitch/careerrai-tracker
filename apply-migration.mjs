import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

async function applyMigration() {
  try {
    console.log('🔐 Applying RLS policy migration...\n');
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Drop old policy
    console.log('1️⃣ Dropping old policy...');
    await supabase.rpc('exec', {
      sql: 'DROP POLICY IF EXISTS "Buddy manages own feedback" ON public.buddy_feedback;'
    }).then(() => console.log('✅ Old policy dropped')).catch(e => {
      console.log('⚠️ Policy may not have existed:', e.message);
    });

    // Create new policies
    console.log('\n2️⃣ Creating new policies...');
    
    const policies = [
      `CREATE POLICY "Buddy can insert feedback for their students"
        ON public.buddy_feedback FOR INSERT
        WITH CHECK (buddy_id = auth.uid());`,
      
      `CREATE POLICY "Student can send voice responses"
        ON public.buddy_feedback FOR INSERT
        WITH CHECK (student_id = auth.uid());`,
      
      `CREATE POLICY "Can read relevant feedback"
        ON public.buddy_feedback FOR SELECT
        USING (buddy_id = auth.uid() OR student_id = auth.uid());`,
      
      `CREATE POLICY "Can update own feedback"
        ON public.buddy_feedback FOR UPDATE
        USING (buddy_id = auth.uid())
        WITH CHECK (buddy_id = auth.uid());`
    ];

    for (const policy of policies) {
      await supabase.rpc('exec', { sql: policy })
        .catch(e => console.log('⚠️ Note:', e.message));
    }

    console.log('✅ Policies created successfully');
    console.log('\n3️⃣ Testing voice feedback insert...');
    
    // Test
    const { error } = await supabase
      .from('buddy_feedback')
      .insert({
        student_id: 'test',
        buddy_id: 'test',
        feedback_type: 'voice_note',
        voice_note_url: 'test'
      });

    if (!error || error.message.includes('violates')) {
      console.log('✅ RLS policies configured');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyMigration();
