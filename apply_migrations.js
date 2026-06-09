const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pobhpszlsozeonejtzqy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigrations() {
  try {
    console.log('Applying Migration 014 (Google OAuth columns)...');
    
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.profiles
        ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT,
        ADD COLUMN IF NOT EXISTS google_oauth_access_token TEXT,
        ADD COLUMN IF NOT EXISTS google_oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMP WITH TIME ZONE;

        CREATE INDEX IF NOT EXISTS idx_profiles_google_connected
        ON public.profiles(google_calendar_connected);
      `
    });

    if (error1) {
      console.log('Migration 014 result:', error1);
    } else {
      console.log('✅ Migration 014 applied!');
    }

    console.log('\nApplying Migration 015 (Google Meet columns)...');
    
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE video_sessions
        ADD COLUMN IF NOT EXISTS google_event_id TEXT,
        ADD COLUMN IF NOT EXISTS google_meet_link TEXT;

        CREATE INDEX IF NOT EXISTS idx_video_sessions_google_event_id 
        ON video_sessions(google_event_id);
      `
    });

    if (error2) {
      console.log('Migration 015 result:', error2);
    } else {
      console.log('✅ Migration 015 applied!');
    }

    console.log('\n✅ All migrations completed!');
  } catch (err) {
    console.error('Error:', err);
  }
}

applyMigrations();
