'use client';

// THE in-app-browser screen — one component, both platforms, every app.
//
// Our paid traffic lands from Instagram/Facebook ads inside a webview, and a
// webview is an install/retention dead end: it can't install a PWA and can't
// receive web push. This is the screen that gets them out of it.
//
// It replaces TWO components that were doing the same job (10 Aug):
// `MetaEscape` in the root layout, and `OpenInBrowser` mounted separately on
// /get-app with its own private user-agent regex and its own intent:// builder.
// On /get-app an Instagram visitor got both, stacked. Detection now comes from
// the shared `getEnvironment()`, which already recognises eleven in-app
// browsers instead of each component keeping its own list.
//
// The platforms genuinely differ now, and that is the whole reason this screen
// changed:
//
//  · ANDROID — unchanged. There is no native app to send them to, so the only
//    route is still: escape the webview into Chrome, where the install prompt
//    can fire. One tap, with the manual "⋮ → Open in Chrome" fallback beneath
//    for Instagram's intent quirk.
//
//  · iPHONE — no escape at all any more. apps.apple.com is a universal link, so
//    the App Store opens straight out of the webview. Sending an iPhone to
//    Safari first, to then hunt Share → Add to Home Screen, is now strictly
//    more taps to a worse result, and it was also the LAST place in the product
//    still promising "Add to Home Screen — ~3 MB" to an iPhone.

import { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, Download, MoreHorizontal, X, Zap } from 'lucide-react';
import { track } from '@/lib/journey';
import { getEnvironment } from '@/lib/install/detect';
import { escapeInAppBrowser, currentUrl, openAppStore } from '@/lib/install/actions';
import { supportWhatsappUrl } from '@/lib/whatsapp';
import { AppStoreCard } from '@/components/install/app-store-card';

const DISMISS_KEY = 'cr_meta_escape_dismissed';

/** Human name for the app whose browser we are trapped inside. */
const APP_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
  whatsapp: 'WhatsApp', telegram: 'Telegram', twitter: 'X',
  linkedin: 'LinkedIn', line: 'LINE', snapchat: 'Snapchat',
  wechat: 'WeChat', pinterest: 'Pinterest',
};

export function InAppBrowserEscape() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
  const [app, setApp] = useState<string>('this app');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection is client-only */
    const env = getEnvironment();
    if (env.isStandalone || env.isNativeShell) return; // already in the app
    if (!env.inApp) return;                            // a real browser — nothing to escape
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch { /* ignore */ }
    setPlatform(env.platform === 'android' ? 'android' : env.platform === 'ios' || env.platform === 'ipados' ? 'ios' : 'other');
    setApp(APP_LABEL[env.inApp] ?? 'this app');
    setShow(true);
    // Event names keep the `meta_` prefix: they carry `inApp` in the payload and
    // renaming them would orphan the funnel history we already have.
    track('meta_escape_shown', { inApp: env.inApp, platform: env.platform });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!show) return null;

  const isIphone = platform === 'ios';

  function goToAppStore() {
    const env = getEnvironment();
    track('install_app_store', { platform: env.platform, browser: env.browser, inApp: env.inApp });
    openAppStore();
  }

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
          {isIphone ? <Zap className="h-8 w-8 text-white" /> : <ArrowUpRight className="h-8 w-8 text-white" />}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {isIphone ? <>Get the CareerRai app</> : <>Open in Chrome to<br />get the full app</>}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            {isIphone ? (
              <>You&apos;re inside {app}&apos;s browser, where reminders can&apos;t reach you. One tap opens the App Store — everything picks up right where you are.</>
            ) : (
              <>You&apos;re inside {app}&apos;s browser — reminders and one-tap install don&apos;t work here. One tap opens Chrome on the same page, and everything picks up right where you are.</>
            )}
          </p>
        </div>

        {isIphone ? (
          // The same card as everywhere else. One control, one action, one look.
          <AppStoreCard onInstall={goToAppStore} />
        ) : (
          <>
            <div className="space-y-2.5 rounded-2xl border border-stone-100 bg-stone-50 p-3.5">
              <Perk icon={<Bell className="h-[18px] w-[18px] text-orange-600" />} text="Daily reminders that actually reach you" />
              <Perk icon={<Download className="h-[18px] w-[18px] text-orange-600" />} text="Add to Home Screen — ~3 MB, opens like a real app" />
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={openInBrowser}
                className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-bold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
              >
                Open in Chrome &rarr;
              </button>

              {/* Manual fallback — Instagram's webview sometimes swallows the
                  intent:// jump, so the menu route must always be visible. */}
              <div className="flex items-start gap-2 rounded-xl border border-stone-100 px-3 py-2.5 text-left">
                <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                <p className="text-xs leading-relaxed text-stone-500">
                  Didn&apos;t switch? Tap the <b className="text-stone-700">⋮ menu</b> top-right and choose{' '}
                  <b className="text-stone-700">&ldquo;Open in Chrome&rdquo;</b>.
                </p>
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={continueHere}
          className="mx-auto flex items-center gap-1 py-1 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          <X className="h-3.5 w-3.5" /> Continue here for now
        </button>

        <EscapeHelp />
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

function EscapeHelp() {
  const wa = supportWhatsappUrl('Hi, I need help opening the CareerRai app.');
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
