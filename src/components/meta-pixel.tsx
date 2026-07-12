'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Meta Pixel for the WEB app (this is the correct integration for a PWA — the
// Facebook App ID / Client token / Android SDK route is only for native apps).
// Entirely inert until NEXT_PUBLIC_META_PIXEL_ID is set, so shipping this is
// safe; the moment the real Pixel ID is added in Vercel env, tracking goes live.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// Capture the ad-click attribution params from the landing URL into a 30-day
// cookie, so a later signup/payment can be tied back to the campaign that drove
// it (read this cookie server-side when creating a lead/profile to attribute).
function captureAttribution() {
  try {
    const p = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    const found: Record<string, string> = {};
    for (const k of keys) {
      const v = p.get(k);
      if (v) found[k] = v.slice(0, 200);
    }
    if (Object.keys(found).length) {
      document.cookie = `cr_attr=${encodeURIComponent(JSON.stringify(found))}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    }
  } catch {
    /* best effort */
  }
}

export function MetaPixel() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    captureAttribution();
  }, []);

  // The inline script fires the FIRST PageView; fire subsequent SPA navigations here.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');
    }
  }, [pathname]);

  if (!PIXEL_ID) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
    </Script>
  );
}
