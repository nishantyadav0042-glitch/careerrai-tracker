'use client';

import { useState, useEffect } from 'react';
import { X, Share, Plus, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

type Platform = 'android' | 'ios' | 'other';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

// Compact inline banner (for login page and post-login nudge)
export function AddToHomeScreenBanner({ onDismiss }: { onDismiss?: () => void }) {
  const [platform, setPlatform] = useState<Platform>('other');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // Already installed
    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      const handler = (e: BeforeInstallPromptEvent) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    } else if (p === 'ios') {
      setVisible(true);
    }
    // On desktop/other, don't show
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function dismiss() {
    setVisible(false);
    onDismiss?.();
  }

  if (!visible || installed) return null;

  if (showIOSSteps) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Add to Home Screen</span>
          <button onClick={dismiss} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ol className="space-y-2 text-sm text-stone-700">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">1</span>
            <span>Tap the <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" /> <strong>Share</strong> button at the bottom of Safari</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">2</span>
            <span>Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus className="w-3.5 h-3.5 inline mx-0.5" /></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">3</span>
            <span>Tap <strong>Add</strong> — CareerRai will appear as an app on your home screen.</span>
          </li>
        </ol>
        <p className="text-[11px] text-stone-400">iOS requires Safari for this to work. Open this page in Safari if you&apos;re using Chrome.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
      <Smartphone className="w-5 h-5 text-orange-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-stone-900">Add to Home Screen</p>
        <p className="text-xs text-stone-500">One-tap open, like a real app.</p>
      </div>
      {platform === 'android' && deferredPrompt ? (
        <button
          onClick={install}
          className="text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
        >
          Install
        </button>
      ) : platform === 'ios' ? (
        <button
          onClick={() => setShowIOSSteps(true)}
          className="text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
        >
          How?
        </button>
      ) : null}
      <button onClick={dismiss} className="text-stone-400 hover:text-stone-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
