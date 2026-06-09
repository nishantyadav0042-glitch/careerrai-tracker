/**
 * Meeting utilities - Generate working meeting links
 * Uses Jitsi Meet (free, no credentials needed)
 * Works out of the box - just visit the link and meeting is created!
 */

/**
 * Generate a Jitsi Meet meeting link
 * Jitsi automatically creates rooms on-demand
 * No credentials or setup needed!
 *
 * @param studentName - Student's name for meeting room
 * @returns Object with meeting_id and join_url
 */
export function createMeetingLink(
  studentName: string,
  buddyName: string
): { meeting_id: string; join_url: string } {
  // Create unique room ID from student name + timestamp
  // Format: careerrai-studentname-uniqueid
  const timestamp = Date.now().toString(36);
  const roomName = `careerrai-${sanitizeRoomName(studentName)}-${timestamp}`;

  // Jitsi Meet public instance (free, no setup needed)
  const jitsiUrl = `https://meet.jitsi.com/${roomName}`;

  return {
    meeting_id: roomName,
    join_url: jitsiUrl,
  };
}

/**
 * Sanitize room name for Jitsi (remove special chars, lowercase)
 */
function sanitizeRoomName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 20);
}

/**
 * Generate meeting URL with display name
 * User will see buddy name when joining
 */
export function getMeetingJoinUrl(
  meetingLink: string,
  displayName: string
): string {
  // Jitsi supports URL params for display name
  const separator = meetingLink.includes('?') ? '&' : '?';
  return `${meetingLink}${separator}displayName=${encodeURIComponent(displayName)}`;
}

/**
 * Check if it's time for a video session
 */
export function shouldScheduleVideoSession(lastSessionDate: Date | null): boolean {
  if (!lastSessionDate) return true;

  const today = new Date();
  const daysSince = Math.floor(
    (today.getTime() - new Date(lastSessionDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysSince >= 10;
}

/**
 * Calculate days since last session
 */
export function daysSinceLastSession(lastSessionDate: Date | null): number {
  if (!lastSessionDate) return 0;

  const today = new Date();
  const lastDate = new Date(lastSessionDate);
  return Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
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
 * Session durations
 */
export const SESSION_DURATIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
];

/**
 * Format session time
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
