// A real Web Push endpoint is always an https URL on a public hostname (FCM,
// Mozilla autopush, Apple, WNS). Reject anything else so a stored subscription
// can't later point the server's push POST at an internal/loopback host.
// Shared between /api/push/subscribe (logged-in) and verify-phone-otp (the
// pre-auth signup carrying a subscription collected before login) so the two
// paths can never diverge on what's accepted.
export function isValidPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string') return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':')) return false;                         // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;       // IPv4 literal
  return true;
}
