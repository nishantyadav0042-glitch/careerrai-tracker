'use client';

import { useEffect, useState } from 'react';
import { track, displayModeFrom, type DisplayMode } from '@/lib/journey';
import { storeCookieValue } from '@/lib/store-build';

// ── TEMPORARY DIAGNOSTIC — DELETE AFTER THE ANSWER IS RECORDED ──────────────
//
// The destination half. It answers, about ITSELF: which browser am I?
//
// THREE INDEPENDENT SIGNALS, because one of them can lie.
//
// 1. displayModeFrom() — the PRODUCTION detector, unchanged. It keys on the
//    `cr_store` cookie. Real Safari has its own cookie jar and will not carry
//    it, so it reports `browser`; a WKWebView opened by the app shares the
//    app's WKWebsiteDataStore, carries the cookie, and reports `ios_app`.
//
//    ITS LIMIT, stated rather than hidden: if the shell opened the popup with
//    a NON-PERSISTENT data store, a nested web view would also lack the cookie
//    and would report `browser` — a false Safari. That is exactly why the next
//    two signals exist, and why this page refuses to answer on the cookie
//    alone.
//
// 2. The `Safari/` user-agent token. Mobile Safari sends
//    "Version/17.0 Mobile/15E148 Safari/604.1". A WKWebView omits BOTH the
//    Version/ and Safari/ tokens — it ends at "Mobile/15E148". This is
//    independent of cookies and of any storage decision the shell made.
//
// 3. window.opener. A popup inside the same app keeps its opener reference.
//    A genuine hand-off to another APPLICATION cannot: the new process has no
//    handle on the old page. Independent of both the above.
//
// The verdict is only REAL_SAFARI when the signals AGREE. Disagreement is
// reported as UNKNOWN, never resolved by picking a favourite — a probe that
// guesses is worth less than no probe.

type Verdict = 'REAL_SAFARI' | 'ios_app' | 'UNKNOWN';

interface Reading {
  probeId: string;
  from: string;
  mode: DisplayMode;
  hasSafariToken: boolean;
  hasOpener: boolean;
  verdict: Verdict;
  ua: string;
}

function read(): Reading {
  const q = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent;
  const mode = displayModeFrom({
    storeSource: storeCookieValue(),
    standalone: (() => {
      try {
        return window.matchMedia?.('(display-mode: standalone)').matches
          || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
      } catch { return false; }
    })(),
  });
  // "Safari/" appears in Mobile Safari's UA and is absent from a bare
  // WKWebView. Chrome/Firefox on iOS also carry it, but neither can be what
  // opened this page from inside our own app.
  const hasSafariToken = / Safari\//.test(ua) && /Version\//.test(ua);
  const hasOpener = (() => { try { return window.opener != null; } catch { return false; } })();

  // Agreement required. Cookie says browser AND the UA looks like Safari AND
  // no opener survived → a real app switch. Any dissent → UNKNOWN.
  let verdict: Verdict;
  if (mode === 'ios_app' || mode === 'twa') verdict = 'ios_app';
  else if (mode === 'browser' && hasSafariToken && !hasOpener) verdict = 'REAL_SAFARI';
  else verdict = 'UNKNOWN';

  return {
    probeId: q.get('probe') ?? 'none',
    from: q.get('from') ?? 'unknown',
    mode, hasSafariToken, hasOpener, verdict,
    ua: ua.slice(0, 300),
  };
}

const COPY: Record<Verdict, { title: string; body: string; cls: string }> = {
  REAL_SAFARI: {
    title: 'REAL SAFARI',
    body: 'The app can hand a URL to Safari. The Safari-escape payment architecture is viable — Safari will handle UPI deep links natively.',
    cls: 'bg-emerald-600',
  },
  ios_app: {
    title: 'STILL INSIDE THE APP',
    body: 'This opened in another WKWebView, not Safari. A web-side escape cannot work; the native iOS shell is required. Do NOT build the Safari escape.',
    cls: 'bg-rose-600',
  },
  UNKNOWN: {
    title: 'UNKNOWN',
    body: 'The signals disagree, so this page will not guess. Send Claude the four values below — the probe needs sharpening, not interpreting.',
    cls: 'bg-amber-500',
  },
};

export default function ProbeLanded() {
  const [r, setR] = useState<Reading | null>(null);

  useEffect(() => {
    // Deferred to the next frame rather than set synchronously: a synchronous
    // setState inside an effect triggers a cascading render (and the lint rule
    // that catches it), and reading navigator/opener after first paint is
    // equally accurate for our purposes.
    let alive = true;
    const id = requestAnimationFrame(() => {
      if (!alive) return;
      const reading = read();
      setR(reading);
      track('probe_escape_landed', {
        probeId: reading.probeId,
        from: reading.from,
        destination: reading.mode,
        verdict: reading.verdict,
        safariToken: reading.hasSafariToken,
        opener: reading.hasOpener,
        ua: reading.ua,
      });
    });
    return () => { alive = false; cancelAnimationFrame(id); };
  }, []);

  if (!r) return null;
  const c = COPY[r.verdict];

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 py-10">
      <div className={`rounded-2xl ${c.cls} px-4 py-5 text-white`}>
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">Destination</p>
        <p className="mt-1 text-2xl font-extrabold">{c.title}</p>
        <p className="mt-2 text-[13px] leading-relaxed opacity-95">{c.body}</p>
      </div>
      <dl className="space-y-1.5 rounded-xl border border-stone-200 bg-white p-3 text-[12px]">
        {[
          ['probe', r.probeId],
          ['origin', r.from],
          ['destination display_mode', r.mode],
          ['Safari UA token', String(r.hasSafariToken)],
          ['window.opener survived', String(r.hasOpener)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-stone-500">{k}</dt>
            <dd className="font-mono font-semibold text-stone-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="break-all rounded-xl bg-stone-100 p-3 font-mono text-[10px] text-stone-600">{r.ua}</p>
      <p className="text-[11px] text-stone-400">
        Diagnostic only — nothing was charged, ordered or changed. Screenshot this and send it to Claude.
      </p>
    </div>
  );
}
