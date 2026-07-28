#!/usr/bin/env node
// ── Repository coverage audit ───────────────────────────────────────────────
//
// Answers ONE question, for every source file: can this file affect business
// data, and if so has it been verified?
//
// This exists because the previous audit's most important sentence was
// "coverage is nowhere near 100%". A hand-written coverage matrix is an
// opinion. This is a reproducible artefact: re-run it after any merge and the
// numbers move on their own.
//
// It classifies rather than judges. A file is RED because nothing has verified
// it, not because it is known to be broken. Unknown is the finding.
//
//   node scripts/coverage-audit.mjs            → markdown report
//   node scripts/coverage-audit.mjs --json     → machine-readable
//   node scripts/coverage-audit.mjs --red      → only unverified business files

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// ── What makes a file "business data affecting" ─────────────────────────────
const SIGNALS = {
  mutatesDb:      /\.(insert|update|upsert|delete)\s*\(|\.rpc\s*\(/,
  readsDb:        /\.from\s*\(\s*['"`]/,
  emitsEvent:     /\btrack\s*\(\s*['"`]/,
  computesMetric: /\.filter\s*\([^)]*\)\s*\.length|new Set\(|\.reduce\s*\(|count:\s*'exact'/,
  displaysNumber: /toLocaleString|\{[a-zA-Z_.?]*(count|total|pct|Pct|rate|Rate|sum|Sum|streak|days)\b/,
  payments:       /razorpay|payment|subscription|coupon|scholarship|refund|amountPaise/i,
  notifications:  /push|notification|notif_prefs|sendPushToUser/i,
  auth:           /getAuthUser|signInWithPassword|verify-otp|requireAdmin|session/i,
  streaks:        /streak|shield|momentum/i,
  logs:           /daily_report|log_daily|LoggingModal|useLogging/i,
  studyPlan:      /routine|study_plan|topic_coverage|mastery|blueprint/i,
  growth:         /install|onboarding|signup|funnel|attribution|install_source/i,
  community:      /community|submission|daily_pick|challenge/i,
  mentor:         /buddy|mentor|session_request|video_session/i,
};

// Files that cannot affect business data. Excluded WITH a reason, per the brief.
const EXCLUSIONS = [
  [/\.test\.ts$/,                 'Test file — asserts behaviour, ships nothing'],
  [/\/ui\//,                      'Design-system primitive — no data access'],
  [/layout\.tsx$/,                'Route shell — verified separately if it queries'],
  [/loading\.tsx$|error\.tsx$|not-found\.tsx$/, 'Route boundary — renders no business number'],
  [/mascots|logo|route-skeleton|auto-refresh/, 'Presentational only'],
  [/lib\/utils\.ts$/,             'Generic string/class helpers'],
];

// Feature ownership, by path. Order matters — first match wins.
const FEATURES = [
  [/api\/cron\//,                  'Scheduled jobs'],
  [/api\/admin\/|app\/admin\//,    'Admin & dashboards'],
  [/api\/auth\/|app\/login|app\/set-password|proxy\.ts/, 'Auth & OTP'],
  [/payments|razorpay|coupons|scholarships|refunds|pricing|plans/, 'Payments & subscriptions'],
  [/push|notification|companion|mission-queue/, 'Notifications'],
  [/logging|daily-report|DailyTracker|useLogging/, 'Study log'],
  [/routine|mastery|topic|blueprint|prep-model|evidence|coverage/, 'Study plan & evidence'],
  [/streak|shield|momentum/,       'Streaks'],
  [/community|submission|challenge|daily-pick/, 'Peer learning'],
  [/buddy|mentor|chat|voice-note|session/, 'Mentorship'],
  [/install|onboarding|start|welcome|funnel|journey|events\/track/, 'Growth & onboarding'],
  [/student\//,                    'Student app'],
  [/lib\//,                        'Shared domain'],
];

// ── Verified surfaces ───────────────────────────────────────────────────────
// A file counts as VERIFIED only if something independently proves its numbers:
// a unit test over its logic, or an explicit reconstruction from raw rows
// recorded in the audit trail. Nothing here is verified by assertion.
const VERIFIED = new Map([
  ['src/lib/study-day.ts',        'unit tests (13) — 3am IST boundary'],
  ['src/lib/streak-utils.ts',     'unit tests (23) — liveStreak, momentum'],
  ['src/lib/evidence.ts',         'unit tests (20) — mergeStatus, rungs'],
  ['src/lib/prep-model.ts',       'unit tests (12) — drift guard'],
  ['src/lib/buddy-match.ts',      'unit tests (16) — ranking, match copy'],
  ['src/lib/pricing.ts',          'unit tests (20) — discount arithmetic'],
  ['src/lib/metric-registry.ts',  'unit tests (12) — registry invariants'],
  ['src/app/api/admin/launch-metrics/route.ts', 'reconstructed from raw rows; 4 defects fixed'],
  ['src/app/admin/analytics/page.tsx',          'reconstructed; ORDER BY + DAU definition fixed'],
  ['src/lib/notification-health.ts',            'reconstructed; 3 defects fixed'],
  ['src/app/admin/launch/page.tsx',             'consumes verified launch-metrics only'],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function classify(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const src = readFileSync(file, 'utf8');

  const excluded = EXCLUSIONS.find(([re]) => re.test(rel));
  const signals = Object.fromEntries(
    Object.entries(SIGNALS).map(([k, re]) => [k, re.test(src)])
  );

  // Business-data-affecting = touches persistence, emits telemetry, computes a
  // number, or displays one.
  const affectsBusinessData =
    signals.mutatesDb || signals.readsDb || signals.emitsEvent ||
    signals.computesMetric || signals.displaysNumber;

  const feature = (FEATURES.find(([re]) => re.test(rel)) ?? [null, 'Unclassified'])[1];
  const verified = VERIFIED.get(rel) ?? null;

  let status;
  if (excluded && !signals.mutatesDb) status = 'EXCLUDED';
  else if (!affectsBusinessData) status = 'EXCLUDED';
  else if (verified) status = 'GREEN';
  else if (signals.emitsEvent || signals.readsDb) status = 'RED';
  else status = 'YELLOW';

  return {
    file: rel, feature, status,
    reason: excluded ? excluded[1] : verified ?? 'No independent verification',
    signals: Object.entries(signals).filter(([, v]) => v).map(([k]) => k),
    lines: src.split('\n').length,
  };
}

const rows = walk(SRC).map(classify);
const business = rows.filter((r) => r.status !== 'EXCLUDED');
const byStatus = (s) => business.filter((r) => r.status === s);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, generatedFrom: 'scripts/coverage-audit.mjs' }, null, 2));
  process.exit(0);
}

if (process.argv.includes('--red')) {
  for (const r of byStatus('RED').sort((a, b) => a.feature.localeCompare(b.feature))) {
    console.log(`${r.feature.padEnd(26)} ${r.file}`);
  }
  process.exit(0);
}

const pct = (n) => `${Math.round((n / business.length) * 100)}%`;

console.log('# Repository coverage report\n');
console.log(`Generated by \`scripts/coverage-audit.mjs\` — re-runnable, not hand-maintained.\n`);
console.log(`| | Files | Share |`);
console.log(`|---|---|---|`);
console.log(`| Scanned | ${rows.length} | |`);
console.log(`| **Affect business data** | **${business.length}** | |`);
console.log(`| 🟢 Verified | ${byStatus('GREEN').length} | ${pct(byStatus('GREEN').length)} |`);
console.log(`| 🟡 Partial (computes/displays, no persistence) | ${byStatus('YELLOW').length} | ${pct(byStatus('YELLOW').length)} |`);
console.log(`| 🔴 Unverified | ${byStatus('RED').length} | ${pct(byStatus('RED').length)} |`);
console.log(`| ⚪ Excluded (with reason) | ${rows.length - business.length} | |`);

console.log('\n## Heat map by feature\n');
console.log('| Feature | 🟢 | 🟡 | 🔴 | Total | Status |');
console.log('|---|---|---|---|---|---|');
const features = [...new Set(business.map((r) => r.feature))].sort();
for (const f of features) {
  const inF = business.filter((r) => r.feature === f);
  const g = inF.filter((r) => r.status === 'GREEN').length;
  const y = inF.filter((r) => r.status === 'YELLOW').length;
  const rd = inF.filter((r) => r.status === 'RED').length;
  const status = g === inF.length ? '🟢 verified'
    : g > 0 ? '🟡 partial'
    : '🔴 UNVERIFIED';
  console.log(`| ${f} | ${g} | ${y} | ${rd} | ${inF.length} | ${status} |`);
}

console.log('\n## Files that mutate the database and are unverified\n');
console.log('The highest-risk set: these write business data with nothing proving they write it correctly.\n');
const writers = byStatus('RED').filter((r) => r.signals.includes('mutatesDb'));
console.log(`**${writers.length} files.**\n`);
console.log('| File | Feature | Also touches |');
console.log('|---|---|---|');
for (const r of writers.sort((a, b) => a.feature.localeCompare(b.feature)).slice(0, 40)) {
  const tags = r.signals.filter((s) => !['readsDb', 'mutatesDb'].includes(s)).join(', ') || '—';
  console.log(`| \`${r.file}\` | ${r.feature} | ${tags} |`);
}
if (writers.length > 40) console.log(`\n…and ${writers.length - 40} more (\`--json\` for the full list).`);
