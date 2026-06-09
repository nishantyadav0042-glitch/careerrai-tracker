import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pobhpszlsozeonejtzqy.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

const supabase = createClient(supabaseUrl, serviceKey);

async function applyMigrations() {
  try {
    console.log('🔧 Applying migrations...\n');

    // Migration 014
    console.log('📝 Migration 014: Google OAuth columns');
    const { error: err1 } = await supabase.sql`
      ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT,
      ADD COLUMN IF NOT EXISTS google_oauth_access_token TEXT,
      ADD COLUMN IF NOT EXISTS google_oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMP WITH TIME ZONE;
    `;
    
    if (err1) console.log('  Error:', err1);
    else console.log('  ✅ Columns added to profiles table');

    // Migration 015
    console.log('\n📝 Migration 015: Google Meet columns');
    const { error: err2 } = await supabase.sql`
      ALTER TABLE video_sessions
      ADD COLUMN IF NOT EXISTS google_event_id TEXT,
      ADD COLUMN IF NOT EXISTS google_meet_link TEXT;
    `;
    
    if (err2) console.log('  Error:', err2);
    else console.log('  ✅ Columns added to video_sessions table');

    console.log('\n🎉 Done!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

applyMigrations();
