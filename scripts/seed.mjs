// CareerRai seed script — creates demo accounts + 14 days of data
// Run with: node scripts/seed.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pobhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASS = 'CareerRai2026!';

const USERS = [
  { email: 'admin@careerrai.com', full_name: 'Nishant (Admin)', role: 'admin' },
  { email: 'nishant@careerrai.com', full_name: 'Nishant Mentor', role: 'buddy' },
  { email: 'mentor2@careerrai.com', full_name: 'Priya Mentor', role: 'buddy' },
  { email: 'aarav@careerrai.com', full_name: 'Aarav Sharma', role: 'student', exam_target: 'CAT' },
  { email: 'priya@careerrai.com', full_name: 'Priya Verma', role: 'student', exam_target: 'CAT' },
  { email: 'rohan@careerrai.com', full_name: 'Rohan Gupta', role: 'student', exam_target: 'CUET' },
  { email: 'meera@careerrai.com', full_name: 'Meera Patel', role: 'student', exam_target: 'CAT' },
  { email: 'arjun@careerrai.com', full_name: 'Arjun Singh', role: 'student', exam_target: 'CUET' },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function makeReport(studentId, daysAgo) {
  const mockTaken = daysAgo % 3 === 0;
  const stress = randomInt(2, 5);
  return {
    student_id: studentId,
    report_date: dateStr(daysAgo),
    study_duration: parseFloat((randomInt(3, 7) + Math.random()).toFixed(1)),
    topics_covered: [
      ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'][randomInt(0, 4)],
      ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'][randomInt(0, 5)],
    ].filter((v, i, a) => a.indexOf(v) === i),
    quality_focus: randomInt(2, 5),
    difficulty: randomInt(2, 5),
    mock_taken: mockTaken,
    mock_name: mockTaken ? `CAT Mock ${30 - daysAgo}` : null,
    quant_score: mockTaken ? randomInt(65, 95) : null,
    verbal_score: mockTaken ? randomInt(65, 95) : null,
    logic_score: mockTaken ? randomInt(60, 90) : null,
    total_accuracy: mockTaken ? randomInt(70, 92) : null,
    confidence: randomInt(2, 5),
    stress,
    sleep_quality: randomInt(2, 5),
    nutrition_exercise: Math.random() > 0.4,
    overall_energy: randomInt(2, 5),
    notes: daysAgo === 7 ? 'Tough week but hanging in there' : null,
  };
}

async function main() {
  console.log('🌱 Seeding CareerRai demo data...\n');

  // Step 1: create auth users
  const userIds = {};
  for (const u of USERS) {
    process.stdout.write(`Creating ${u.role}: ${u.email}... `);
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASS,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role },
    });
    if (error && !error.message.includes('already been registered')) {
      console.error('ERROR:', error.message);
    } else if (data?.user) {
      userIds[u.email] = data.user.id;
      console.log('✓', data.user.id);
    } else {
      // User already exists — fetch id
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const found = users.find(u2 => u2.email === u.email);
      if (found) { userIds[u.email] = found.id; console.log('(already exists)', found.id); }
    }
  }

  // Step 2: upsert profiles
  console.log('\nUpserting profiles...');
  const profileRows = USERS.map(u => ({
    id: userIds[u.email],
    role: u.role,
    full_name: u.full_name,
    email: u.email,
    exam_target: u.exam_target ?? null,
    notif_prefs: { daily_reminder: true, reminder_time: '20:00', email: true, push: false },
  })).filter(p => p.id);

  const { error: profErr } = await supabase.from('profiles').upsert(profileRows, { onConflict: 'id' });
  if (profErr) console.error('Profile upsert error:', profErr.message);
  else console.log('✓ Profiles upserted');

  // Step 3: assign students to buddies
  const buddy1Id = userIds['nishant@careerrai.com'];
  const buddy2Id = userIds['mentor2@careerrai.com'];
  const studentEmails = ['aarav@careerrai.com', 'priya@careerrai.com', 'rohan@careerrai.com'];
  const student2Emails = ['meera@careerrai.com', 'arjun@careerrai.com'];

  for (const email of studentEmails) {
    if (userIds[email] && buddy1Id) {
      await supabase.from('profiles').update({ buddy_id: buddy1Id }).eq('id', userIds[email]);
    }
  }
  for (const email of student2Emails) {
    if (userIds[email] && buddy2Id) {
      await supabase.from('profiles').update({ buddy_id: buddy2Id }).eq('id', userIds[email]);
    }
  }
  console.log('✓ Students assigned to buddies');

  // Step 4: create daily reports (14 days, skip today and 2 random days per student)
  console.log('\nCreating daily reports...');
  const studentList = USERS.filter(u => u.role === 'student');
  for (const s of studentList) {
    if (!userIds[s.email]) continue;
    const skip = new Set([0, randomInt(3, 8), randomInt(9, 13)]); // today + 2 random gaps
    const reports = [];
    for (let d = 1; d <= 14; d++) {
      if (!skip.has(d)) reports.push(makeReport(userIds[s.email], d));
    }
    const { error } = await supabase.from('daily_reports').upsert(reports, { onConflict: 'student_id,report_date' });
    if (error) console.error(`Reports error for ${s.full_name}:`, error.message);
    else console.log(`✓ ${reports.length} reports for ${s.full_name}`);
  }

  // Step 5: buddy feedback
  console.log('\nCreating buddy feedback...');
  const fbRows = [
    {
      buddy_id: buddy1Id,
      student_id: userIds['aarav@careerrai.com'],
      feedback_date: dateStr(5),
      feedback_text: 'Strong week — your Quant accuracy is climbing steadily. Push harder on RC; your speed there is the bottleneck right now.',
      rating: 4,
      next_steps: ['Increase Quant practice', 'Push RC speed'],
      period_covered: 'weekly',
    },
    {
      buddy_id: buddy1Id,
      student_id: userIds['priya@careerrai.com'],
      feedback_date: dateStr(7),
      feedback_text: "Priya, stress has been high this week. Let's work on managing that first — sleep and breaks matter more than extra hours right now.",
      rating: 3,
      next_steps: ['Reduce test anxiety', 'Improve sleep schedule'],
      period_covered: 'weekly',
    },
  ].filter(f => f.buddy_id && f.student_id);

  if (fbRows.length > 0) {
    const { error } = await supabase.from('buddy_feedback').insert(fbRows);
    if (error) console.error('Feedback error:', error.message);
    else console.log('✓ Buddy feedback created');
  }

  // Step 6: test results
  console.log('\nCreating test results...');
  const testRows = [
    { student_id: userIds['aarav@careerrai.com'], test_type: 'cat-readiness', test_name: 'CAT Readiness Test', attempt_date: dateStr(10), score: 72, percentile: 78, breakdown: null },
    { student_id: userIds['aarav@careerrai.com'], test_type: 'cat-readiness', test_name: 'CAT Readiness Test', attempt_date: dateStr(3), score: 78, percentile: 83, breakdown: null },
    { student_id: userIds['priya@careerrai.com'], test_type: 'cat-readiness', test_name: 'CAT Readiness Test', attempt_date: dateStr(8), score: 61, percentile: 65, breakdown: null },
    { student_id: userIds['rohan@careerrai.com'], test_type: 'cuet-readiness', test_name: 'CUET Readiness Test', attempt_date: dateStr(6), score: 68, percentile: 72, breakdown: null },
  ].filter(t => t.student_id);

  if (testRows.length > 0) {
    const { error } = await supabase.from('test_results').insert(testRows);
    if (error) console.error('Test results error:', error.message);
    else console.log('✓ Test results created');
  }

  // Step 7: welcome notifications
  console.log('\nCreating welcome notifications...');
  const notifRows = [];
  for (const s of studentList) {
    if (!userIds[s.email]) continue;
    notifRows.push({
      user_id: userIds[s.email],
      type: 'broadcast',
      title: 'Welcome to CareerRai! 🎯',
      body: "Bas 90 second roz. That's it. Fill your first daily report to start your streak.",
      data: {},
      read: false,
      channel: 'in_app',
    });
  }
  if (notifRows.length > 0) {
    await supabase.from('notifications').insert(notifRows);
    console.log('✓ Welcome notifications created');
  }

  console.log('\n✅ Seed complete!\n');
  console.log('Demo login credentials (all use password: CareerRai2026!)');
  console.log('─────────────────────────────────────────────────────────');
  console.log('Student (Aarav):  aarav@careerrai.com');
  console.log('Student (Priya):  priya@careerrai.com');
  console.log('Student (Rohan):  rohan@careerrai.com');
  console.log('Student (Meera):  meera@careerrai.com');
  console.log('Student (Arjun):  arjun@careerrai.com');
  console.log('Buddy (Nishant):  nishant@careerrai.com');
  console.log('Buddy (Priya M):  mentor2@careerrai.com');
  console.log('Admin:            admin@careerrai.com');
  console.log('─────────────────────────────────────────────────────────');
}

main().catch(console.error);
