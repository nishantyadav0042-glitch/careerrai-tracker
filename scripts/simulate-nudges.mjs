#!/usr/bin/env node
// Replays the real production state of every reachable student, for 7 study
// days, through the decision rules — so "how many notifications per student
// per day?" becomes a DERIVED number instead of an estimate.
//
// The state distribution below was exported from production on 28 Jul 2026:
//   448 student-days · 64 reachable students × 7 days (21–27 Jul)
// Each row is [openedToday, loggedToday, daysSinceLastLog, count].
// daysSinceLastLog = 999 means "never logged".
//
// Re-export with the query in docs/EVIDENCE-POLICY.md to refresh.

const STATE = [
  [false, false, 999, 240], [true, false, 999, 43], [false, false, 2, 17],
  [true, true, 999, 17], [true, false, 1, 14], [false, false, 1, 13],
  [false, false, 4, 11], [false, false, 3, 11], [true, true, 1, 8],
  [false, false, 5, 8], [true, false, 2, 7], [false, false, 9, 6],
  [false, false, 8, 6], [true, false, 3, 5], [false, false, 10, 4],
  [true, true, 3, 4], [false, false, 13, 4], [false, false, 12, 4],
  [false, false, 11, 4], [false, false, 14, 3], [true, true, 2, 3],
  [false, false, 6, 3], [true, false, 5, 2], [true, true, 4, 2],
  [true, false, 7, 2], [false, false, 7, 1], [false, true, 1, 1],
  [true, false, 4, 1], [true, false, 6, 1], [true, false, 10, 1],
  [true, true, 6, 1], [true, true, 10, 1],
];

// Mirrors lib/notification-decision.ts. Kept as a copy on purpose: this script
// must be runnable without a TypeScript build step, and a divergence between
// the two is itself a finding worth surfacing loudly.
const POLICY = { maxPerDay: 4, fatigueThreshold: 6, probeEveryDays: 3 };

// Time windows. Their absence was the defect this simulation found: without
// them, start_the_day and inactivity evaluate the same condition and always
// fire together.
const WINDOW = {
  start_the_day: [7, 10],
  inactivity:    [14, 16],
  log_reminder:  [20, 22],
  recovery:      [9, 11],
};

function decide(intent, s, p = POLICY) {
  if (!s.reachable) return false;
  if (s.sentToday >= p.maxPerDay) return false;
  if (s.ignoredStreak >= p.fatigueThreshold && intent !== 'recovery') return false;
  const [from, to] = WINDOW[intent];
  if (s.hourIST < from || s.hourIST > to) return false;
  switch (intent) {
    case 'start_the_day': return !s.openedToday && !s.loggedToday;
    case 'log_reminder':  return !s.loggedToday && s.openedToday;
    case 'inactivity':    return !s.openedToday && !s.loggedToday;
    case 'recovery':
      if (s.openedToday || s.loggedToday) return false;
      if (s.daysSinceLastLog == null) return true;
      if (s.daysSinceLastLog < 2) return false;
      if (s.ignoredStreak >= p.fatigueThreshold && s.daysSinceLastLog % p.probeEveryDays !== 0) return false;
      return true;
  }
}

function nudgesFor(state, policy = POLICY) {
  const order = ['start_the_day', 'recovery', 'inactivity', 'log_reminder'];
  const out = [];
  const s = { ...state, sentToday: 0 };
  for (let hour = 0; hour < 24; hour++) {
    s.hourIST = hour;
    for (const i of order) {
      if (out.includes(i)) continue;
      if (decide(i, s, policy)) { out.push(i); s.sentToday += 1; }
    }
  }
  return out;
}

function run(policy, ignoredStreak = 0) {
  const hist = {};
  let total = 0, days = 0;
  const byIntent = {};
  for (const [opened, logged, dsl, n] of STATE) {
    const nudges = nudgesFor({
      openedToday: opened, loggedToday: logged,
      daysSinceLastLog: dsl === 999 ? null : dsl,
      ignoredStreak, reachable: true,
    }, policy);
    hist[nudges.length] = (hist[nudges.length] ?? 0) + n;
    for (const i of nudges) byIntent[i] = (byIntent[i] ?? 0) + n;
    total += nudges.length * n;
    days += n;
  }
  return { hist, mean: total / days, days, total, byIntent };
}

const r = run(POLICY);
console.log('# Simulated notification load — DERIVED from 448 real student-days\n');
console.log(`Student-days simulated: ${r.days}`);
console.log(`Total nudges sent:      ${r.total}`);
console.log(`MEAN PER STUDENT-DAY:   ${r.mean.toFixed(2)}\n`);

console.log('Distribution:');
for (const k of Object.keys(r.hist).sort()) {
  const pct = ((r.hist[k] / r.days) * 100).toFixed(1);
  console.log(`  ${k} nudges: ${String(r.hist[k]).padStart(4)} student-days  (${pct}%)`);
}

console.log('\nBy intent:');
for (const [i, n] of Object.entries(r.byIntent).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${i.padEnd(16)} ${n}`);
}

console.log('\n# Sensitivity to the daily cap (the value with no evidence behind it)');
for (const cap of [1, 2, 3, 4]) {
  const x = run({ ...POLICY, maxPerDay: cap });
  console.log(`  maxPerDay=${cap}: mean ${x.mean.toFixed(2)}/student-day, ${x.total} total`);
}

console.log('\n# Sensitivity to fatigue threshold, if every student were fatigued');
for (const f of [4, 6, 8]) {
  const x = run({ ...POLICY, fatigueThreshold: f }, f);
  console.log(`  threshold=${f}: mean ${x.mean.toFixed(2)}/student-day`);
}
