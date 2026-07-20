import { redirect } from 'next/navigation';

// The CAT Readiness Test was retired (founder decision, 20 Jul 2026 — Riya v9
// decision register #6). Old ad/WhatsApp links still point here, so this stays
// as a redirect into the real funnel instead of a 404.
export default function CatReadinessRetired() {
  redirect('/start');
}
