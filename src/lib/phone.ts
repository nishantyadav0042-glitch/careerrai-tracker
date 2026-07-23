// Indian mobile normalization. We store and compare in E.164 (+91XXXXXXXXXX)
// everywhere — allowlist, profiles.phone, and OTP calls — so formats never drift.

const INDIA_MOBILE = /^[6-9]\d{9}$/;

/** Returns +91XXXXXXXXXX, or null if not a valid 10-digit Indian mobile. */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let ten = input.replace(/\D/g, '');
  if (ten.length === 12 && ten.startsWith('91')) ten = ten.slice(2);
  else if (ten.length === 11 && ten.startsWith('0')) ten = ten.slice(1);
  if (!INDIA_MOBILE.test(ten)) return null;
  return '+91' + ten;
}

/** MSG91 wants the number without the leading '+' (e.g. 9198XXXXXXXX). */
export function toMsg91Mobile(e164: string): string {
  return e164.replace(/^\+/, '');
}

/**
 * All the stored formats a given number might appear as in profiles.phone —
 * '+91XXXXXXXXXX' (canonical), '91XXXXXXXXXX', and the bare 'XXXXXXXXXX'.
 * Used to look a student up by phone WITHOUT depending on one exact format,
 * so an inbound webhook (Expedify call outcomes) never misses a match just
 * because the stored number drifted from E.164. Accepts any input the
 * normalizer understands; returns [] if it isn't a valid Indian mobile.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  const e164 = normalizeIndianPhone(input);
  if (!e164) return [];
  const ten = e164.slice(3); // strip '+91'
  return [e164, '91' + ten, ten];
}
