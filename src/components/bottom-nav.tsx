'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, Calendar, FileText, GraduationCap, User, Users, TrendingUp, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

function NavBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-stone-200 z-20">
      <div className="max-w-2xl mx-auto px-2 py-2 flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[60px]',
                isActive ? 'text-stone-900' : 'text-stone-400'
              )}
            >
              <Icon className={cn('w-5 h-5 transition-all', isActive && 'scale-110')} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const STUDENT_ITEMS: NavItem[] = [
  { href: '/student/home', icon: Home, label: 'Home' },
  { href: '/student/today', icon: Calendar, label: 'Today' },
  { href: '/student/reports', icon: FileText, label: 'Reports' },
  { href: '/student/exams', icon: GraduationCap, label: 'Exams' },
  { href: '/student/profile', icon: User, label: 'Profile' },
];

const BUDDY_ITEMS: NavItem[] = [
  { href: '/buddy/students', icon: Users, label: 'Students' },
  { href: '/buddy/trends', icon: TrendingUp, label: 'Trends' },
  { href: '/buddy/profile', icon: User, label: 'Profile' },
  { href: '/buddy/settings', icon: Settings, label: 'Settings' },
];

export function StudentBottomNav() {
  return <NavBar items={STUDENT_ITEMS} />;
}

export function BuddyBottomNav() {
  return <NavBar items={BUDDY_ITEMS} />;
}
