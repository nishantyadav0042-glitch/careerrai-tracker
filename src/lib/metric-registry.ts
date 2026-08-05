// ── THE metric registry ─────────────────────────────────────────────────────
//
// Every number this product shows a human must appear here exactly once, with
// the one definition that produces it. Not documentation — an executable
// contract, checked by metric-registry.test.ts and by the nightly integrity
// endpoint.
//
// This exists because of what a single audit found in one afternoon:
//
//   · The launch dashboard's push "open rate" read notifications.read_at, a
//     column nothing has ever written (0 of 17,153 rows). It showed 0% forever.
//   · "Active today" and "Students who got in" were byte-identical
//     computations under two labels, so the login funnel could never show a
//     gap however badly login was failing.
//   · The OTP panel filtered on otp_send_events.created_at — a column that does
//     not exist (it is sent_at) — and counted distinct `phone`, NULL in all 423
//     rows. The whole panel rendered confident zeros.
//   · The analytics page pulled events with no ORDER BY and hit a row cap, so
//     it charted the OLDEST 506 of 18,000+ events and reported "0 opens" on
//     days with 421 of them.
//   · Two routes read the streak from profiles.current_streak (0 for all 249
//     students) instead of streak_data, so every AI mentor draft told the
//     mentor their student had a 0-day streak.
//
// Five wrong numbers, five different root causes, one shared property: nothing
// in the system could tell the difference between "this metric is zero" and
// "this metric is broken". That is what the registry fixes.

export type MetricSource = 'student_events' | 'notifications' | 'daily_reports'
  | 'profiles' | 'streak_data' | 'otp_send_events' | 'student_submissions'
  | 'submission_votes' | 'client_errors' | 'student_payments';

export interface MetricDef {
  /** Stable id. Never reused for a different meaning. */
  id: string;
  /** What a human should believe when they read this number. */
  means: string;
  /** The table the truth lives in. */
  source: MetricSource;
  /** The exact column(s) that must be non-null for the metric to be real. */
  requires: string[];
  /** Where it is computed. Exactly one place. */
  owner: string;
  /** Where it is displayed. */
  surfaces: string[];
  /** Known-empty and why, so an empty value is never mistaken for a break. */
  knownEmpty?: string;
}

export const METRICS: MetricDef[] = [
  {
    id: 'dau',
    means: "Distinct real students who fired an app_open. NOT 'any event' — /admin/analytics used that and the two dashboards disagreed on 2 of 8 days.",
    source: 'student_events',
    requires: ['user_id', 'event', 'created_at'],
    owner: 'api/admin/launch-metrics',
    surfaces: [
      '/admin/launch · Active today',
      '/admin/launch · Students who got in',
      '/admin/analytics · opened vs logged',
    ],
  },
  {
    id: 'push_sent',
    means: 'Notifications handed to the push service. NOT delivery.',
    source: 'notifications',
    requires: ['pushed_at'],
    owner: 'api/admin/launch-metrics',
    surfaces: ['/admin/launch · Sent'],
  },
  {
    id: 'push_delivered',
    means: 'Pushes that reached the device: received_at OR clicked_at. A tap proves delivery — 22 of 43 taps had no received_at, so received_at alone both under-counts delivery and makes the tap rate incoherent (numerator not a subset of denominator).',
    source: 'notifications',
    requires: ['received_at', 'clicked_at'],
    owner: 'api/admin/launch-metrics',
    surfaces: ['/admin/launch · Reached the phone'],
  },
  {
    id: 'push_tapped',
    means: 'Pushes tapped. The only real engagement signal web push gives us.',
    source: 'notifications',
    requires: ['clicked_at'],
    owner: 'api/admin/launch-metrics',
    surfaces: ['/admin/launch · Tapped'],
  },
  {
    id: 'logs_today',
    means: 'Distinct students who filed a daily log for the current study day',
    source: 'daily_reports',
    requires: ['student_id', 'report_date'],
    owner: 'api/admin/launch-metrics',
    surfaces: ['/admin/launch · Logged study', '/admin/analytics · opened vs logged'],
  },
  {
    id: 'live_streak',
    means: "A student's streak RIGHT NOW — 0 if broken. Never the stored value.",
    source: 'streak_data',
    requires: ['current_streak', 'last_log_date'],
    owner: 'lib/streak-utils.liveStreak',
    surfaces: ['student home', 'admin lists', 'mentor drafts'],
  },
  {
    id: 'otp_sends',
    means: 'OTP send attempts in the last 24h, phone and email paths combined',
    source: 'otp_send_events',
    requires: ['sent_at'],
    owner: 'api/admin/launch-metrics',
    surfaces: ['/admin/launch · OTP sends'],
  },
  {
    id: 'crash_free_pct',
    means: 'Share of active students with zero client errors in 24h',
    source: 'client_errors',
    requires: ['student_id', 'created_at'],
    owner: 'api/admin/launch-metrics',
    surfaces: ['/admin/launch · Crash-free students'],
  },
];

