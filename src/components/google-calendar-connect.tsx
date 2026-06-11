'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, X } from 'lucide-react';

interface GoogleCalendarConnectProps {
  connected: boolean;
  /** Connected Gmail to show in the chip */
  googleEmail?: string | null;
  /** Where to land after the OAuth round trip, e.g. /buddy/settings */
  redirectPath: string;
  /** Allow hiding the CTA after connect (student home) */
  dismissible?: boolean;
}

/**
 * Orange CTA card when disconnected → compact green chip when connected.
 * Also surfaces the ?google_connect=success|failed toast after the
 * OAuth round trip.
 */
export function GoogleCalendarConnect({
  connected,
  googleEmail,
  redirectPath,
  dismissible = false,
}: GoogleCalendarConnectProps) {
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<'success' | 'failed' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_connect');
    if (result === 'success' || result === 'failed') {
      setToast(result);
      // strip the param so refreshes don't re-toast
      params.delete('google_connect');
      params.delete('reason');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  return (
    <>
      {toast && (
        <div
          className={
            'fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white ' +
            (toast === 'success' ? 'bg-emerald-600' : 'bg-red-600')
          }
        >
          {toast === 'success'
            ? '✓ Google Calendar connected!'
            : "Couldn't connect Google Calendar — try again"}
        </div>
      )}

      {connected ? (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-medium text-emerald-800 truncate">
            {googleEmail ? `Calendar: ${googleEmail}` : 'Google Calendar connected'}
          </span>
        </div>
      ) : dismissed ? null : (
        <div
          className="w-full rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #E8652D 0%, #d4541f 100%)' }}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Connect Google Calendar</p>
            <p className="text-xs text-white/80 mt-0.5">
              Get session invites &amp; reminders on your phone — takes 30 seconds
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={`/api/google/auth?redirect=${encodeURIComponent(redirectPath)}`}
              className="px-3.5 py-2.5 rounded-xl bg-white text-sm font-semibold transition-transform active:scale-95"
              style={{ color: '#E8652D', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
            >
              Connect
            </a>
            {dismissible && (
              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="p-2 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
