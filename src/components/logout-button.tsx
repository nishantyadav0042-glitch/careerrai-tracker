'use client';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </form>
  );
}
