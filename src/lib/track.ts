// Thin, safe wrapper over the Meta Pixel (fbq). No-ops whenever the pixel isn't
// loaded — env unset, blocked by an ad-blocker, or during SSR — so callers can
// fire events unconditionally and analytics can never break the app.
type TrackParams = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// eventId lets the browser Pixel event and the server Conversions API event for
// the same action share an ID, so Meta counts it once (dedup) instead of twice.
export function trackMeta(event: string, params?: TrackParams, eventId?: string): void {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', event, params ?? {}, eventId ? { eventID: eventId } : undefined);
    }
  } catch {
    /* analytics must never throw into product code */
  }
}
