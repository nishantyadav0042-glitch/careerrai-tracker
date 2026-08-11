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
