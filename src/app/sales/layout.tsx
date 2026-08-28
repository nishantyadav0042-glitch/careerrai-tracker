import Link from 'next/link';
import { requireSales } from '@/lib/admin-auth';
import { Logo } from '@/components/logo';

// Sales workspace — for the sales role (and admins, who can see everything).
// Priya logs in and lands here; a student/buddy is bounced to their own home.
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  // Canonical gate (21 Aug): a role we could not READ now throws instead of
  // bouncing a signed-in rep to the login screen.
  await requireSales();

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-3 pb-20 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <Logo />
          <form action="/api/auth/logout" method="POST">
            <button className="text-xs font-semibold text-stone-400 hover:text-stone-700">Log out</button>
          </form>
        </div>
        <nav className="mb-3 flex gap-1.5">
          <Link href="/sales" className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-stone-800 ring-1 ring-stone-200">Calls</Link>
          <Link href="/sales/leads" className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:text-stone-800">My leads</Link>
          <Link href="/sales/followups" className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:text-stone-800">Follow-ups</Link>
          <Link href="/sales/earnings" className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:text-stone-800">Earnings</Link>
          <Link href="/sales/summary" className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:text-stone-800">My summary</Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
