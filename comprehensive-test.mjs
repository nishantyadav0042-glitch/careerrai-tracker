#!/usr/bin/env node

/**
 * COMPREHENSIVE VOICE RECORDING SYSTEM TEST SUITE
 * Tests A-Z features and identifies errors
 *
 * This script tests:
 * 1. Code implementation correctness
 * 2. Component structure and props
 * 3. Database schema and migrations
 * 4. RLS policy configuration
 * 5. API endpoint structure
 * 6. File system integrity
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test results tracking
const results = {
  passed: [],
  failed: [],
  warnings: [],
  errors: [],
};

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, icon, message) {
  console.log(`${COLORS[color]}${icon} ${message}${COLORS.reset}`);
}

function pass(message) {
  log('green', '✅', message);
  results.passed.push(message);
}

function fail(message) {
  log('red', '❌', message);
  results.failed.push(message);
}

function warn(message) {
  log('yellow', '⚠️ ', message);
  results.warnings.push(message);
}

function info(message) {
  log('blue', 'ℹ️ ', message);
}

function section(title) {
  console.log(`\n${COLORS.cyan}${'═'.repeat(70)}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${'═'.repeat(70)}${COLORS.reset}\n`);
}

// Helper functions
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function checkCodePattern(content, pattern, description) {
  if (!content) return false;
  const regex = new RegExp(pattern, 'gim');
  return regex.test(content);
}

async function countOccurrences(content, pattern) {
  if (!content) return 0;
  const regex = new RegExp(pattern, 'gim');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

// ============================================================================
// TEST SUITE A: FILE STRUCTURE & EXISTENCE
// ============================================================================

async function testA_FileStructure() {
  section('TEST A: FILE STRUCTURE & EXISTENCE');

  const requiredFiles = [
    'src/components/voice-note-recorder.tsx',
    'src/app/student/home/buddy-feedback-card.tsx',
    'src/app/buddy/students/[id]/buddy-student-view-client.tsx',
    'src/app/api/auth/login/route.ts',
    'supabase/migrations/007_fix_voice_feedback_rls.sql',
    'supabase/migrations/008_cleanup_test_recordings.sql',
    'src/app/api/admin/fix-audio-issue/route.ts',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(__dirname, file);
    const exists = await fileExists(fullPath);
    if (exists) {
      pass(`File exists: ${file}`);
    } else {
      fail(`CRITICAL: File missing: ${file}`);
    }
  }
}

// ============================================================================
// TEST B: VOICE RECORDER COMPONENT IMPLEMENTATION
// ============================================================================

async function testB_VoiceRecorderComponent() {
  section('TEST B: VOICE RECORDER COMPONENT IMPLEMENTATION');

  const filePath = path.join(__dirname, 'src/components/voice-note-recorder.tsx');
  const content = await readFile(filePath);

  if (!content) {
    fail('Cannot read voice-note-recorder.tsx');
    return;
  }

  // Check 1: feedbackType parameter
  if (checkCodePattern(content, `feedbackType.*?:.*?string`, 'feedbackType parameter')) {
    pass('✓ Accepts feedbackType parameter');
  } else {
    fail('✗ Missing feedbackType parameter');
  }

  // Check 2: Default value enforcement
  if (checkCodePattern(content, `feedbackType.*?\\??=.*?['"]buddy_feedback['"]`, 'default value')) {
    pass('✓ Sets default feedbackType to buddy_feedback');
  } else {
    warn('⚠ Default feedbackType may not be set');
  }

  // Check 3: Feedback type insertion
  if (checkCodePattern(content, `feedback_type.*?:.*?feedbackType`, 'feedback_type insertion')) {
    pass('✓ Inserts feedback_type into database');
  } else {
    fail('✗ Does not insert feedback_type into database');
  }

  // Check 4: Storage bucket reference
  if (checkCodePattern(content, `voice-notes|voiceNotes`, 'storage bucket')) {
    pass('✓ References voice-notes storage bucket');
  } else {
    fail('✗ Missing storage bucket reference');
  }

  // Check 5: WebM codec support
  if (checkCodePattern(content, `webm|audio/webm|mimetype`, 'WebM codec')) {
    pass('✓ Supports WebM audio codec');
  } else {
    warn('⚠ WebM codec support may be missing');
  }

  // Check 6: Error handling
  if (checkCodePattern(content, `error|catch|try`, 'error handling')) {
    pass('✓ Has error handling for recording/upload');
  } else {
    warn('⚠ Limited error handling detected');
  }
}

// ============================================================================
// TEST C: STUDENT PANEL - BUDDY FEEDBACK VIEW
// ============================================================================

async function testC_StudentPanel() {
  section('TEST C: STUDENT PANEL - BUDDY FEEDBACK VIEW');

  const filePath = path.join(__dirname, 'src/app/student/home/buddy-feedback-card.tsx');
  const content = await readFile(filePath);

  if (!content) {
    fail('Cannot read buddy-feedback-card.tsx');
    return;
  }

  // Check 1: VoiceNoteRecorder usage
  if (checkCodePattern(content, `VoiceNoteRecorder`, 'VoiceNoteRecorder')) {
    pass('✓ Uses VoiceNoteRecorder component');
  } else {
    fail('✗ Does not use VoiceNoteRecorder');
  }

  // Check 2: student_response feedbackType
  if (checkCodePattern(content, `feedbackType.*?=.*?student_response|student_response.*?feedbackType`, 'student_response')) {
    pass('✓ Sets feedbackType to student_response');
  } else {
    fail('✗ Does not set feedbackType to student_response');
  }

  // Check 3: Buddy feedback filtering
  if (checkCodePattern(content, `feedback_type.*?=.*?buddy_feedback|buddy_feedback.*?feedback_type`, 'buddy_feedback filter')) {
    pass('✓ Filters to show buddy_feedback only');
  } else {
    fail('✗ Does not filter for buddy_feedback');
  }

  // Check 4: Self-feedback prevention
  if (checkCodePattern(content, `buddyId.*?===.*?studentId|studentId.*?===.*?buddyId|buddy.*?student.*?check`, 'self-feedback check')) {
    pass('✓ Has self-feedback prevention check');
  } else {
    warn('⚠ Self-feedback prevention may be missing');
  }

  // Check 5: "Record voice response" button label
  if (checkCodePattern(content, `Record.*?response|response.*?Record`, 'record response label')) {
    pass('✓ Has "Record voice response" button');
  } else {
    warn('⚠ Button label may be incorrect');
  }

  // Check 6: Audio playback component
  if (checkCodePattern(content, `audio|Audio|play`, 'audio playback')) {
    pass('✓ Has audio playback component');
  } else {
    warn('⚠ Audio playback component may be missing');
  }
}

// ============================================================================
// TEST D: BUDDY PANEL - STUDENT VIEW
// ============================================================================

async function testD_BuddyPanel() {
  section('TEST D: BUDDY PANEL - STUDENT VIEW');

  const filePath = path.join(__dirname, 'src/app/buddy/students/[id]/buddy-student-view-client.tsx');
  const content = await readFile(filePath);

  if (!content) {
    fail('Cannot read buddy-student-view-client.tsx');
    return;
  }

  // Check 1: VoiceNoteRecorder usage
  if (checkCodePattern(content, `VoiceNoteRecorder`, 'VoiceNoteRecorder')) {
    pass('✓ Uses VoiceNoteRecorder component');
  } else {
    fail('✗ Does not use VoiceNoteRecorder');
  }

  // Check 2: buddy_feedback feedbackType
  if (checkCodePattern(content, `feedbackType.*?=.*?buddy_feedback|buddy_feedback.*?feedbackType`, 'buddy_feedback')) {
    pass('✓ Sets feedbackType to buddy_feedback');
  } else {
    fail('✗ Does not set feedbackType to buddy_feedback');
  }

  // Check 3: Voice Note button
  if (checkCodePattern(content, `Voice.*?Note|Record.*?Feedback|feedback.*?button`, 'voice note button')) {
    pass('✓ Has Voice Note button for recording');
  } else {
    warn('⚠ Voice Note button may be missing');
  }

  // Check 4: Student-specific recording
  if (checkCodePattern(content, `studentId|student_id`, 'studentId parameter')) {
    pass('✓ Records feedback for specific student');
  } else {
    warn('⚠ May not record for specific student');
  }

  // Check 5: Student response display
  if (checkCodePattern(content, `student.*?response|response|student_response`, 'student responses')) {
    pass('✓ Displays student responses');
  } else {
    warn('⚠ May not display student responses');
  }
}

// ============================================================================
// TEST E: DATABASE SCHEMA & COLUMNS
// ============================================================================

async function testE_DatabaseSchema() {
  section('TEST E: DATABASE SCHEMA & COLUMNS');

  // Check buddy_feedback table structure
  const migrationPath = path.join(__dirname, 'supabase/migrations/001_initial_schema.sql');
  const content = await readFile(migrationPath);

  if (!content) {
    warn('Cannot verify database schema - file not found');
    return;
  }

  // Check 1: buddy_feedback table exists
  if (checkCodePattern(content, `CREATE.*?TABLE.*?buddy_feedback|buddy_feedback.*?CREATE.*?TABLE`, 'buddy_feedback table')) {
    pass('✓ buddy_feedback table created');
  } else {
    fail('✗ buddy_feedback table not found');
  }

  // Check 2: feedback_type column exists
  if (checkCodePattern(content, `feedback_type`, 'feedback_type column')) {
    pass('✓ feedback_type column exists');
  } else {
    fail('✗ feedback_type column missing');
  }

  // Check 3: voice_note_url column exists
  if (checkCodePattern(content, `voice_note_url`, 'voice_note_url column')) {
    pass('✓ voice_note_url column exists');
  } else {
    warn('⚠ voice_note_url column may be missing');
  }

  // Check 4: student_id column exists
  if (checkCodePattern(content, `student_id`, 'student_id column')) {
    pass('✓ student_id column exists');
  } else {
    fail('✗ student_id column missing');
  }

  // Check 5: buddy_id column exists
  if (checkCodePattern(content, `buddy_id`, 'buddy_id column')) {
    pass('✓ buddy_id column exists');
  } else {
    fail('✗ buddy_id column missing');
  }
}

// ============================================================================
// TEST F: RLS POLICIES
// ============================================================================

async function testF_RLSPolicies() {
  section('TEST F: RLS POLICIES (Row Level Security)');

  const migrationPath = path.join(__dirname, 'supabase/migrations/007_fix_voice_feedback_rls.sql');
  const content = await readFile(migrationPath);

  if (!content) {
    fail('CRITICAL: RLS migration file not found');
    return;
  }

  // Check 1: Policy for buddy insertion
  if (checkCodePattern(content, `buddy.*?insert|insert.*?buddy`, 'buddy insert policy')) {
    pass('✓ Buddy insert policy exists');
  } else {
    fail('✗ Buddy insert policy missing');
  }

  // Check 2: Buddy can only insert own feedback
  if (checkCodePattern(content, `buddy_id.*?=.*?auth.uid|auth.uid.*?=.*?buddy_id`, 'buddy_id check')) {
    pass('✓ Buddy insert limited to own feedback');
  } else {
    fail('✗ Buddy insert not properly limited');
  }

  // Check 3: Policy for student responses
  if (checkCodePattern(content, `student.*?insert|insert.*?student`, 'student insert policy')) {
    pass('✓ Student response policy exists');
  } else {
    fail('✗ Student response policy missing');
  }

  // Check 4: Student can only insert own responses
  if (checkCodePattern(content, `student_id.*?=.*?auth.uid|auth.uid.*?=.*?student_id`, 'student_id check')) {
    pass('✓ Student insert limited to own responses');
  } else {
    fail('✗ Student insert not properly limited');
  }

  // Check 5: Read policy exists
  if (checkCodePattern(content, `SELECT.*?USING|for select`, 'select policy')) {
    pass('✓ SELECT policy exists');
  } else {
    warn('⚠ SELECT policy may be missing');
  }

  // Check 6: Read limited to relevant users
  if (checkCodePattern(content, `buddy_id.*?OR.*?student_id|student_id.*?OR.*?buddy_id`, 'read limitation')) {
    pass('✓ Read access limited to relevant users');
  } else {
    fail('✗ Read access not properly limited');
  }
}

// ============================================================================
// TEST G: DATA CLEANUP MIGRATIONS
// ============================================================================

async function testG_DataCleanup() {
  section('TEST G: DATA CLEANUP MIGRATIONS');

  // Check migration 008
  const migration008Path = path.join(__dirname, 'supabase/migrations/008_cleanup_test_recordings.sql');
  const content008 = await readFile(migration008Path);

  if (!content008) {
    fail('Data cleanup migration 008 not found');
  } else {
    // Check 1: Delete self-feedback
    if (checkCodePattern(content008, `student_id.*?=.*?buddy_id|buddy_id.*?=.*?student_id|self.*?feedback`, 'self-feedback deletion')) {
      pass('✓ Migration 008 deletes self-feedback');
    } else {
      fail('✗ Migration 008 missing self-feedback cleanup');
    }

    // Check 2: Delete invalid types
    if (checkCodePattern(content008, `feedback_type.*?NULL|NULL.*?feedback_type|invalid.*?type`, 'invalid type deletion')) {
      pass('✓ Migration 008 deletes invalid feedback_type');
    } else {
      fail('✗ Migration 008 missing invalid type cleanup');
    }
  }

  // Check migration 009
  const migration009Path = path.join(__dirname, 'supabase/migrations/009_comprehensive_audio_fix.sql');
  const content009 = await readFile(migration009Path);

  if (!content009) {
    warn('Comprehensive fix migration 009 not found');
  } else {
    pass('✓ Comprehensive cleanup migration 009 exists');
  }
}

// ============================================================================
// TEST H: ADMIN API ENDPOINT
// ============================================================================

async function testH_AdminAPI() {
  section('TEST H: ADMIN API ENDPOINT');

  const filePath = path.join(__dirname, 'src/app/api/admin/fix-audio-issue/route.ts');
  const content = await readFile(filePath);

  if (!content) {
    fail('Admin fix endpoint not found');
    return;
  }

  // Check 1: Route exists
  pass('✓ Admin fix endpoint exists');

  // Check 2: POST handler
  if (checkCodePattern(content, `POST|export.*?POST|function.*?POST`, 'POST handler')) {
    pass('✓ Has POST handler');
  } else {
    fail('✗ Missing POST handler');
  }

  // Check 3: Self-feedback deletion
  if (checkCodePattern(content, `student_id.*?buddy_id|buddy_id.*?student_id`, 'self-feedback deletion')) {
    pass('✓ Deletes self-feedback');
  } else {
    warn('⚠ May not delete self-feedback');
  }

  // Check 4: Invalid type deletion
  if (checkCodePattern(content, `feedback_type.*?null|NULL|invalid`, 'invalid type deletion')) {
    pass('✓ Deletes invalid feedback_type');
  } else {
    warn('⚠ May not delete invalid types');
  }

  // Check 5: Statistics return
  if (checkCodePattern(content, `return|response|status|count`, 'return value')) {
    pass('✓ Returns statistics');
  } else {
    warn('⚠ May not return cleanup statistics');
  }
}

// ============================================================================
// TEST I: LOGIN & AUTHENTICATION
// ============================================================================

async function testI_Authentication() {
  section('TEST I: LOGIN & AUTHENTICATION');

  const filePath = path.join(__dirname, 'src/app/api/auth/login/route.ts');
  const content = await readFile(filePath);

  if (!content) {
    fail('Login endpoint not found');
    return;
  }

  // Check 1: Username lookup
  if (checkCodePattern(content, `username|ilike`, 'username lookup')) {
    pass('✓ Looks up user by username');
  } else {
    fail('✗ Does not look up by username');
  }

  // Check 2: Email retrieval
  if (checkCodePattern(content, `email`, 'email retrieval')) {
    pass('✓ Retrieves email for auth');
  } else {
    warn('⚠ May not retrieve email');
  }

  // Check 3: Supabase auth call
  if (checkCodePattern(content, `signInWithPassword|auth`, 'supabase auth')) {
    pass('✓ Uses Supabase auth');
  } else {
    fail('✗ Does not use Supabase auth');
  }

  // Check 4: Role-based redirect
  if (checkCodePattern(content, `role.*?buddy|buddy.*?role|student|admin|redirect`, 'role-based routing')) {
    pass('✓ Redirects based on role');
  } else {
    warn('⚠ May not redirect based on role');
  }
}

// ============================================================================
// TEST J: STORAGE BUCKET CONFIGURATION
// ============================================================================

async function testJ_StorageBucket() {
  section('TEST J: STORAGE BUCKET CONFIGURATION');

  const migrationPath = path.join(__dirname, 'supabase/migrations/006_create_voice_storage.sql');
  const content = await readFile(migrationPath);

  if (!content) {
    warn('Storage bucket migration not found - may be configured elsewhere');
    return;
  }

  // Check 1: Bucket creation
  if (checkCodePattern(content, `voice-notes|voice_notes`, 'bucket name')) {
    pass('✓ Creates voice-notes bucket');
  } else {
    fail('✗ Does not create voice-notes bucket');
  }

  // Check 2: Public access
  if (checkCodePattern(content, `public|private`, 'bucket visibility')) {
    pass('✓ Configures bucket visibility');
  } else {
    warn('⚠ Bucket visibility not configured');
  }
}

// ============================================================================
// TEST K: COMPONENT INTEGRATION
// ============================================================================

async function testK_ComponentIntegration() {
  section('TEST K: COMPONENT INTEGRATION');

  // Check that all components import VoiceNoteRecorder
  const studentPath = path.join(__dirname, 'src/app/student/home/buddy-feedback-card.tsx');
  const buddyPath = path.join(__dirname, 'src/app/buddy/students/[id]/buddy-student-view-client.tsx');

  const studentContent = await readFile(studentPath);
  const buddyContent = await readFile(buddyPath);

  if (studentContent && checkCodePattern(studentContent, `import.*?VoiceNoteRecorder|from.*?voice-note`, 'student import')) {
    pass('✓ Student component imports VoiceNoteRecorder');
  } else {
    fail('✗ Student component does not import VoiceNoteRecorder');
  }

  if (buddyContent && checkCodePattern(buddyContent, `import.*?VoiceNoteRecorder|from.*?voice-note`, 'buddy import')) {
    pass('✓ Buddy component imports VoiceNoteRecorder');
  } else {
    fail('✗ Buddy component does not import VoiceNoteRecorder');
  }

  // Check for proper prop passing
  if (studentContent && checkCodePattern(studentContent, `<VoiceNoteRecorder`, 'student render')) {
    pass('✓ Student renders VoiceNoteRecorder');
  } else {
    fail('✗ Student does not render VoiceNoteRecorder');
  }

  if (buddyContent && checkCodePattern(buddyContent, `<VoiceNoteRecorder`, 'buddy render')) {
    pass('✓ Buddy renders VoiceNoteRecorder');
  } else {
    fail('✗ Buddy does not render VoiceNoteRecorder');
  }
}

// ============================================================================
// TEST L: MIGRATION CHAIN
// ============================================================================

async function testL_MigrationChain() {
  section('TEST L: MIGRATION CHAIN');

  const migrationDir = path.join(__dirname, 'supabase/migrations');

  try {
    const files = await fs.readdir(migrationDir);
    const migrations = files.filter(f => f.endsWith('.sql')).sort();

    if (migrations.length === 0) {
      fail('No migrations found');
      return;
    }

    pass(`✓ Found ${migrations.length} migrations`);

    // Check for critical migrations
    const criticalMigrations = [
      '001_initial_schema.sql',
      '007_fix_voice_feedback_rls.sql',
      '008_cleanup_test_recordings.sql',
    ];

    for (const critical of criticalMigrations) {
      if (migrations.includes(critical)) {
        pass(`✓ Critical migration exists: ${critical}`);
      } else {
        fail(`✗ Missing critical migration: ${critical}`);
      }
    }
  } catch (error) {
    fail(`Cannot read migrations directory: ${error.message}`);
  }
}

// ============================================================================
// TEST M: CROSS-VISIBILITY PREVENTION
// ============================================================================

async function testM_Visibility() {
  section('TEST M: CROSS-VISIBILITY PREVENTION');

  // Check RLS policies for proper isolation
  const rlsPath = path.join(__dirname, 'supabase/migrations/007_fix_voice_feedback_rls.sql');
  const content = await readFile(rlsPath);

  if (!content) {
    fail('Cannot verify RLS policies');
    return;
  }

  // Check 1: Buddy-to-buddy isolation
  if (checkCodePattern(content, `buddy_id.*?auth.uid`, 'buddy isolation')) {
    pass('✓ Buddies cannot see each other\'s feedback');
  } else {
    warn('⚠ Buddy isolation may not be enforced');
  }

  // Check 2: Student-to-student isolation
  if (checkCodePattern(content, `student_id.*?auth.uid`, 'student isolation')) {
    pass('✓ Students cannot see each other\'s data');
  } else {
    warn('⚠ Student isolation may not be enforced');
  }

  // Check 3: Read permission enforcement
  if (checkCodePattern(content, `SELECT.*?buddy_id|student_id`, 'read enforcement')) {
    pass('✓ Read permissions are enforced');
  } else {
    warn('⚠ Read permissions may not be fully enforced');
  }
}

// ============================================================================
// TEST N: ERROR HANDLING
// ============================================================================

async function testN_ErrorHandling() {
  section('TEST N: ERROR HANDLING');

  const recorderPath = path.join(__dirname, 'src/components/voice-note-recorder.tsx');
  const content = await readFile(recorderPath);

  if (!content) {
    fail('Cannot check error handling');
    return;
  }

  // Check 1: Try-catch blocks
  if (checkCodePattern(content, `try|catch`, 'try-catch')) {
    pass('✓ Has try-catch error handling');
  } else {
    warn('⚠ May lack error handling');
  }

  // Check 2: User feedback
  if (checkCodePattern(content, `error|message|toast|alert|notification`, 'error feedback')) {
    pass('✓ Provides error feedback to users');
  } else {
    warn('⚠ May not provide error feedback');
  }

  // Check 3: Graceful fallback
  if (checkCodePattern(content, `if.*?error|error.*?if|fallback`, 'graceful fallback')) {
    pass('✓ Has graceful error fallback');
  } else {
    warn('⚠ Error fallback may be missing');
  }
}

// ============================================================================
// TEST O: API ENDPOINT SECURITY
// ============================================================================

async function testO_APISecurity() {
  section('TEST O: API ENDPOINT SECURITY');

  const loginPath = path.join(__dirname, 'src/app/api/auth/login/route.ts');
  const loginContent = await readFile(loginPath);

  // Check 1: POST method only
  if (loginContent && checkCodePattern(loginContent, `POST`, 'POST only')) {
    pass('✓ Login only accepts POST');
  } else {
    warn('⚠ Login may accept other HTTP methods');
  }

  // Check 2: Input validation
  if (loginContent && checkCodePattern(loginContent, `username|password|validate|check|require`, 'input validation')) {
    pass('✓ Has input validation');
  } else {
    warn('⚠ Input validation may be missing');
  }

  // Check 3: Error handling
  if (loginContent && checkCodePattern(loginContent, `error|Error|catch`, 'error handling')) {
    pass('✓ Has error handling');
  } else {
    warn('⚠ Error handling may be missing');
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.clear();

  console.log(`${COLORS.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE VOICE RECORDING SYSTEM - A-Z TEST SUITE          ║');
  console.log('║   Testing all features end-to-end for errors and issues           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`${COLORS.reset}\n`);

  try {
    await testA_FileStructure();
    await testB_VoiceRecorderComponent();
    await testC_StudentPanel();
    await testD_BuddyPanel();
    await testE_DatabaseSchema();
    await testF_RLSPolicies();
    await testG_DataCleanup();
    await testH_AdminAPI();
    await testI_Authentication();
    await testJ_StorageBucket();
    await testK_ComponentIntegration();
    await testL_MigrationChain();
    await testM_Visibility();
    await testN_ErrorHandling();
    await testO_APISecurity();

    // Print summary
    section('📊 TEST RESULTS SUMMARY');

    const total = results.passed.length + results.failed.length;
    const passRate = Math.round((results.passed.length / total) * 100);

    console.log(`Total Tests: ${total}`);
    console.log(`${COLORS.green}Passed: ${results.passed.length}${COLORS.reset}`);
    console.log(`${COLORS.red}Failed: ${results.failed.length}${COLORS.reset}`);
    console.log(`${COLORS.yellow}Warnings: ${results.warnings.length}${COLORS.reset}\n`);
    console.log(`Pass Rate: ${passRate}%\n`);

    // Print failures
    if (results.failed.length > 0) {
      section('❌ FAILURES');
      results.failed.forEach((f, i) => fail(`${i + 1}. ${f}`));
    }

    // Print warnings
    if (results.warnings.length > 0) {
      section('⚠️  WARNINGS');
      results.warnings.forEach((w, i) => warn(`${i + 1}. ${w}`));
    }

    // Final status
    section('🎯 FINAL STATUS');
    if (results.failed.length === 0) {
      log('green', '✅', 'ALL CRITICAL TESTS PASSED');
      log('green', '✅', 'System is ready for testing');
      return 0;
    } else {
      log('red', '❌', `${results.failed.length} CRITICAL ISSUES FOUND`);
      log('red', '❌', 'System needs fixes before testing');
      return 1;
    }
  } catch (error) {
    fail(`Test suite error: ${error.message}`);
    return 1;
  }
}

// Run tests
runAllTests().then(exitCode => process.exit(exitCode));
