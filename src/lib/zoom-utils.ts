/**
 * Zoom utilities for creating and managing video session links
 * Uses Zoom API to create actual meetings with real meeting IDs
 */

/**
 * Create a real Zoom meeting
 * Calls Zoom API via server endpoint
 *
 * @param studentName - Student's name for meeting topic
 * @param duration - Meeting duration in minutes
 * @returns Object with zoom_meeting_id and zoom_link
 */
export async function createZoomMeeting(
  studentName: string,
  duration: number = 30
): Promise<{ meeting_id: string; join_url: string }> {
  try {
    const response = await fetch('/api/zoom/create-meeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: `Study Session with ${studentName}`,
        duration: duration,
        type: 2, // Scheduled meeting
      }),
    });

    if (!response.ok) {
      throw new Error(`Zoom API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      meeting_id: data.id,
      join_url: data.join_url,
    };
  } catch (error) {
    console.error('Failed to create Zoom meeting:', error);
    throw new Error('Failed to create Zoom meeting. Please try again.');
  }
}

/**
 * Get Zoom meeting details
 */
export async function getZoomMeeting(
  meetingId: string
): Promise<{ id: string; join_url: string; start_url: string }> {
  try {
    const response = await fetch(`/api/zoom/meeting/${meetingId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch meeting: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch Zoom meeting:', error);
    throw error;
  }
}

/**
 * Check if it's time for a video session (10+ days since last session)
 */
export function shouldScheduleVideoSession(lastSessionDate: Date | null): boolean {
  if (!lastSessionDate) {
    return true;
  }

  const today = new Date();
  const daysSince = Math.floor(
    (today.getTime() - new Date(lastSessionDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysSince >= 10;
}

/**
 * Calculate days since last video session
 */
export function daysSinceLastSession(lastSessionDate: Date | null): number {
  if (!lastSessionDate) return 0;

  const today = new Date();
  const lastDate = new Date(lastSessionDate);
  return Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Suggest session frequency based on CAT exam countdown
 */
export function suggestSessionFrequency(daysUntilExam: number): number {
  if (daysUntilExam <= 30) return 3;
  if (daysUntilExam <= 60) return 5;
  if (daysUntilExam <= 90) return 7;
  return 10;
}

/**
 * Session topics
 */
export const SESSION_TOPICS = [
  'General Check-in',
  'Weak Area Discussion',
  'Mock Review',
  'Strategy Planning',
  'Doubt Solving',
  'Stress Management',
  'Performance Analysis',
  'Study Plan Adjustment',
];

/**
 * Session duration options
 */
export const SESSION_DURATIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
];

/**
 * Format time for display
 */
export function formatSessionTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }) + ' ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
