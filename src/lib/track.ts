// Thin, safe wrapper over the Meta Pixel (fbq). No-ops whenever the pixel isn't
// loaded — env unset, blocked by an ad-blocker, or during SSR — so callers can
// fire events unconditionally and analytics can never break the app.
type TrackParams = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackMeta(event: string, params?: TrackParams): void {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', event, params ?? {});
    }
  } catch {
    /* analytics must never throw into product code */
  }
}
