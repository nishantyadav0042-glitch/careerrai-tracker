'use client';

/**
 * RETIRED, 25 Aug 2026. Always null.
 *
 * This minted the /go hand-off link. Every payment surface now either opens
 * the modal in place or navigates to Razorpay in place, so no surface asks for
 * one — and /go's own measured result was 160 tokens minted against 7
 * consumed, a 96% drop-off before Razorpay was ever reached.
 *
 * Kept as a null-returning stub for one release rather than deleted, so any
 * caller still holding it collapses to the no-link branch instead of failing
 * to compile in a hotfix. The callers are being removed in the same change.
 */
export function useIosPayUrl(_dest: string): string | null {
  return null;
}
