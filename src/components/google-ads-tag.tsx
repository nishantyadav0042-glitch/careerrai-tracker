'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Google Ads tag (gtag.js) — requested by Narendra (marketing), 12 Aug 2026,
// for conversion tracking + remarketing on Google Ads campaigns.
//
// The conversion ID is public by design (it ships in every page's HTML on any
// site using Google Ads), so it lives here as a constant — no env step to
// forget. Mirror of MetaPixel's rules:
//  · WEB ONLY. In the installed app (standalone / iOS wrapper) it never loads:
//    cross-site ad tracking inside the iOS app would trigger Apple's App
//    Tracking Transparency requirement (Guideline 5.1.2), which a WKWebView
//    wrapper cannot prompt for. Same reasoning that keeps the Meta pixel out.
//  · SPA-aware: gtag counts the first page itself; route changes are reported
//    manually below, or every ad click would look like a one-page bounce.
//  · gclid attribution is ALREADY captured first-party by MetaPixel's
//    captureAttribution() into the cr_attr cookie — this tag adds Google's
//    own measurement on top, it does not replace ours.
const GOOGLE_ADS_ID = 'AW-18383029962';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAdsTag() {
  const pathname = usePathname();
  const first = useRef(true);
  const [webOnly, setWebOnly] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot capability detection after mount
    if (!standalone) setWebOnly(true);
  }, []);

  // The config call reports the first page; report SPA navigations here.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('config', GOOGLE_ADS_ID, { page_path: pathname });
    }
  }, [pathname]);

  if (!webOnly) return null;

  return (
    <>
      <Script
        id="google-ads-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');
window.gtag = gtag;`}
      </Script>
    </>
  );
}
