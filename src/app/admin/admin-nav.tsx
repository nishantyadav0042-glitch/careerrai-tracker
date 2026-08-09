'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import {
  Home, Users, PhoneCall, HeartHandshake, CalendarRange, ScanLine,
  BellRing, IndianRupee, Activity, Sparkles, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WORKSPACES, workspaceForPath } from '@/lib/admin-workspaces';

// The admin navigation, driven entirely by lib/admin-workspaces.
//
// The previous version listed seven destinations by hand while thirty-two
// pages existed, and its own header comment — written on 14 July — said the
// panel "had grown into a pile of tabs + quick-link buttons + orphan pages".
// By 9 Aug it had grown back: eleven pages nothing linked to, four screens all
// calling themselves the morning dashboard, two funnels, three health views.
//
// Hand-maintaining a menu is what allows that. This nav cannot drift, because
// the registry it reads is the same one a guard test walks: a page with no
// workspace fails the build, and a route in the menu with no page fails too.

const ICONS: Record<string, typeof Home> = {
  Home, Users, PhoneCall, HeartHandshake, CalendarRange, ScanLine,
  BellRing, IndianRupee, Activity, Sparkles, Wrench,
};

export function AdminNav() {
  const pathname = usePathname() ?? '';
  const active = workspaceForPath(pathname);

  return (
    <div className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex items-center justify-between pt-2.5">
          <Logo size="sm" />
          <LogoutButton />
        </div>
        <nav className="-mx-1 flex gap-0.5 overflow-x-auto">
          {WORKSPACES.map((w) => {
            const Icon = ICONS[w.icon] ?? Home;
            const on = active?.id === w.id;
            return (
              <Link
                key={w.id}
                href={w.href}
                title={w.purpose}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
                  on
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-500 hover:text-stone-800',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {w.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
