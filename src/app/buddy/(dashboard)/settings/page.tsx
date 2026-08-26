'use client';

import { createClient } from '@/lib/supabase/client';
import { Video } from 'lucide-react';

export default function BuddySettingsPage() {
  const supabase = createClient();

  return (
    <div className="min-h-screen bg-stone-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-8">Settings</h1>

        <div className="bg-white rounded-lg border border-stone-200 p-6 space-y-6">
          {/* Video sessions — no Google connection needed. The schedule flow
              creates a ready-to-join video link and delivers it to the student
              in-app, so buddies never have to connect or verify a Google account. */}
          <div className="border-b border-stone-100 pb-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-2">Video sessions</h2>
            <div className="flex items-start gap-3 rounded-xl bg-teal-50 border border-teal-100 p-4">
              <Video className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <p className="text-sm text-stone-700">
                When you schedule a session, CareerRai creates a <span className="font-semibold">ready-to-join video link</span> instantly — no Google account, no setup. Both you and your student just tap to join, and the link also appears on your home page.
              </p>
            </div>
          </div>

          {/* Account Section */}
          <div>
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Account</h2>
            <button
              onClick={async () => {
                // This device only — see api/auth/logout for why the global default is wrong.
                await supabase.auth.signOut({ scope: 'local' });
                window.location.href = '/';
              }}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
