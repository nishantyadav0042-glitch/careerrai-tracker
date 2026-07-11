import { redirect } from 'next/navigation';

// Retired (founder: one leads platform only — the readiness quiz no longer
// produces leads). Everything lives at /admin/leads now: students + buddies,
// tap-through profiles, Excel export.
export default function CatLeadsPage() {
  redirect('/admin/leads');
}
