'use client';

// Where did this student come from — Play Store, the PWA install, iOS, or a
// plain browser tab?
//
// This is the ONE piece of data that lets us answer "do Play Store students
// behave differently from web students". Play Console reports installs and
// uninstalls, but it cannot see study behaviour, retention or votes — those
// live in our database, and only this label joins the two worlds.
//
// Detection order matters:
//   1. The launch URL marker — Play's TWA opens `?source=twa`, the PWA
//      manifest opens `?source=pwa`. Most reliable, but only on the FIRST
//      launch of a session, which is why we persist it immediately.
//   2. A previously stored value (localStorage) — later navigations lose the
//      query string.
//   3. Display mode + platform — a standalone window on iOS is an iOS
//      home-screen install; standalone elsewhere is an installed PWA.
//   4. Otherwise: a browser tab.

export type InstallSource = 'play' | 'pwa' | 'ios' | 'browser';

const KEY = 'cr_install_source';

export function detectInstallSource(): InstallSource {
  if (typeof window === 'undefined') return 'browser';

  const param = new URLSearchParams(window.location.search).get('source');
  if (param === 'twa') { persist('play'); return 'play'; }
  if (param === 'ios') { persist('ios'); return 'ios'; }
  if (param === 'pwa') { persist('pwa'); return 'pwa'; }

  try {
    const stored = localStorage.getItem(KEY) as InstallSource | null;
    if (stored) return stored;
  } catch { /* storage blocked */ }

  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  if (!standalone) return 'browser';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  const source: InstallSource = isIOS ? 'ios' : 'pwa';
  persist(source);
  return source;
}

function persist(s: InstallSource) {
  try { localStorage.setItem(KEY, s); } catch { /* storage blocked */ }
}
