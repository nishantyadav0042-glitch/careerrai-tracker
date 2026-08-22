'use client';
import { LogOut } from 'lucide-react';
import { markLogoutIntent } from '@/lib/logout-intent';

export function LogoutButton() {
  return (
    // The mark is what stops SessionLossNotice from telling a student their
    // session "ended unexpectedly" one second after they chose to end it.
    <form
      action="/api/auth/logout"
      method="POST"
      onSubmit={() => markLogoutIntent(Date.now())}
    >
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </form>
  );
}
