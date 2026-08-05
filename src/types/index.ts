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

export interface TestResult {
  id: string;
  student_id: string;
  test_type: string;
  test_name: string;
  attempt_date: string;
  score: number;
  percentile: number;
  breakdown: Record<string, unknown> | null;
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

export interface VideoSession {
  id: string;
  student_id: string;
  buddy_id: string;
  title?: string;
  description?: string;
  /** @deprecated Use google_meet_link instead */
  gmeet_link?: string | null;
  /** Real Google Meet link from Calendar API */
  google_meet_link?: string | null;
  /** Google Calendar event ID for this session */
  google_event_id?: string | null;
  session_status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  session_type: 'session' | 'review' | 'doubt_solving' | 'mock_review';
  duration_minutes: number;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_session_date?: string | null;
  days_since_last_session?: number | null;
  student_notified?: boolean;
  buddy_notified?: boolean;
  reminder_sent?: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// Daily Tracker Types
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

export interface StreakShield {
  id: string;
  student_id: string;
  used_on: string | null;
  granted_by: string | null;
  reason: 'student_used' | 'buddy_granted';
  created_at: string;
}

export interface DailyLrdiPuzzle {
  id: string;
  puzzle_date: string;
  puzzle_type: 'seating' | 'blood_relation' | 'constraint' | 'arrangement' | 'logic';
  puzzle_content: Record<string, unknown>;
  difficulty: number;
  difficulty_description?: string;
  estimated_time_minutes: number;
  solution?: string;
  explanation?: string;
  created_at: string;
}

export interface LrdiPuzzleAttempt {
  id: string;
  student_id: string;
  puzzle_id: string;
  solved: boolean;
  time_taken_seconds?: number;
  accuracy?: number;
  submitted_at: string;
}

export interface TodoItem {
  id: string;
  student_id: string;
  title: string;
  description?: string;
  category: 'buddy_suggested' | 'student_custom' | 'daily_puzzle' | 'mock_review' | 'session';
  due_date?: string;
  due_time?: string;
  priority: number;
  completed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsEvent {
  id: string;
  student_id: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}
