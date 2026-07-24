'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Home, PhoneCall, Users, TrendingUp, IndianRupee, Wrench, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

// The one admin navigation (founder, 14 July): the panel had grown into a
// pile of tabs + quick-link buttons + orphan pages. Six destinations, same
// bar on every admin screen, built to stay sane as lead volume grows:
//   Today    — morning action center (what needs me RIGHT NOW)
//   Leads    — the CRM (every signup, categorized, exportable)
//   Students — active students, buddies, matching
//   Growth   — funnel analytics
//   Analytics— real student behaviour from tracked events (opens, funnels, DNA)
//   Money    — payments · coupons · scholarships
//   System   — broadcast, allowlist, imports, health tools
const ITEMS: { href: string; label: string; icon: typeof Home; match: string[] }[] = [
  { href: '/admin', label: 'Today', icon: Home, match: ['/admin'] },
  { href: '/admin/leads', label: 'Leads', icon: PhoneCall, match: ['/admin/leads', '/admin/cat-leads'] },
  { href: '/admin/students', label: 'Students', icon: Users, match: ['/admin/students'] },
  { href: '/admin/growth', label: 'Growth', icon: TrendingUp, match: ['/admin/growth'] },
  { href: '/admin/analytics', label: 'Analytics', icon: Activity, match: ['/admin/analytics'] },
  { href: '/admin/payments', label: 'Money', icon: IndianRupee, match: ['/admin/payments', '/admin/coupons', '/admin/scholarships'] },
  { href: '/admin/system', label: 'System', icon: Wrench, match: ['/admin/system', '/admin/notification-health', '/admin/perf', '/admin/sales-queue', '/admin/brain'] },
];

export function AdminNav() {
  const pathname = usePathname() ?? '';
  return (
    <div className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex items-center justify-between pt-2.5">
          <Logo size="sm" />
          <LogoutButton />
        </div>
        <nav className="-mx-1 flex gap-0.5 overflow-x-auto">
          {ITEMS.map(({ href, label, icon: Icon, match }) => {
            const active = match.some((m) => (m === '/admin' ? pathname === m : pathname.startsWith(m)));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
                  active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800'
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
