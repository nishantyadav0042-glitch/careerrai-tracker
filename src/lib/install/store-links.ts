// Where the real, native apps live.
//
// Kept as constants in one file because a store URL is the kind of thing that
// gets pasted inline in three components and then only two of them get fixed
// when the listing moves.

/**
 * CareerRai on the App Store (founder, 10 Aug 2026).
 *
 * `/in/` is deliberate — every student is in India, and the regional path skips
 * Apple's storefront-picker interstitial. A tap on this from ANY iOS context,
 * including Instagram and WhatsApp webviews, opens the App Store app directly:
 * iOS treats apps.apple.com as a universal link. That is why iPhone install is
 * now one tap instead of the three-tap Share → Add to Home Screen route we had
 * to use before the app existed.
 */
export const APP_STORE_URL = 'https://apps.apple.com/in/app/careerrai/id6792102977';

/** The numeric Apple ID, for analytics and any future StoreKit/smart-banner use. */
export const APP_STORE_ID = '6792102977';

/**
 * CareerRai's Android package (`android/twa-manifest.json`,
 * `public/.well-known/assetlinks.json`). Same universal-link reasoning as
 * APP_STORE_URL above: `https://play.google.com/...` is what Android hands to
 * the Play Store app from any context, including in-app webviews — a bare
 * `market://` URI would not survive a WhatsApp/Instagram browser.
 */
export const PLAY_STORE_PACKAGE = 'com.careerrai.app';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;

/**
 * Where a "rate us" tap should send each platform. iOS supports a real
 * deep-link straight to the write-review sheet (`?action=write-review`,
 * Apple's documented mechanism). Android/Play has no equivalent web deep-link
 * without the native Play Core In-App Review API — this app has no native
 * bridge (see src/lib/install/detect.ts; the shells are plain webviews) — so
 * the best available is the listing's review tab (`showAllReviews=true`),
 * one tap from "rate" instead of zero. Anything else (desktop, unknown UA)
 * has no sensible store to send someone to.
 */
export function writeReviewUrl(platform: 'ios' | 'android'): string {
  return platform === 'ios'
    ? `${APP_STORE_URL}?action=write-review`
    : `${PLAY_STORE_URL}&showAllReviews=true`;
}
