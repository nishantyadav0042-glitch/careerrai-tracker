// The student's real dream college for copy, e.g. "IIM Calcutta" — the first
// one they picked at signup. Falls back to a generic phrase for anyone who
// didn't choose one, so it always reads naturally mid-sentence ("toward IIM
// Calcutta" / "toward your dream college").
//
// Lives in its own file (not notification-os) because it's needed by CLIENT
// components too (the admin lists), and notification-os imports server-only
// modules (push/admin → net/tls) that can't be bundled for the browser.
export function dreamCollegeLabel(dreamColleges: unknown): string {
  if (Array.isArray(dreamColleges) && typeof dreamColleges[0] === 'string' && dreamColleges[0].trim()) {
    return dreamColleges[0].trim();
  }
  return 'your dream college';
}
