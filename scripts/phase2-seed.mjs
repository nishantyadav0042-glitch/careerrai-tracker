// CareerRai Phase 2 seed â€” 30 days of rich, realistic data
// Run with: node scripts/phase2-seed.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pobhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function dateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Realistic patterns per student
const PATTERNS = {
  'aarav@careerrai.com': {
    name: 'Aarav Sharma',
    style: 'consistent_improver',
    baseStudy: 5.5, baseConf: 3.8, baseStress: 2.8, baseSleep: 3.5, missRate: 0.08,
  },
  'priya@careerrai.com': {
    name: 'Priya Verma',
    style: 'stressed_hardworker',
    baseStudy: 4.8, baseConf: 2.8, baseStress: 4.2, baseSleep: 2.5, missRate: 0.15,
  },
  'rohan@careerrai.com': {
    name: 'Rohan Gupta',
    style: 'inconsistent_recovering',
    baseStudy: 3.5, baseConf: 3.2, baseStress: 3.0, baseSleep: 3.0, missRate: 0.25,
  },
  'meera@careerrai.com': {
    name: 'Meera Patel',
    style: 'declining_redflag',
    baseStudy: 4.0, baseConf: 3.5, baseStress: 3.5, baseSleep: 3.0, missRate: 0.2,
  },
  'arjun@careerrai.com': {
    name: 'Arjun Singh',
    style: 'new_finding_rhythm',
    baseStudy: 2.8, baseConf: 2.5, baseStress: 3.5, baseSleep: 3.0, missRate: 0.3,
  },
};

const TOPICS_CAT = ['Quant', 'Verbal', 'DILR', 'Reading Comprehension', 'Mock Test', 'Revision', 'Sectional Test'];
const TOPICS_CUET = ['Maths', 'English', 'General Studies', 'Domain Subject', 'Mock Test', 'Revision', 'Sectional Test'];

function makeReport(studentId, daysAgo, pattern, examTarget) {
  const topics = examTarget === 'CUET' ? TOPICS_CUET : TOPICS_CAT;
  const p = pattern;

  // Trend: consistent_improver gets better over time, declining_redflag gets worse last 7 days
  let studyMod = 0, confMod = 0, stressMod = 0;
  if (p.style === 'consistent_improver') {
    studyMod = (30 - daysAgo) * 0.03;
    confMod = (30 - daysAgo) * 0.02;
    stressMod = -(30 - daysAgo) * 0.01;
  } else if (p.style === 'declining_redflag' && daysAgo <= 7) {
    studyMod = -daysAgo * 0.2;
    confMod = -daysAgo * 0.1;
    stressMod = daysAgo * 0.15;
  } else if (p.style === 'inconsistent_recovering' && daysAgo <= 10) {
    studyMod = (10 - daysAgo) * 0.12;
    confMod = (10 - daysAgo) * 0.08;
  } else if (p.style === 'new_finding_rhythm') {
    studyMod = (30 - daysAgo) * 0.04;
    confMod = (30 - daysAgo) * 0.03;
    stressMod = -(30 - daysAgo) * 0.015;
  }

  const noise = () => (Math.random() - 0.5) * 0.8;
  const study = clamp(parseFloat((p.baseStudy + studyMod + noise()).toFixed(1)), 0.5, 9.0);
  const conf = clamp(Math.round(p.baseConf + confMod + noise()), 1, 5);
  const stress = clamp(Math.round(p.baseStress + stressMod + noise()), 1, 5);
  const sleep = clamp(Math.round(p.baseSleep + noise() * 0.6), 1, 5);
  const energy = clamp(Math.round(3 + (conf - 3) * 0.5 + noise() * 0.5), 1, 5);

  const mockTaken = daysAgo % 5 === 0 && daysAgo > 0;
  let baseAccuracy = examTarget === 'CUET' ? 72 : 68;
  if (p.style === 'consistent_improver') baseAccuracy += (30 - daysAgo) * 0.4;
  if (p.style === 'declining_redflag' && daysAgo <= 7) baseAccuracy -= (7 - daysAgo) * 2;
  const accuracy = mockTaken ? clamp(Math.round(baseAccuracy + (Math.random() - 0.5) * 10), 40, 98) : null;
  const quant = mockTaken ? clamp(Math.round(accuracy + (Math.random() - 0.5) * 12), 40, 98) : null;
  const verbal = mockTaken ? clamp(Math.round(accuracy + (Math.random() - 0.5) * 12), 40, 98) : null;

  const t1 = topics[Math.floor(Math.random() * topics.length)];
  const t2 = topics.filter(t => t !== t1)[Math.floor(Math.random() * (topics.length - 1))];

  const weeklyNotes = {
    7: 'Feeling the pressure but not giving up',
    14: daysAgo === 14 ? 'Struggled with DILR this week, need to practice more' : null,
    21: daysAgo === 21 ? 'Good week overall, mocks improving' : null,
  };
  const note = weeklyNotes[daysAgo] ?? (daysAgo === 3 && stress >= 4 ? 'Very stressed today, exam is close' : null);

  return {
    student_id: studentId,
    report_date: dateStr(daysAgo),
    study_duration: study,
    topics_covered: [t1, t2].filter((v, i, a) => a.indexOf(v) === i),
    quality_focus: clamp(Math.round(conf + (Math.random() - 0.5)), 1, 5),
    difficulty: clamp(Math.round(3 + noise()), 1, 5),
    mock_taken: mockTaken,
    mock_name: mockTaken ? `${examTarget} Mock ${Math.ceil(daysAgo / 5)}` : null,
    quant_score: quant,
    verbal_score: verbal,
    logic_score: mockTaken ? clamp(Math.round(accuracy + (Math.random() - 0.5) * 8), 40, 98) : null,
    total_accuracy: accuracy,
    confidence: conf,
    stress,
    sleep_quality: sleep,
    nutrition_exercise: Math.random() > 0.35,
    overall_energy: energy,
    notes: note,
  };
}