// ── Columns known to be empty, and the reason ───────────────────────────────
//
// The dead_columns() detector flags every 100%-NULL column. Most are real
// defects. These are the ones we have looked at and accepted, each with the
// reason it is empty. Anything the detector finds that is NOT on this list is
// an unreviewed surprise and fails the integrity check.
export const ACCEPTED_EMPTY_COLUMNS: Record<string, string> = {
  'notifications.read_at': 'Dead. Superseded by clicked_at (SW beacon). No consumer left.',
  'notifications.emailed_at': 'Email notification channel never shipped.',
  'profiles.subscription_plan': 'No student has paid yet — expected empty.',
  'profiles.subscription_renews_at': 'No student has paid yet — expected empty.',
  'profiles.premium_since': 'No student has paid yet — expected empty.',
  'profiles.current_streak': 'Streak lives in streak_data. This column is vestigial.',
  'profiles.last_log_date': 'Streak lives in streak_data. This column is vestigial.',
  'profiles.agreed_monthly_payout': 'Mentor payouts not yet running.',
  'otp_send_events.phone': 'Phone path records the send inside claim_otp_send_slot; email path writes email.',
  'daily_reports.day_outcome': 'Shipped 27 Jul — fills from the next log onward.',
  'daily_reports.quant_score': 'Mock scores moved to mock_debriefs. Legacy column.',
  'daily_reports.verbal_score': 'Mock scores moved to mock_debriefs. Legacy column.',
  'daily_reports.logic_score': 'Mock scores moved to mock_debriefs. Legacy column.',
  'daily_reports.total_accuracy': 'Mock scores moved to mock_debriefs. Legacy column.',
  'daily_reports.mock_name': 'Mock scores moved to mock_debriefs. Legacy column.',
  'student_crm.call_feedback': 'Mirrors profiles.call_feedback, which has never held a value.',
  'student_submissions.published_at': 'Set on promotion to featured; nothing promoted yet.',
  'student_submissions.reviewed_at': 'Manual review path not yet exercised.',
  'student_submissions.reviewed_by': 'Manual review path not yet exercised.',
  'student_submissions.featured_on': 'Set on promotion to featured; nothing promoted yet.',
  'student_submissions.image_path': 'Photo submissions not yet used.',
};

/** Every metric id must be unique — a duplicate id is two truths under one name. */
export function duplicateMetricIds(): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const m of METRICS) {
    if (seen.has(m.id)) dupes.push(m.id);
    seen.add(m.id);
  }
  return dupes;
}

/** Every metric must be computed in exactly one place. */
export function metricsWithMultipleOwners(): string[] {
  const byId = new Map<string, Set<string>>();
  for (const m of METRICS) {
    if (!byId.has(m.id)) byId.set(m.id, new Set());
    byId.get(m.id)!.add(m.owner);
  }
  return [...byId.entries()].filter(([, owners]) => owners.size > 1).map(([id]) => id);
}
