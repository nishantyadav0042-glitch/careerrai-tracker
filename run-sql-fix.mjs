#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://pobhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.0',
    },
  },
});

async function executeSQLFixes() {
  console.log('🚀 Starting Supabase Database Fixes\n');
  console.log('=' .repeat(70));

  try {
    // Read the SQL file
    const sqlContent = fs.readFileSync('SUPABASE_FIX_ALL.sql', 'utf-8');

    console.log('📝 SQL file loaded: SUPABASE_FIX_ALL.sql');
    console.log(`   Total size: ${(sqlContent.length / 1024).toFixed(1)}KB\n`);

    // Note: Direct SQL execution via Supabase client is limited
    // The JS SDK doesn't expose raw SQL execution for security reasons
    console.log('⚠️  Direct SQL execution via SDK not available');
    console.log('   (Security restriction: SDK is REST-only, not direct SQL)\n');

    // Alternative: Try to execute via RPC if a function exists
    console.log('🔍 Checking database connection...');

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Connection failed:', error.message);
      console.log('\n⚠️  Cannot execute SQL through Node.js SDK');
      console.log('   Reason: Supabase JS SDK is REST-only for security\n');
      throw error;
    }

    console.log('✅ Database connection successful!\n');

    // Since direct SQL execution isn't available via SDK
    // We need to use the CLI or web interface
    console.log('=' .repeat(70));
    console.log('\n🎯 RECOMMENDED SOLUTION:\n');
    console.log('Use Supabase CLI to push migrations:\n');
    console.log('  $ supabase db push\n');
    console.log('This will automatically execute the migration file:');
    console.log('  supabase/migrations/20260606_ensure_onboarding_completed.sql\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

executeSQLFixes();
