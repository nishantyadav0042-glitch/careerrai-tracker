// Fix script - populate usernames from emails
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  console.log('ðŸ”§ Fixing usernames in profiles...\n');

  for (const [email, username] of Object.entries(USERNAMES)) {
    console.log(`Setting username for ${email} â†’ ${username}`);
    const { error } = await supabase
      .from('profiles')
      .update({ username })
      .eq('email', email);

    if (error) {
      console.error(`Error updating ${email}:`, error.message);
    } else {
      console.log(`âœ“ ${username} set`);
    }
  }

  console.log('\nâœ… Username fix complete!\n');
}

main().catch(console.error);
