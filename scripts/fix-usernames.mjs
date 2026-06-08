// Fix script - populate usernames from emails
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const USERNAMES = {
  'aarav@careerrai.com': 'aarav',
  'priya@careerrai.com': 'priya',
  'rohan@careerrai.com': 'rohan',
  'meera@careerrai.com': 'meera',
  'arjun@careerrai.com': 'arjun',
  'nishant@careerrai.com': 'nishant',
  'mentor2@careerrai.com': 'priya_mentor',
  'admin@careerrai.com': 'admin',
};

async function main() {
  console.log('🔧 Fixing usernames in profiles...\n');

  for (const [email, username] of Object.entries(USERNAMES)) {
    console.log(`Setting username for ${email} → ${username}`);
    const { error } = await supabase
      .from('profiles')
      .update({ username })
      .eq('email', email);

    if (error) {
      console.error(`Error updating ${email}:`, error.message);
    } else {
      console.log(`✓ ${username} set`);
    }
  }

  console.log('\n✅ Username fix complete!\n');
}

main().catch(console.error);
