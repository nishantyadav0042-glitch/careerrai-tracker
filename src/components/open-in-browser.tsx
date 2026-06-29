'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Copy, Check, MoreVertical, X, Globe } from 'lucide-react';

// Instagram / Facebook / other apps open links inside their OWN in-app browser
// (a WebView). That WebView CANNOT install a PWA — on iOS "Add to Home Screen"
// is absent, and on Android the install prompt never fires. So the very first
// step of the install funnel for ad traffic is to get the user OUT of the in-app
// browser and into real Safari/Chrome. Detection is by user-agent.
function detectInAppBrowser(ua: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Line\/|Snapchat|Twitter|MicroMessenger/i.test(ua);
}
type OS = 'ios' | 'android' | 'other';
function detectOS(ua: string): OS {
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

const DISMISS_KEY = 'cr_iab_escape_dismissed';

/**
 * Full-screen "open in your real browser" prompt shown ONLY when the page is
 * loaded inside an in-app browser (Instagram/Facebook/etc.). It's dismissible —
 * users can still sign up inside the in-app browser (forms work there); the
 * prompt exists to push the install, which is only possible in Safari/Chrome.
 */
export function OpenInBrowser() {
  const [show, setShow] = useState(false);
  const [os, setOs] = useState<OS>('other');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- UA detection must run client-side after mount */
    if (typeof navigator === 'undefined') return;
    if (isStandalone()) return; // already installed/launched as app
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    const ua = navigator.userAgent;
    if (!detectInAppBrowser(ua)) return; // real browser → let the normal install banner handle it
    setOs(detectOS(ua));
    setShow(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function openInChrome() {
    // Android intent:// forces the link to open in Chrome, breaking out of the
    // in-app WebView. Falls back to a plain navigation if Chrome isn't present.
    const { host, pathname, search } = window.location;
    const target = `${host}${pathname}${search}`;
    window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-gradient-to-b from-orange-50 to-white overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-md mx-auto w-full text-center">
        <button onClick={dismiss} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full text-stone-400 hover:bg-stone-100">
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-200">
          <ExternalLink className="w-8 h-8 text-white" />
        </div>

        <h1 className="mt-6 text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Open in your browser
        </h1>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          To install CareerRai as an app on your phone, open this page in {os === 'ios' ? 'Safari' : 'Chrome'}.
          The in-app browser you’re in right now can’t install apps.
        </p>

        {/* Android: one-tap escape to Chrome */}
        {os === 'android' && (
          <div className="mt-7 w-full space-y-3">
            <button
              onClick={openInChrome}
              className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 text-sm shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
            >
              <Globe className="w-4 h-4" /> Open in Chrome
            </button>
            <p className="text-xs text-stone-500">
              If that doesn’t work, tap the <MoreVertical className="w-3.5 h-3.5 inline" /> menu at the top-right and choose
              <span className="font-semibold"> “Open in external browser”</span>.
            </p>
            <button onClick={copyLink} className="w-full rounded-xl border border-stone-300 bg-white text-stone-700 font-medium py-3 text-sm flex items-center justify-center gap-2">
              {copied ? <><Check className="w-4 h-4 text-teal-600" /> Link copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
            </button>
          </div>
        )}

        {/* iOS: no programmatic escape exists — coach the menu, offer copy-link */}
        {os === 'ios' && (
          <div className="mt-7 w-full space-y-4 text-left">
            <div className="rounded-xl bg-white border border-stone-200 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">1</span>
                <span className="text-sm text-stone-700">Tap the <MoreVertical className="w-4 h-4 inline mx-0.5 text-stone-500" /> menu at the top-right of this screen.</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">2</span>
                <span className="text-sm text-stone-700">Tap <span className="font-semibold">“Open in External Browser”</span> (or “Open in Safari”).</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">3</span>
                <span className="text-sm text-stone-700">In Safari, tap <span className="font-semibold">Share → Add to Home Screen</span>.</span>
              </div>
            </div>
            <button onClick={copyLink} className="w-full rounded-xl border border-stone-300 bg-white text-stone-700 font-medium py-3 text-sm flex items-center justify-center gap-2">
              {copied ? <><Check className="w-4 h-4 text-teal-600" /> Link copied — paste it in Safari</> : <><Copy className="w-4 h-4" /> Copy link for Safari</>}
            </button>
          </div>
        )}

        {os === 'other' && (
          <button onClick={copyLink} className="mt-7 w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 text-sm flex items-center justify-center gap-2">
            {copied ? <><Check className="w-4 h-4" /> Link copied</> : <><Copy className="w-4 h-4" /> Copy link to open in your browser</>}
          </button>
        )}

        <button onClick={dismiss} className="mt-5 text-xs text-stone-400 hover:text-stone-600">
          Continue here for now
        </button>
      </div>
    </div>
  );
}
