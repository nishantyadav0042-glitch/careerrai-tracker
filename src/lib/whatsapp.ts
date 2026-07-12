// Support WhatsApp click-to-chat link. Prefers a dedicated support number
// (NEXT_PUBLIC_SUPPORT_WHATSAPP) and falls back to the existing contact number
// (NEXT_PUBLIC_DEMO_WHATSAPP). Returns null when none is configured, so callers
// can hide the entry point rather than render a dead link. Number may be stored
// with or without '+'/spaces — wa.me wants digits only (country code included).
export function supportWhatsappUrl(message: string): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || process.env.NEXT_PUBLIC_DEMO_WHATSAPP || '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
