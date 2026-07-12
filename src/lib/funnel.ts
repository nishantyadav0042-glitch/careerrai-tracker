// Client-side anonymous funnel tracking for the pre-signup /start wizard. Assigns
// a stable anon id (90-day cookie) so we can measure how many distinct visitors
// reach each onboarding screen — i.e. exactly where they drop off before signing
// up. Best-effort and non-blocking; never throws.
function getAnonId(): string {
  try {
    const m = document.cookie.match(/(?:^|; )cr_anon=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    document.cookie = `cr_anon=${id}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    return id;
  } catch {
    return 'anon';
  }
}

export function trackFunnel(step: string): void {
  try {
    if (typeof window === 'undefined') return;
    const anon = getAnonId();
    fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anon, step }),
      keepalive: true, // still sends if the page is navigating away
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}
