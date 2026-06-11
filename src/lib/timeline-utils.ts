/**
 * Timeline Utilities for Student-Buddy Journey
 * Aggregates logs, tests, feedback, and milestones into chronological feed
 */

import { createClient } from '@/lib/supabase/client';

export type TimelineItemType = 'daily_log' | 'test_result' | 'voice_note' | 'feedback' | 'milestone' | 'streak';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  date: string;
  week: string; // For grouping
  icon: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  color: 'orange' | 'blue' | 'emerald' | 'purple' | 'amber';
}

/**
 * Get color for timeline item type
 */
export function getTimelineColor(type: TimelineItemType): 'orange' | 'blue' | 'emerald' | 'purple' | 'amber' {
  const colors = {
    daily_log: 'orange',
    test_result: 'blue',
    voice_note: 'purple',
    feedback: 'emerald',
    milestone: 'amber',
    streak: 'orange'
  };
  return colors[type] as 'orange' | 'blue' | 'emerald' | 'purple' | 'amber';
}

/**
 * Get icon for timeline item type
 */
export function getTimelineIcon(type: TimelineItemType): string {
  const icons = {
    daily_log: '📝',
    test_result: '📊',
    voice_note: '🎤',
    feedback: '💬',
    milestone: '🎉',
    streak: '🔥'
  };
  return icons[type];
}

/**
 * Get week label for date
 */
function getWeekLabel(date: string): string {
  const d = new Date(date);
  const today = new Date();
  const diffTime = today.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'This Week';
  if (diffDays <= 7) return 'Last Week';
  if (diffDays <= 14) return '2 Weeks Ago';
  if (diffDays <= 21) return '3 Weeks Ago';
  if (diffDays <= 30) return 'This Month';
  if (diffDays <= 60) return 'Last Month';
  return 'Earlier';
}

/**
 * Load student journey timeline
 */
export async function loadStudentTimeline(studentId: string): Promise<TimelineItem[]> {
  const supabase = createClient();
  const items: TimelineItem[] = [];

  try {
    // Get daily logs
    const { data: logs } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(90);

    if (logs) {
      logs.forEach((log) => {
        items.push({
          id: `log-${log.id}`,
          type: 'daily_log',
          date: log.report_date,
          week: getWeekLabel(log.report_date),
          icon: getTimelineIcon('daily_log'),
          title: `Studied ${log.study_duration.toFixed(1)}h`,
          description: (log.topics_covered || []).join(', ') || 'General study',
          metadata: log,
          color: getTimelineColor('daily_log')
        });
      });
    }

    // Get test results
    const { data: tests } = await supabase
      .from('test_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(30);

    if (tests) {
      tests.forEach((test) => {
        items.push({
          id: `test-${test.id}`,
          type: 'test_result',
          date: test.created_at.split('T')[0],
          week: getWeekLabel(test.created_at),
          icon: getTimelineIcon('test_result'),
          title: `Mock Test: ${test.score}/100`,
          description: `${test.percentile.toFixed(1)}th percentile`,
          metadata: test,
          color: getTimelineColor('test_result')
        });
      });
    }

    // Get voice notes
    const { data: voiceNotes } = await supabase
      .from('feedback')
      .select('*')
      .eq('student_id', studentId)
      .eq('feedback_type', 'voice_note')
      .not('voice_note_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);

    if (voiceNotes) {
      voiceNotes.forEach((note) => {
        items.push({
          id: `voice-${note.id}`,
          type: 'voice_note',
          date: note.created_at.split('T')[0],
          week: getWeekLabel(note.created_at),
          icon: getTimelineIcon('voice_note'),
          title: 'Voice Message from Buddy',
          description: 'Tap to listen',
          metadata: note,
          color: getTimelineColor('voice_note')
        });
      });
    }

    // Get feedback
    const { data: feedback } = await supabase
      .from('feedback')
      .select('*')
      .eq('student_id', studentId)
      .neq('feedback_type', 'voice_note')
      .order('created_at', { ascending: false })
      .limit(30);

    if (feedback) {
      feedback.forEach((fb) => {
        items.push({
          id: `fb-${fb.id}`,
          type: 'feedback',
          date: fb.created_at.split('T')[0],
          week: getWeekLabel(fb.created_at),
          icon: getTimelineIcon('feedback'),
          title: 'Buddy Feedback',
          description: fb.feedback_text?.substring(0, 50) + '...' || 'Message from buddy',
          metadata: fb,
          color: getTimelineColor('feedback')
        });
      });
    }

    // Get streak milestones
    const { data: streakData } = await supabase
      .from('streak_data')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (streakData) {
      // Day 7 milestone
      if (streakData.milestone_sent_7 && streakData.updated_at) {
        items.push({
          id: 'milestone-7',
          type: 'milestone',
          date: streakData.updated_at.split('T')[0],
          week: getWeekLabel(streakData.updated_at),
          icon: getTimelineIcon('milestone'),
          title: '7-Day Streak!',
          description: 'You reached Day 7!',
          color: getTimelineColor('milestone')
        });
      }
      // Day 21 milestone
      if (streakData.milestone_sent_21 && streakData.updated_at) {
        items.push({
          id: 'milestone-21',
          type: 'milestone',
          date: streakData.updated_at.split('T')[0],
          week: getWeekLabel(streakData.updated_at),
          icon: getTimelineIcon('milestone'),
          title: '21-Day Streak!',
          description: '3 weeks of consistency!',
          color: getTimelineColor('milestone')
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return items;
  } catch (error) {
    console.error('Error loading timeline:', error);
    return [];
  }
}

/**
 * Group timeline items by week
 */
export function groupTimelineByWeek(items: TimelineItem[]): Map<string, TimelineItem[]> {
  const grouped = new Map<string, TimelineItem[]>();

  items.forEach((item) => {
    if (!grouped.has(item.week)) {
      grouped.set(item.week, []);
    }
    grouped.get(item.week)!.push(item);
  });

  return grouped;
}
