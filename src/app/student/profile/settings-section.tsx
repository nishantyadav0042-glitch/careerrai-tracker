'use client';

import { Video } from 'lucide-react';
import { LogoutButton } from '@/components/logout-button';
import { DeleteAccountButton } from '@/components/delete-account-button';

// Formerly its own page (/student/settings) — now the "Settings" tab
// inside the merged Profile panel. Sign-out lived on both the old Settings
// page AND the old Profile page; kept once, here.
export function SettingsSection() {
  return (
    <div className="space-y-6">
      {/* Sessions & reminders — students don't need to connect Google.
          The Meet link is delivered in-app (notification + dashboard), so we
          don't send students through Google's OAuth screen at all. */}
      <div>
        <h2 className="text-lg font-semibold text-stone-900 mb-2">Sessions &amp; reminders</h2>
        <div className="flex items-start gap-3 rounded-xl bg-teal-50 border border-teal-100 p-4">
          <Video className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
          <p className="text-sm text-stone-700">
            When your buddy books a 1:1, the <span className="font-semibold">Google Meet link appears right here in the app</span> — in your notifications and on your dashboard. Nothing to connect, nothing to set up.
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-stone-900 mb-3">Account</h2>
        <LogoutButton />
      </div>

      {/* Play's User Data policy requires the privacy policy to be reachable
          from INSIDE the app, not only from the store listing. */}
      <div className="border-t border-stone-200 pt-5">
        <h2 className="text-lg font-semibold text-stone-900 mb-3">Legal</h2>
        <div className="flex flex-col gap-2">
          <a href="/privacy" className="text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900">Privacy Policy</a>
          <a href="/terms" className="text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900">Terms of Service</a>
          <a href="/refunds" className="text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900">Refund &amp; Cancellation Policy</a>
          <a href="/contact" className="text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900">Contact us</a>
        </div>
      </div>

      {/* Store-required account deletion (Google Play + Apple 5.1.1(v)). */}
      <div className="border-t border-stone-200 pt-5">
        <h2 className="text-lg font-semibold text-stone-900 mb-2">Danger zone</h2>
        <DeleteAccountButton />
      </div>
    </div>
  );
}
