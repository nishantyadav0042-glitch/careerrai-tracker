'use client';

import { useEffect } from 'react';

// Fires once per device when the app runs in standalone mode (installed on
// the home screen) — the honest source of the admin Leads "app installed"
// flag. sessionStorage guard keeps it to one POST per app session; the API
// itself is idempotent anyway.
export function InstallPing() {
  useEffect(() => {
    try {
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches
        || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
      if (!standalone) return;
      if (sessionStorage.getItem('cr_install_pinged') === '1') return;
      sessionStorage.setItem('cr_install_pinged', '1');
      void fetch('/api/profiles/install-ping', { method: 'POST' });
    } catch { /* best-effort telemetry — never interfere with the app */ }
  }, []);
  return null;
}
