'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, TrendingUp, MessageCircle, MoreHorizontal, User, Settings, Users, IndianRupee, X, Compass } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  href: string;
  icon?: LucideIcon;
  imgSrc?: string;
  label: string;
  badge?: number;
}

function NavBar({ items, moreItems }: { items: NavItem[]; moreItems?: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems?.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  // Chat's unread badge moved inside "More" along with it — surface it on
  // the More button itself so an unread buddy reply is never silently
  // invisible just because Chat isn't a primary tab anymore.
  const moreBadgeTotal = moreItems?.reduce((sum, item) => sum + (item.badge ?? 0), 0) ?? 0;

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
                  {item.imgSrc ? (
                    <Image src={item.imgSrc} alt={item.label} width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
                  ) : Icon ? (
                    <Icon className="w-4 h-4 shrink-0" />
                  ) : null}
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
                data-tour={item.href === '/student/buddy' ? 'buddy' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px]',
                  isActive ? 'text-stone-900' : 'text-stone-400'
                )}
              >
                <div className="relative">
                  {item.imgSrc ? (
                    <Image
                      src={item.imgSrc}
                      alt={item.label}
                      width={20}
                      height={20}
                      priority
                      className={cn('w-5 h-5 object-contain transition-all', isActive && 'scale-110')}
                    />
                  ) : Icon ? (
                    <Icon className={cn('w-5 h-5 transition-all', isActive && 'scale-110')} />
                  ) : null}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-stone-900 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
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
              <div className="relative">
                <MoreHorizontal className={cn('w-5 h-5 transition-all', (moreOpen || isMoreActive) && 'scale-110')} />
                {moreBadgeTotal > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-stone-900 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {moreBadgeTotal > 9 ? '9+' : moreBadgeTotal}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider">More</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// Today's Study and My CAT Plan are the two things a student actually
// needs every day — what to do now, and where they stand. Everything else
// (mocks, analysis, buddy, chat) is real but secondary, so it moved to
// More rather than competing for the same visual weight in the primary bar.
// Home + My Buddy are the two primary tabs now. The old "My CAT Plan" tab
// duplicated the home screen, so it moved into More; its middle slot goes to
// My Buddy — mocks are the backbone of CAT, and the Buddy is the backbone of
// mocks, so the mentor gets primary billing.
const STUDENT_MAIN: NavItem[] = [
  { href: '/student/tracker', icon: Home, label: 'Home' },
  { href: '/student/buddy', icon: Users, label: 'My Buddy' },
];

// Mocks folded into Analysis (one "how am I doing" panel with two tabs),
// Chat folded into Buddy (one "everything with my mentor" panel), History
// and Settings folded into Profile (sub-sections there, not their own
// top-level destinations). Three real screens instead of seven.
const STUDENT_MORE: NavItem[] = [
  { href: '/student/analysis', icon: TrendingUp, label: 'Analysis' },
  { href: '/student/blueprint', icon: Compass, label: 'My CAT Plan' },
  { href: '/student/profile', icon: User, label: 'Profile' },
];

const BUDDY_MAIN: NavItem[] = [
  { href: '/buddy/home', icon: Home, label: 'Home' },
  { href: '/buddy/students', icon: Users, label: 'Students' },
  { href: '/buddy/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/buddy/trends', icon: TrendingUp, label: 'Trends' },
  { href: '/buddy/earnings', icon: IndianRupee, label: 'Earnings' },
];

const BUDDY_MORE: NavItem[] = [
  { href: '/buddy/profile', icon: User, label: 'Profile' },
  { href: '/buddy/settings', icon: Settings, label: 'Settings' },
];

function withBadge(items: NavItem[], label: string, unread: number): NavItem[] {
  if (!unread) return items;
  return items.map((it) => (it.label === label ? { ...it, badge: unread } : it));
}

export function StudentBottomNav({ chatUnread = 0 }: { chatUnread?: number }) {
  // Chat lives inside the Buddy panel — badge the primary My Buddy tab so an
  // unread mentor reply is visible without opening More.
  return <NavBar items={withBadge(STUDENT_MAIN, 'My Buddy', chatUnread)} moreItems={STUDENT_MORE} />;
}

export function BuddyBottomNav({ chatUnread = 0 }: { chatUnread?: number }) {
  return <NavBar items={withBadge(BUDDY_MAIN, 'Chat', chatUnread)} moreItems={BUDDY_MORE} />;
}
