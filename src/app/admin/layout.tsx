import { requireAdmin } from '@/lib/admin-auth';
import { AdminNav } from './admin-nav';
import { CommandPalette } from '@/components/admin/command-palette';

// One shell for every admin screen: auth gate + the shared nav bar. Pages
// keep their own role checks (defense in depth for anything hit directly),
// but no admin page renders its own Logo/Logout header anymore.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Through the canonical gate (21 Aug). This block used to be its own copy,
  // and its copy had the bug: it read `data` and ignored `error`, so one
  // flaky profiles read logged a real admin out of the ENTIRE section.
  await requireAdmin();

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav />
      <CommandPalette />
      {children}
    </div>
  );
}
