'use client';
import { useEffect, useState } from 'react';
import { Download, Share, Plus, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture beforeinstallprompt at module load — Chrome can fire it BEFORE React
// mounts, so a listener added inside a component effect often misses it (the
// reason an install button looks "dead" on Android). We stash it globally and
// notify any mounted button via a custom event.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('cr-installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('cr-installed'));
  });
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

/**
 * Always-visible "Install the app" button (hidden only when already installed).
 * Android/Chrome → fires the native install prompt. iOS / browsers without a
 * native prompt → opens step-by-step Add-to-Home-Screen instructions.
 */
export function InstallAppButton() {
  // Start hidden to avoid showing to users who already installed; reveal after
  // the client check. (Most login-page visitors aren't installed, so it shows.)
  const [hidden, setHidden] = useState(true);
  const [ios, setIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    if (isStandalone()) { setHidden(true); return; }
    setIos(isIOS());
    setHidden(false);
    const onInstalled = () => setHidden(true);
    window.addEventListener('cr-installed', onInstalled);
    return () => window.removeEventListener('cr-installed', onInstalled);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      return;
    }
    // No native prompt available (iOS always; Android before criteria/event) →
    // coach the manual install instead of doing nothing.
    setShowSteps(true);
  }

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="group w-full flex items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-orange-300 active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow">
          <Download className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">Install the CareerRai app</p>
          <p className="mt-0.5 text-xs text-stone-500">Add it to your home screen for one-tap access — works offline-friendly.</p>
        </div>
        <Smartphone className="w-4 h-4 shrink-0 text-orange-600" />
      </button>

      {showSteps && (
        <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowSteps(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-stone-900">Install CareerRai</h3>
              <button onClick={() => setShowSteps(false)} aria-label="Close" className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {ios ? (
              <ol className="space-y-2.5 text-sm text-stone-700">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">1</span>
                  <span>Tap the <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" /> <strong>Share</strong> button at the bottom of Safari.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">2</span>
                  <span>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> <Plus className="w-3.5 h-3.5 inline mx-0.5" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">3</span>
                  <span>Tap <strong>Add</strong> — CareerRai appears on your home screen like a real app.</span>
                </li>
                <li className="text-[11px] text-stone-400 pl-7">On iPhone this only works in <strong>Safari</strong>. If you&apos;re in Chrome, open this page in Safari first.</li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-stone-700">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">1</span>
                  <span>Open your browser menu (the <strong>⋮</strong> at the top-right).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">2</span>
                  <span>Tap <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home screen&rdquo;</strong>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">3</span>
                  <span>Confirm — CareerRai installs like a normal app.</span>
                </li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}
