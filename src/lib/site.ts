// Single source of truth for the app's public web address.
//
// Domain cutover (careerrai-daily.vercel.app → careerrai.in): every link we
// ever print — emails, WhatsApp templates, share texts, call-team guidance —
// comes from here, so the domain lives in exactly one place. Client-side code
// should keep using window.location.origin (domain-agnostic); this constant is
// for links generated OUTSIDE the page (emails, server templates) and display
// strings.
//
// NEXT_PUBLIC_SITE_URL (Vercel env) overrides the default, which lets a
// preview deployment or a future domain change flip this without a code edit.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://careerrai.in';

// The bare host for display in human-facing copy ("open careerrai.in in Chrome").
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
