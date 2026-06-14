'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, TrendingUp, MessageCircle, Mic, MoreHorizontal, FileText, GraduationCap, User, Settings, Users, IndianRupee, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  /** When > 0, shows a small badge on this nav item. */
  badge?: number;
}

function NavBar({ items, moreItems }: { items: NavItem[]; moreItems?: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems?.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));

  return (
    <>
      {/* More drawer */}
      {moreOpen && moreItems && (
        <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-16 right-2 bg-white rounded-2xl shadow-xl border border-stone-200 py-2 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100 mb-1">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest">More</span>
              <button onClick={() => setMoreOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors',
                    isActive ? 'text-stone-900 font-semibold' : 'text-stone-600'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom bar */}
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
                  'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px]',
                  isActive ? 'text-stone-900' : 'text-stone-400'
                )}
              >
                <div className="relative">
                  <Icon className={cn('w-5 h-5 transition-all', isActive && 'scale-110')} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
              </Link>
            );
          })}

          {moreItems && (
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px]',
                (moreOpen || isMoreActive) ? 'text-stone-900' : 'text-stone-400'
              )}
            >
              <MoreHorizontal className={cn('w-5 h-5 transition-all', (moreOpen || isMoreActive) && 'scale-110')} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">More</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const STUDENT_MAIN: NavItem[] = [
  { href: '/student/tracker', icon: Home, label: 'Home' },
  { href: '/student/analysis', icon: TrendingUp, label: 'Analysis' },
  { href: '/student/buddy', icon: Mic, label: 'Buddy' },
  { href: '/student/chat', icon: MessageCircle, label: 'Chat' },
];

const STUDENT_MORE: NavItem[] = [
  { href: '/student/reports', icon: FileText, label: 'History' },
  { href: '/student/exams', icon: GraduationCap, label: 'Exams' },
  { href: '/student/profile', icon: User, label: 'Profile' },
  { href: '/student/settings', icon: Settings, label: 'Settings' },
];

const BUDDY_MAIN: NavItem[] = [
  { href: '/buddy/students', icon: Users, label: 'Students' },
  { href: '/buddy/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/buddy/trends', icon: TrendingUp, label: 'Trends' },
  { href: '/buddy/earnings', icon: IndianRupee, label: 'Earnings' },
];

const BUDDY_MORE: NavItem[] = [
  { href: '/buddy/profile', icon: User, label: 'Profile' },
  { href: '/buddy/settings', icon: Settings, label: 'Settings' },
];

/** Apply an unread badge to the Chat nav item. */
function withChatBadge(items: NavItem[], unread: number): NavItem[] {
  if (!unread) return items;
  return items.map((it) => (it.label === 'Chat' ? { ...it, badge: unread } : it));
}

export function StudentBottomNav({ chatUnread = 0 }: { chatUnread?: number }) {
  return <NavBar items={withChatBadge(STUDENT_MAIN, chatUnread)} moreItems={STUDENT_MORE} />;
}

export function BuddyBottomNav({ chatUnread = 0 }: { chatUnread?: number }) {
  return <NavBar items={withChatBadge(BUDDY_MAIN, chatUnread)} moreItems={BUDDY_MORE} />;
}
