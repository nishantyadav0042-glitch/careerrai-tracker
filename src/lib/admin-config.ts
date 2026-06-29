import { normalizeIndianPhone } from '@/lib/phone';

// Admin phone(s). The founder's number always resolves to the admin panel on
// login — no role picker, no env var required (ADMIN_PHONE_E164 still works as
// an override/addition if set). Kept here as the single source of truth so the
// login UI and the verify route agree.
const ADMIN_PHONES_E164 = ['+917015269714'];

/** True if this E.164 number is a CareerRai admin. */
export function isAdminPhoneE164(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const env = process.env.ADMIN_PHONE_E164;
  return (!!env && e164 === env) || ADMIN_PHONES_E164.includes(e164);
}

/** True if a raw (10-digit / +91) phone is an admin number, after normalizing. */
export function isAdminPhoneRaw(raw: string | null | undefined): boolean {
  return isAdminPhoneE164(normalizeIndianPhone(raw ?? ''));
}
