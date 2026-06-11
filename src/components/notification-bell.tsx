'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { Bell, X, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';
import { cn } from '@/lib/utils';

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createClient();

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  }, [supabase, userId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-stone-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-stone-700" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 bg-white border border-stone-200 rounded-2xl shadow-xl z-40 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-stone-200">
              <span className="font-semibold text-stone-900 text-sm">Notifications</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-stone-500 hover:text-stone-900">
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)}>
                  <X className="w-4 h-4 text-stone-500" />
                </button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
              {notifications.length === 0 && (
                <div className="p-6 text-center text-sm text-stone-500">You&apos;re all caught up.</div>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    'p-4 cursor-pointer hover:bg-stone-50 transition-colors',
                    !n.read && 'bg-orange-50/50'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <div className="w-2 h-2 rounded-full bg-orange-600 mt-1.5 flex-shrink-0" />}
                    <div className={cn(!n.read ? 'ml-0' : 'ml-4')}>
                      <div className="text-sm font-semibold text-stone-900">{n.title}</div>
                      <div className="text-xs text-stone-600 mt-0.5">{n.body}</div>
                      <div className="text-[10px] text-stone-400 mt-1">
                        {new Date(n.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {n.read && <CheckCircle2 className="w-3.5 h-3.5 text-stone-300 ml-auto flex-shrink-0 mt-0.5" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
