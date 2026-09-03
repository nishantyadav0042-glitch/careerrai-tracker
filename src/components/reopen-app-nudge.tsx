'use client';

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { track, detectDisplayMode } from '@/lib/journey';
import { useInstall } from '@/lib/install/use-install';

// ── THE ICON IS ALREADY ON THEIR PHONE — THEY JUST DIDN'T TAP IT ────────────
//
// 1 Sep, push-subscription-gap audit. The proactive push ask only fires in
// standalone mode (22 Jul, deliberate: browser-tab push subscriptions died at
// ~75% vs ~8% for installed-app ones — re-asking there is not this fix).
// Production: of active Android students whose most recent session was a
// plain browser tab, 56% had accepted a native install prompt at some point.
// The app IS on their home screen; WhatsApp — the main re-engagement channel
// (journey.ts) — always opens a browser tab regardless, so they land back in
// the unreliable context out of habit, not choice.
//
// This never touches push. It only tells an already-installed student, while
// they're in a browser tab, that the icon they already have is the door that
// actually works — so the existing, working standalone ask (34-38% conversion)
// gets a chance to run at all. `appInstalled` is the server truth (reached
// standalone at least once); `installed` is the client's live read via
// getInstalledRelatedApps(), which can see an install the server hasn't
// heard about yet on this device.
const SESSION_KEY = 'cr_reopen_nudge_shown';
function claimThisSession(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

export function ReopenAppNudge({ appInstalled = false }: { appInstalled?: boolean }) {
  const { env, installed, ready } = useInstall();
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    if (!ready) return;
    if (env.isStandalone) return;                 // already in the app — nothing to nudge
    if (detectDisplayMode() === 'ios_app') return; // the wrapper is its own home, not this banner's business
    if (!appInstalled && !installed) return;       // genuinely never installed — InstallJourney's job, not this one
    if (!claimThisSession()) return;
    setShow(true);
    track('reopen_nudge_shown', { platform: env.platform });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, env.isStandalone, env.platform, appInstalled, installed]);

  if (!show) return null;

  function dismiss() {
    track('reopen_nudge_dismissed', {});
    setShow(false);
  }

  return (
    <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 p-3">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-teal-900">
        You already have the CareerRai app — reminders and daily nudges only reach you there.
        Look for the <strong>CareerRai icon on your home screen</strong> and open it from there.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1 text-teal-500 hover:bg-teal-100 hover:text-teal-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
