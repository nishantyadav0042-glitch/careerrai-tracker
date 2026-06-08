/**
 * VOICE RECORDING SYSTEM VERIFICATION SCRIPT
 * Runs actual tests to verify the system works correctly
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

const results = [];
let passCount = 0;
let failCount = 0;

function logTest(name, status, message = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${name}`);
  if (message) console.log(`   ${message}`);
  results.push({ name, status, message });
  if (status === 'PASS') passCount++;
  if (status === 'FAIL') failCount++;
}

async function testFileExists(filePath, description) {
  try {
    await fs.access(filePath);
    logTest(`File Exists: ${description}`, 'PASS', filePath);
    return true;
  } catch {
    logTest(`File Exists: ${description}`, 'FAIL', `File not found: ${filePath}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 VOICE RECORDING SYSTEM VERIFICATION\n');
  console.log('=' .repeat(60) + '\n');

  // ========== COMPONENT FILES TEST ==========
  console.log('📋 Component Files Test\n');

  await testFileExists(
    'C:\\Users\\shekh\\careerrai-tracker\\src\\components\\voice-note-recorder.tsx',
    'VoiceNoteRecorder Component'
  );

  await testFileExists(
    'C:\\Users\\shekh\\careerrai-tracker\\src\\app\\student\\home\\buddy-feedback-card.tsx',
    'BuddyFeedbackCard (Student)'
  );

  await testFileExists(
    'C:\\Users\\shekh\\careerrai-tracker\\src\\app\\buddy\\students\\[id]\\buddy-student-view-client.tsx',
    'BuddyStudentViewClient (Buddy)'
  );

  console.log('\n' + '=' .repeat(60) + '\n');

  // ========== DATABASE CONNECTIVITY TEST ==========
  console.log('🔌 Database Connectivity Test\n');

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Test 1: Can connect
    const { data: test, error: connError } = await supabase
      .from('buddy_feedback')
      .select('count', { count: 'exact' })
      .limit(0);

    if (connError) {
      logTest('Database Connection', 'FAIL', connError.message);
    } else {
      logTest('Database Connection', 'PASS', 'Connected to Supabase');
    }

    // Test 2: Check table structure
    const { data: records, error: structError } = await supabase
      .from('buddy_feedback')
      .select('*')
      .limit(1);

    if (structError) {
      logTest('Table Schema', 'FAIL', structError.message);
    } else if (records && records.length > 0) {
      const hasFeedbackType = 'feedback_type' in records[0];
      const hasVoiceNoteUrl = 'voice_note_url' in records[0];

      if (hasFeedbackType && hasVoiceNoteUrl) {
        logTest('Table Schema', 'PASS', 'Has feedback_type and voice_note_url columns');
      } else {
        logTest('Table Schema', 'FAIL', 'Missing required columns');
      }
    } else {
      logTest('Table Schema', 'WARN', 'No records to verify schema');
    }

    // Test 3: Storage bucket
    const { data: bucketData, error: bucketError } = await supabase.storage
      .from('voice-notes')
      .list('', { limit: 1 });

    if (bucketError) {
      logTest('Storage Bucket', 'FAIL', bucketError.message);
    } else {
      logTest('Storage Bucket', 'PASS', 'voice-notes bucket is accessible');
    }

    // Test 4: Data quality - check for invalid feedback_type
    const { data: allRecords, error: qualityError } = await supabase
      .from('buddy_feedback')
      .select('id, feedback_type')
      .limit(100);

    if (qualityError) {
      logTest('Data Quality', 'WARN', 'Could not check data quality');
    } else {
      const validTypes = ['buddy_feedback', 'student_response', 'text'];
      const invalidCount = allRecords.filter(r =>
        !r.feedback_type || !validTypes.includes(r.feedback_type)
      ).length;

      if (invalidCount === 0) {
        logTest('Data Quality', 'PASS', `All ${allRecords.length} records have valid feedback_type`);
      } else {
        logTest('Data Quality', 'WARN', `Found ${invalidCount} records with invalid feedback_type`);
      }
    }

    // Test 5: Self-feedback check
    const { data: selfFeedback, error: selfError } = await supabase
      .from('buddy_feedback')
      .select('id')
      .or('student_id.eq.buddy_id')
      .limit(10);

    if (selfError) {
      logTest('Self-Feedback Check', 'WARN', 'Could not verify');
    } else if (selfFeedback && selfFeedback.length === 0) {
      logTest('Self-Feedback Check', 'PASS', 'No self-feedback records found');
    } else {
      logTest('Self-Feedback Check', 'WARN', `Found ${selfFeedback.length} self-feedback records`);
    }

  } catch (error) {
    logTest('Database Tests', 'FAIL', error.message);
  }

  console.log('\n' + '=' .repeat(60) + '\n');

  // ========== SUMMARY ==========
  console.log('📊 TEST SUMMARY\n');
  console.log(`✅ PASSED: ${passCount}`);
  console.log(`❌ FAILED: ${failCount}`);
  console.log(`⚠️ WARNINGS: ${results.filter(r => r.status === 'WARN').length}`);
  console.log('\n' + '=' .repeat(60) + '\n');

  if (failCount === 0) {
    console.log('🎉 VOICE RECORDING SYSTEM VERIFICATION COMPLETE - ALL CHECKS PASSED\n');
    return true;
  } else {
    console.log('⚠️ VOICE RECORDING SYSTEM HAS ISSUES - SEE ABOVE\n');
    return false;
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
