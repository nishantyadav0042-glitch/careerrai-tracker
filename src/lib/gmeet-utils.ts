/**
 * Google Meet utilities for generating and managing video session links
 * Uses Google Meet's "Meet" function to generate new meeting links
 */

/**
 * Generate a unique Google Meet link
 * Format: https://meet.google.com/xxx-xxxx-xxx
 *
 * @returns Random Google Meet link
 */
export function generateGoogleMeetLink(): string {
  // Generate random segments matching Google Meet URL format
  const segment1 = generateRandomString(3);
  const segment2 = generateRandomString(4);
  const segment3 = generateRandomString(3);

  return `https://meet.google.com/${segment1}-${segment2}-${segment3}`;
}

/**
 * Generate random alphanumeric string
 */
function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if it's time for a video session (10+ days since last session)
 */
export function shouldScheduleVideoSession(lastSessionDate: Date | null): boolean {
  if (!lastSessionDate) {
    // No previous session - first session recommended
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
  // More sessions as exam approaches
  if (daysUntilExam <= 30) return 3; // 3 days apart in final month
  if (daysUntilExam <= 60) return 5; // 5 days apart
  if (daysUntilExam <= 90) return 7; // Weekly
  return 10; // Every 10 days
}

/**
 * Get recommended session topics based on student progress
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
 * Get session duration recommendations
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

/**
 * Get session status color for UI
 */
export function getSessionStatusColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-50 border-blue-200';
    case 'active':
      return 'bg-green-50 border-green-200';
    case 'completed':
      return 'bg-stone-50 border-stone-200';
    case 'cancelled':
      return 'bg-red-50 border-red-200';
    default:
      return 'bg-white border-stone-200';
  }
}

/**
 * Get session status badge color
 */
export function getSessionStatusBadgeColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800';
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'completed':
      return 'bg-stone-100 text-stone-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-stone-100 text-stone-800';
  }
}