async function main() {
  console.log('ðŸŒ± CareerRai Phase 2 â€” seeding rich 30-day data...\n');

  // Fetch all user IDs
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const byEmail = {};
  for (const u of users) byEmail[u.email] = u.id;

  const studentEmails = ['aarav@careerrai.com', 'priya@careerrai.com', 'rohan@careerrai.com', 'meera@careerrai.com', 'arjun@careerrai.com'];
  const buddy1Id = byEmail['nishant@careerrai.com'];
  const buddy2Id = byEmail['mentor2@careerrai.com'];
  const buddy1Students = ['aarav@careerrai.com', 'priya@careerrai.com', 'rohan@careerrai.com'];
  const buddy2Students = ['meera@careerrai.com', 'arjun@careerrai.com'];

  // Fetch exam_target for each student
  const { data: profiles } = await supabase.from('profiles').select('id,email,exam_target').in('email', studentEmails);
  const examByEmail = {};
  for (const p of profiles ?? []) examByEmail[p.email] = p.exam_target ?? 'CAT';

  // â”€â”€ Daily Reports (30 days) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('Creating 30-day reports...');
  for (const email of studentEmails) {
    const sid = byEmail[email];
    if (!sid) { console.log(`  âš  ${email} not found`); continue; }
    const pattern = PATTERNS[email];
    const exam = examByEmail[email];

    const reports = [];
    for (let d = 1; d <= 30; d++) {
      if (Math.random() < pattern.missRate) continue; // realistic gaps
      // Force some gaps in last 2 days to make "pending" state realistic
      if (d <= 2 && email === 'meera@careerrai.com') continue;
      reports.push(makeReport(sid, d, pattern, exam));
    }

    const { error } = await supabase.from('daily_reports').upsert(reports, { onConflict: 'student_id,report_date' });
    if (error) console.error(`  âœ— Reports error for ${pattern.name}:`, error.message);
    else console.log(`  âœ“ ${reports.length} reports â€” ${pattern.name} (${pattern.style})`);
  }

  // â”€â”€ Buddy Feedback (rich, 4 weeks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nCreating 4 weeks of buddy feedback...');
  const fbRows = [];

  // Nishant's feedback for his 3 students
  fbRows.push(
    { buddy_id: buddy1Id, student_id: byEmail['aarav@careerrai.com'], feedback_date: dateStr(28), feedback_text: "Strong start Aarav. Your consistency is already top-tier â€” 90% of students slip in week 1. Keep the mock schedule and don't skip RC even when it feels slow.", rating: 4, next_steps: ['Maintain daily report streak', 'Focus on RC speed'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['aarav@careerrai.com'], feedback_date: dateStr(21), feedback_text: "Mock score jumped from 68â†’75 â€” that's real momentum. Quant is your strength now. Time to go aggressive on DILR, it's the differentiator at 99+ percentile.", rating: 5, next_steps: ['Push DILR practice', 'Attempt 3 mocks this week'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['aarav@careerrai.com'], feedback_date: dateStr(14), feedback_text: "You dipped Tuesday-Wednesday â€” stress and sleep dropped together. That's a pattern to watch. The score will follow if you don't recover early. Take Thursday light.", rating: 4, next_steps: ['Improve sleep routine', 'Reduce study to 4h on recovery days'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['aarav@careerrai.com'], feedback_date: dateStr(7), feedback_text: "Last week: 6/7 days, avg 5.8h, mock accuracy 82%. You're exactly where you need to be at this stage. Maintain this. Final month â€” no experiments, stick to the plan.", rating: 5, next_steps: ['Maintain current schedule', 'Focus on accuracy over speed'], period_covered: 'weekly' },

    { buddy_id: buddy1Id, student_id: byEmail['priya@careerrai.com'], feedback_date: dateStr(28), feedback_text: "Priya, first week numbers look decent but I'm watching the stress â€” 4.2 avg is too high for Week 1. Are you sleeping enough? DM me your daily schedule.", rating: 3, next_steps: ['Reduce test anxiety', 'Improve sleep schedule'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['priya@careerrai.com'], feedback_date: dateStr(21), feedback_text: "Stress came down slightly â€” good. But mock scores haven't improved in 2 weeks. I suspect you're studying too many topics. Let's focus: Quant + RC only until mocks hit 75+.", rating: 3, next_steps: ['Narrow topic focus to Quant + RC', 'One mock per week only'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['priya@careerrai.com'], feedback_date: dateStr(14), feedback_text: "You had 2 missed days this week â€” that's okay, but your notes say 'very anxious'. Let's do a 1:1 call this weekend. Burnout at this stage is the #1 failure mode.", rating: 3, next_steps: ['Schedule 1:1 call', 'Prioritize sleep over extra study hours'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['priya@careerrai.com'], feedback_date: dateStr(5), feedback_text: "Priya â€” stress is at 4.5 this week. I'm flagging this. Study hours are high but quality is low. Take 2 days complete off. Seriously. Then restart with a lighter week.", rating: 2, next_steps: ['Take 2 days complete rest', 'Restart with lighter 3h sessions', 'Schedule 1:1 call'], period_covered: 'adhoc' },

    { buddy_id: buddy1Id, student_id: byEmail['rohan@careerrai.com'], feedback_date: dateStr(28), feedback_text: "Rohan, CUET prep is different from CAT â€” you need domain subject consistency. Right now you're spending too much on General Studies. Flip the ratio: 60% domain, 40% GS.", rating: 3, next_steps: ['Increase domain subject practice', 'Reduce GS to 40% of prep time'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['rohan@careerrai.com'], feedback_date: dateStr(21), feedback_text: "4 missed days in 2 weeks. What's happening? I saw your notes â€” 'family stuff'. That's valid but we need to build back up. Can you commit to at least 2h on busy days?", rating: 2, next_steps: ['Commit to minimum 2h even on hard days', 'Share daily schedule with me'], period_covered: 'weekly' },
    { buddy_id: buddy1Id, student_id: byEmail['rohan@careerrai.com'], feedback_date: dateStr(10), feedback_text: "Big improvement this week â€” back to 5+ days, study hours up. Mock improved to 71%. This is the Rohan I knew was there. Keep the momentum, don't let up.", rating: 4, next_steps: ['Maintain 5+ days consistency', 'Push mock frequency to every 4 days'], period_covered: 'weekly' }
  );

  // Priya Mentor's feedback for Meera and Arjun
  fbRows.push(
    { buddy_id: buddy2Id, student_id: byEmail['meera@careerrai.com'], feedback_date: dateStr(28), feedback_text: "Meera, excellent week 1. Your Verbal scores are naturally high â€” focus energy on Quant to balance. I'll send you a Quant topic list to prioritize.", rating: 4, next_steps: ['Prioritize Quant practice', 'Attempt Quant sectional tests'], period_covered: 'weekly' },
    { buddy_id: buddy2Id, student_id: byEmail['meera@careerrai.com'], feedback_date: dateStr(21), feedback_text: "Very consistent â€” 6/7 days, mock improving. You seem to be in a good rhythm. Keep this up through the next 3 weeks and you'll be exactly where the top percentile students are.", rating: 5, next_steps: ['Maintain consistency', 'Add one extra mock per week'], period_covered: 'weekly' },
    { buddy_id: buddy2Id, student_id: byEmail['meera@careerrai.com'], feedback_date: dateStr(7), feedback_text: "âš ï¸ Red flag â€” you've missed 3 days this week and stress has jumped to 4.5. What's going on? Please DM me today. This is not a number issue, this is a you issue. I'm here.", rating: 2, next_steps: ['Immediate 1:1 call', 'Understand root cause of stress spike', 'Light revision only this week'], period_covered: 'adhoc' },

    { buddy_id: buddy2Id, student_id: byEmail['arjun@careerrai.com'], feedback_date: dateStr(28), feedback_text: "Arjun, welcome! Week 1 looks understandably rough â€” CUET prep is new for most students. Goal for now: just fill the daily report. Don't worry about hours, build the habit first.", rating: 3, next_steps: ['Build daily report habit first', 'Start with 2h sessions'], period_covered: 'weekly' },
    { buddy_id: buddy2Id, student_id: byEmail['arjun@careerrai.com'], feedback_date: dateStr(14), feedback_text: "Improvement! 5/7 days now and hours climbing. Your domain subject scores are naturally good. Focus on English next â€” that's the differentiator in CUET. Start RC practice daily.", rating: 3, next_steps: ['Daily RC practice', 'Work on English proficiency'], period_covered: 'weekly' },
    { buddy_id: buddy2Id, student_id: byEmail['arjun@careerrai.com'], feedback_date: dateStr(3), feedback_text: "Good trend over 4 weeks â€” you've found your rhythm. Confidence is up, stress is down. Now push: 4h minimum daily and one sectional test every 3 days.", rating: 4, next_steps: ['Push to 4h minimum daily', 'Sectional test every 3 days'], period_covered: 'weekly' }
  );

  const validFb = fbRows.filter(f => f.buddy_id && f.student_id);
  if (validFb.length > 0) {
    // Delete existing feedback first to avoid duplicates
    await supabase.from('buddy_feedback').delete().in('buddy_id', [buddy1Id, buddy2Id].filter(Boolean));
    const { error } = await supabase.from('buddy_feedback').insert(validFb);
    if (error) console.error('  âœ— Feedback error:', error.message);
    else console.log(`  âœ“ ${validFb.length} feedback entries created`);
  }

  // â”€â”€ Test Results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nCreating test results...');
  const testRows = [
    // Aarav â€” CAT, consistently improving
    { student_id: byEmail['aarav@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 1', attempt_date: dateStr(28), score: 68, percentile: 72 },
    { student_id: byEmail['aarav@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 2', attempt_date: dateStr(23), score: 72, percentile: 76 },
    { student_id: byEmail['aarav@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 3', attempt_date: dateStr(18), score: 75, percentile: 80 },
    { student_id: byEmail['aarav@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 4', attempt_date: dateStr(13), score: 78, percentile: 83 },
    { student_id: byEmail['aarav@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 5', attempt_date: dateStr(5), score: 82, percentile: 88 },

    // Priya â€” CAT, high stress, flat/declining
    { student_id: byEmail['priya@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 1', attempt_date: dateStr(27), score: 61, percentile: 64 },
    { student_id: byEmail['priya@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 2', attempt_date: dateStr(21), score: 63, percentile: 66 },
    { student_id: byEmail['priya@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 3', attempt_date: dateStr(14), score: 60, percentile: 63 },
    { student_id: byEmail['priya@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 4', attempt_date: dateStr(6), score: 58, percentile: 60 },

    // Rohan â€” CUET, inconsistent but recovering
    { student_id: byEmail['rohan@careerrai.com'], test_type: 'cuet-mock', test_name: 'CUET Mock 1', attempt_date: dateStr(26), score: 64, percentile: 68 },
    { student_id: byEmail['rohan@careerrai.com'], test_type: 'cuet-mock', test_name: 'CUET Mock 2', attempt_date: dateStr(18), score: 60, percentile: 63 },
    { student_id: byEmail['rohan@careerrai.com'], test_type: 'cuet-mock', test_name: 'CUET Mock 3', attempt_date: dateStr(8), score: 71, percentile: 75 },

    // Meera â€” CAT, was improving now declining
    { student_id: byEmail['meera@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 1', attempt_date: dateStr(25), score: 70, percentile: 74 },
    { student_id: byEmail['meera@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 2', attempt_date: dateStr(17), score: 73, percentile: 78 },
    { student_id: byEmail['meera@careerrai.com'], test_type: 'cat-mock', test_name: 'AMS Mock 3', attempt_date: dateStr(7), score: 65, percentile: 68 },

    // Arjun â€” CUET, finding rhythm
    { student_id: byEmail['arjun@careerrai.com'], test_type: 'cuet-mock', test_name: 'CUET Mock 1', attempt_date: dateStr(22), score: 55, percentile: 57 },
    { student_id: byEmail['arjun@careerrai.com'], test_type: 'cuet-mock', test_name: 'CUET Mock 2', attempt_date: dateStr(12), score: 61, percentile: 64 },
    { student_id: byEmail['arjun@careerrai.com'], test_type: 'cuet-mock', test_name: 'CUET Mock 3', attempt_date: dateStr(4), score: 67, percentile: 70 },
  ].filter(t => t.student_id);

  await supabase.from('test_results').delete().in('student_id', Object.values(byEmail).filter(Boolean));
  const { error: testErr } = await supabase.from('test_results').insert(testRows);
  if (testErr) console.error('  âœ— Test results error:', testErr.message);
  else console.log(`  âœ“ ${testRows.length} test results created`);

  // â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nCreating notifications...');
  await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const notifRows = [];

  // Student notifications
  notifRows.push(
    { user_id: byEmail['aarav@careerrai.com'], type: 'feedback_received', title: 'Nishant left you feedback ðŸŽ¯', body: 'Mock score jumped from 68â†’75 â€” that\'s real momentum. Check your buddy feedback.', read: false, channel: 'in_app', data: {} },
    { user_id: byEmail['aarav@careerrai.com'], type: 'streak_milestone', title: 'ðŸ”¥ 7-day streak!', body: 'You\'ve filled reports 7 days in a row. Elite consistency. Keep it alive.', read: true, channel: 'in_app', data: {} },
    { user_id: byEmail['aarav@careerrai.com'], type: 'daily_reminder', title: 'Don\'t break the streak today', body: 'You\'ve been consistent for 7 days. Take 90 seconds to fill today\'s report.', read: true, channel: 'in_app', data: {} },

    { user_id: byEmail['priya@careerrai.com'], type: 'feedback_received', title: 'Nishant left you urgent feedback âš ï¸', body: 'Stress is at 4.5 this week. Nishant has a recovery plan for you â€” read it now.', read: false, channel: 'in_app', data: {} },
    { user_id: byEmail['priya@careerrai.com'], type: 'daily_reminder', title: 'Report pending ðŸ“‹', body: 'Hey Priya, your daily report is pending. Takes 90 seconds â€” do it now.', read: false, channel: 'in_app', data: {} },

    { user_id: byEmail['rohan@careerrai.com'], type: 'feedback_received', title: 'Nishant left you feedback ðŸ“ˆ', body: 'Big improvement this week! Mock improved to 71%. Check what Nishant says next.', read: false, channel: 'in_app', data: {} },

    { user_id: byEmail['meera@careerrai.com'], type: 'feedback_received', title: 'Priya M flagged a concern âš ï¸', body: 'You\'ve missed 3 days and stress is high. Your buddy wants to talk. Check feedback.', read: false, channel: 'in_app', data: {} },

    { user_id: byEmail['arjun@careerrai.com'], type: 'feedback_received', title: 'Priya M left you feedback ðŸŽ¯', body: 'Good trend over 4 weeks â€” you\'ve found your rhythm! Read your weekly feedback.', read: false, channel: 'in_app', data: {} }
  );

  // Buddy notifications
  notifRows.push(
    { user_id: buddy1Id, type: 'red_flag', title: 'âš ï¸ Red flag: Priya Verma', body: 'Priya\'s stress hit 4.5 avg this week. Mock scores declining. Needs intervention.', read: false, channel: 'in_app', data: { student_email: 'priya@careerrai.com' } },
    { user_id: buddy1Id, type: 'weekly_digest', title: 'Weekly digest â€” 3 students', body: 'Aarav: On track (88/100) â€¢ Priya: Needs intervention (42/100) â€¢ Rohan: Needs nudging (58/100)', read: false, channel: 'in_app', data: {} },
    { user_id: buddy1Id, type: 'report_submitted', title: 'Aarav submitted today\'s report âœ“', body: '5.8h study, mock score 82%. On a 7-day streak. Looking strong.', read: true, channel: 'in_app', data: {} },

    { user_id: buddy2Id, type: 'red_flag', title: 'âš ï¸ Red flag: Meera Patel', body: 'Meera has missed 3 consecutive days. Stress at 4.5. Immediate check-in recommended.', read: false, channel: 'in_app', data: { student_email: 'meera@careerrai.com' } },
    { user_id: buddy2Id, type: 'weekly_digest', title: 'Weekly digest â€” 2 students', body: 'Meera: Needs intervention (38/100) â€¢ Arjun: Needs nudging (55/100)', read: false, channel: 'in_app', data: {} }
  );

  const validNotifs = notifRows.filter(n => n.user_id);
  if (validNotifs.length > 0) {
    const { error } = await supabase.from('notifications').insert(validNotifs);
    if (error) console.error('  âœ— Notifications error:', error.message);
    else console.log(`  âœ“ ${validNotifs.length} notifications created`);
  }

  console.log('\nâœ… Phase 2 seed complete!');
  console.log('\nStudent patterns seeded:');
  console.log('  Aarav   â€” consistent_improver  (mock 68â†’82, on track)');
  console.log('  Priya   â€” stressed_hardworker  (high stress, declining mocks, needs intervention)');
  console.log('  Rohan   â€” inconsistent_recovering (was dropping, now recovering)');
  console.log('  Meera   â€” declining_redflag    (good then disappeared last week)');
  console.log('  Arjun   â€” new_finding_rhythm   (slowly building up)');
}

main().catch(console.error);
