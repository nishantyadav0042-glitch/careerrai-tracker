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
