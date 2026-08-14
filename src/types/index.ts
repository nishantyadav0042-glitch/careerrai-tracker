export type Role = 'student' | 'buddy' | 'admin';

export interface NotifPrefs {
  daily_reminder: boolean;
  reminder_time: string;
  email: boolean;
  push: boolean;
}

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  email: string | null;
  exam_target: string | null;
  buddy_id: string | null;
  created_at: string;
  avatar_seed: string | null;
  notif_prefs: NotifPrefs;
  push_subscription: unknown | null;
}

export interface DailyReport {
  id: string;
  student_id: string;
  report_date: string;
  study_duration: number;
  topics_covered: string[];
  quality_focus: number;
  difficulty: number;
  mock_taken: boolean;
  mock_name: string | null;
  quant_score: number | null;
  verbal_score: number | null;
  logic_score: number | null;
  total_accuracy: number | null;
  confidence: number;
  stress: number;
  sleep_quality: number;
  nutrition_exercise: boolean;
  overall_energy: number;
  notes: string | null;
  mood_emoji: string | null;
  emotional_chips: string[];
  created_at: string;
  updated_at: string;
}

export interface BuddyFeedback {
  id: string;
  buddy_id: string;
  student_id: string;
  feedback_date: string;
  feedback_text: string | null;
  feedback_type: 'buddy_feedback' | 'student_response' | 'text';
  rating: number;
  next_steps: string[];
  period_covered: 'weekly' | 'adhoc' | 'monthly';
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  channel: string;
  created_at: string;
  // Notification-OS measurement (nullable — rows predating it stay null)
  reason?: string | null;
  expected_action?: string | null;
  pushed_at?: string | null;
  emailed_at?: string | null;
  clicked_at?: string | null;
}

export interface AnalyticsSummary {
  avgStudy: number;
  totalStudy: number;
  totalMocks: number;
  avgMockScore: number;
  avgConfidence: number;
  avgStress: number;
  avgSleep: number;
  avgEnergy: number;
  daysSubmitted: number;
  period: number;
  studyTrend: 'up' | 'down' | 'stable';
  confidenceTrend: 'up' | 'down' | 'stable';
  stressTrend: 'up' | 'down' | 'stable';
  overallScore: number;
  band: 'On track' | 'Needs nudging' | 'Needs intervention';
  redFlags: string[];
}

export interface StreakData {
  id: string;
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  // Momentum Shields: missed days consume shields (streak untouched), then
  // decay the streak by 1/day. 21 consecutive logged days earn one back (max 3).
  shields: number;
  earn_run: number;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
  created_at: string;
  updated_at: string;
}

// ── SEVEN INTERFACES WERE DELETED HERE ON 14 AUG ────────────────────────────
//
// TestResult, VideoSession, StreakShield, DailyLrdiPuzzle, LrdiPuzzleAttempt,
// TodoItem, AnalyticsEvent. Every one had zero references outside this file —
// checked by word-boundary search across src, e2e and scripts.
//
// They split into two groups, and the difference matters more than the deletion:
//
// LIVE TABLE, DEAD TYPE — test_results, video_sessions, analytics_events. The
// app reads all three (video_sessions alone at 34 call sites) but nowhere
// imports the type; each caller re-declares the columns it happens to need
// inline. Deleting the interface changes nothing today, and is not a fix: the
// real defect is 34 hand-written shapes for one table, which is how a column
// rename becomes 34 silent `undefined`s. Worth a generated-types pass
// (supabase gen types) rather than resurrecting a hand-maintained mirror that
// was already out of date.
//
// NO APP CODE AT ALL — streak_shields, daily_lrdi_puzzles, lrdi_puzzle_attempts,
// todo_items. Migrations create these tables and nothing in the application
// reads or writes them. The TABLES ARE DELIBERATELY LEFT IN PLACE: dropping
// production tables is a founder decision, not a cleanup, and their migrations
// are history that must not be rewritten. Flagged in the audit report instead.
//
// Note streak_shields specifically: shields ARE a live product concept
// (momentumStreak models decay and shielding), but the live implementation
// keeps that state in streak_data, not in this table. One concept, one store.
