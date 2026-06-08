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
  created_at: string;
  updated_at: string;
}

export interface BuddyFeedback {
  id: string;
  buddy_id: string;
  student_id: string;
  feedback_date: string;
  feedback_text: string | null;
  voice_note_url: string | null;
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
