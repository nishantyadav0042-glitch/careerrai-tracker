'use client';

// META ESCAPE — the single highest-ROI install lever.
//
// Our paid traffic lands from Instagram/Facebook ads INSIDE Meta's in-app
// browser (a webview). There, the app can install NOTHING and can't even
// receive web push — it is an install/retention dead end. So the moment we
// detect a Meta webview, we offer one tap to continue in the real browser
// (Chrome on Android, Safari on iOS), carrying the FULL url + UTM/ref params
// so attribution and the funnel continue seamlessly. Sign-up then happens in a
// real browser where install + reminders actually work.
//
// Guardrails (never trap a user): the one-tap escape is primary, a manual
// "⋯ → Open in browser" fallback is shown (for iOS 16 / Instagram's intent
// quirk), and a quiet "Continue here" hatch lets anyone who can't switch still
// sign up in the webview rather than bounce.

import { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, Download, MoreHorizontal, X } from 'lucide-react';
import { track } from '@/lib/journey';
import { getEnvironment } from '@/lib/install/detect';
import { escapeInAppBrowser, currentUrl } from '@/lib/install/actions';
import { supportWhatsappUrl } from '@/lib/whatsapp';

const DISMISS_KEY = 'cr_meta_escape_dismissed';

export function MetaEscape() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
  const [app, setApp] = useState<string>('this app');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection is client-only */
    const env = getEnvironment();
    if (env.isStandalone) return; // already installed — nothing to do
    const meta = env.inApp === 'facebook' || env.inApp === 'instagram' || env.inApp === 'messenger';
    if (!meta) return;
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch { /* ignore */ }
    setPlatform(env.platform === 'android' ? 'android' : env.platform === 'ios' || env.platform === 'ipados' ? 'ios' : 'other');
    setApp(env.inApp === 'instagram' ? 'Instagram' : env.inApp === 'messenger' ? 'Messenger' : 'Facebook');
    setShow(true);
    track('meta_escape_shown', { inApp: env.inApp, platform: env.platform });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!show) return null;

  const targetBrowser = platform === 'ios' ? 'Safari' : 'Chrome';
  const menuGlyph = platform === 'ios' ? '⋯' : '⋮';

  function openInBrowser() {
    const env = getEnvironment();
    track('meta_escape_click', { inApp: env.inApp, platform: env.platform, url: currentUrl() });
    escapeInAppBrowser(env); // carries origin + path + query (UTM/ref preserved)
  }

  function continueHere() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    track('meta_escape_dismissed', { platform });
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 shadow-lg shadow-stone-900/15">
          <ArrowUpRight className="h-8 w-8 text-white" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Open in {targetBrowser} to<br />get the full app
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            You&apos;re inside {app}&apos;s browser — reminders and one-tap install don&apos;t work here. One tap opens {targetBrowser} on the same page, and everything picks up right where you are.
          </p>
        </div>

        <div className="space-y-2.5 rounded-2xl border border-stone-100 bg-stone-50 p-3.5">
          <Perk icon={<Bell className="h-[18px] w-[18px] text-orange-600" />} text="Daily reminders that actually reach you" />
          <Perk icon={<Download className="h-[18px] w-[18px] text-orange-600" />} text={`Add to Home Screen — ~3 MB, opens like a real app`} />
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={openInBrowser}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-bold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
          >
            Open in {targetBrowser} &rarr;
          </button>

          {/* Manual fallback — for iOS 16 (x-safari fails) and Instagram's
              intent quirk, where the one-tap jump may not fire. */}
          <div className="flex items-start gap-2 rounded-xl border border-stone-100 px-3 py-2.5 text-left">
            <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
            <p className="text-xs leading-relaxed text-stone-500">
              Didn&apos;t switch? Tap the <b className="text-stone-700">{menuGlyph} menu</b> {platform === 'ios' ? 'top-right' : 'top-right'} and choose <b className="text-stone-700">&ldquo;Open in {targetBrowser}&rdquo;</b>.
            </p>
          </div>

          <button
            type="button"
            onClick={continueHere}
            className="mx-auto flex items-center gap-1 py-1 text-xs font-medium text-stone-400 hover:text-stone-600"
          >
            <X className="h-3.5 w-3.5" /> Continue here for now
          </button>
        </div>

        <MetaEscapeHelp />
      </div>
    </div>
  );
}

function Perk({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0">{icon}</span>
      <p className="text-sm text-stone-700">{text}</p>
    </div>
  );
}

function MetaEscapeHelp() {
  const wa = supportWhatsappUrl('Hi, I need help opening the CareerRai app in my browser.');
  if (!wa) return null;
  return (
    <a
      href={wa}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-auto text-xs font-medium text-stone-400 underline underline-offset-2 hover:text-stone-600"
    >
      Facing issues? WhatsApp us
    </a>
  );
}
