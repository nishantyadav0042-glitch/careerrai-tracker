#!/usr/bin/env node

/**
 * Execute Supabase database fixes
 * This script reads all migration files and logs the SQL to be executed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runFixes() {
  console.log('🚀 CareerRai Database Fix Script\n');
  console.log('=' .repeat(50));

  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  const migrations = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`\n📋 Found ${migrations.length} migrations to apply:\n`);

  let totalSize = 0;
  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    const size = content.length;
    totalSize += size;

    console.log(`  ✓ ${migration}`);
    console.log(`    └─ ${lines} lines, ${size} bytes\n`);
  }

  console.log('=' .repeat(50));
  console.log(`\n📊 Total: ${migrations.length} migrations, ${totalSize} bytes\n`);

  console.log('🔧 AUTOMATIC FIX INSTRUCTIONS:\n');
  console.log('Since we can\'t execute SQL directly via CLI without authentication,');
  console.log('here\'s what was prepared for you:\n');

  console.log('✅ OPTION 1: Use Supabase Web Interface (2 minutes)');
  console.log('   1. Go to: https://app.supabase.com');
  console.log('   2. SQL Editor > New Query');
  console.log('   3. Open file: SUPABASE_FIX_ALL.sql');
  console.log('   4. Copy all code');
  console.log('   5. Paste & Run in SQL Editor\n');

  console.log('✅ OPTION 2: Use Migrations (Need auth)');
  console.log('   supabase db push\n');

  console.log('=' .repeat(50));
  console.log('\n🎯 RECOMMENDATION: Use Option 1 (Web Interface)');
  console.log('   It\'s faster and doesn\'t require authentication setup.\n');

  // List what will be fixed
  console.log('📝 What these migrations will fix:\n');
  const fixes = [
    'Add onboarding_completed column to profiles',
    'Add buddy_id column to profiles',
    'Create daily_reports table',
    'Create streak_data table',
    'Create test_results table',
    'Create feedback table',
    'Create storage buckets',
    'Set up Row Level Security (RLS) policies',
    'Create proper database indexes',
    'Ensure all required columns exist'
  ];

  fixes.forEach((fix, i) => {
    console.log(`   ${i + 1}. ${fix}`);
  });

  console.log('\n' + '=' .repeat(50));
  console.log('\n✨ Next Step: Open SUPABASE_FIX_ALL.sql and follow Option 1 above!\n');
}

runFixes().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
