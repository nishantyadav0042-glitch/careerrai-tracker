'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { InstallButton } from '@/components/install/install-button';
import { OpenInBrowser } from '@/components/open-in-browser';
import { detectNativeShell } from '@/lib/install/detect';

// Inside the App Store / Play Store build this page must never pitch an
// install, and must never say "no app store needed" — that is non-App-Store
// distribution messaging inside an App-Store-distributed app (guideline
// 2.3.10). detectNativeShell() is the store-build marker; treat it as
// installed, exactly like a standalone launch.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    detectNativeShell() ||
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

// Pure install landing — the Meta ad link, not /start. One thing on this
// page: install the app. No name/phone form, no login, nothing else to
// abandon. The reasoning: a browser tab a student never installs is a dead
// end for re-engagement the moment they close it — no notification channel
// exists without either a PWA install (required for push on iOS) or a
// verified profile. This page secures the install first; signup, which
// creates the profile push needs, is one quiet tap away after — never a
// precondition to just trying the app.
export default function GetAppPage() {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    if (isStandalone()) { setInstalled(true); return; }
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('cr-installed', onInstalled);
    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('cr-installed', onInstalled);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white flex flex-col items-center justify-center px-4 py-10">
      {/* Instagram/Facebook in-app browser can't install PWAs — prompt the
          user to open in real Safari/Chrome first. */}
      <OpenInBrowser />
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6"><Logo /></div>

        {installed ? (
          <div className="space-y-4">
            <p className="text-3xl">✅</p>
            <h1 className="text-xl font-bold text-stone-900">CareerRai is installed</h1>
            <p className="text-sm text-stone-600">
              Open it from your home screen anytime — or continue here to build your free study plan.
            </p>
            <Link
              href="/start"
              className="block w-full rounded-xl bg-stone-900 py-3.5 text-sm font-bold text-white active:scale-[0.99] transition-all"
            >
              Build my free study plan →
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 leading-tight">Install CareerRai</h1>
              <p className="mt-2 text-sm text-stone-600">
                Your CAT prep app. Just ~3 MB — installs in seconds, no app store needed.
              </p>
            </div>
            <InstallButton variant="banner" />
            <p className="text-xs text-stone-400">
              Already installed?{' '}
              <Link href="/login" className="font-semibold text-stone-600 underline">Open the app →</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
