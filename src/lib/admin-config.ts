import { getServerConfig } from '@/lib/server-config';

// Admin phone(s) — kept OUT of source (public repo). Resolved from the
// ADMIN_PHONE_E164 env var, then the server_config 'ADMIN_PHONES_E164' row
// (comma-separated E.164 list), cached for the worker's lifetime. The founder's
// number always resolves to the admin panel on login without a role picker.
export async function isAdminPhoneE164(e164: string | null | undefined): Promise<boolean> {
  if (!e164) return false;
  const configured = await getServerConfig('ADMIN_PHONES_E164', 'ADMIN_PHONE_E164');
  if (!configured) return false;
  const admins = configured.split(',').map((s) => s.trim()).filter(Boolean);
  return admins.includes(e164);
}
