'use client';

import type { PaymentFunnelEvent } from '@/lib/payment-funnel';

// Fire-and-forget funnel beacon. Never awaited on the payment path, never
// allowed to throw: a telemetry hiccup must not cost a sale.
export function payFunnel(event: PaymentFunnelEvent, props: Record<string, unknown> = {}): void {
  try {
    const body = JSON.stringify({ event, ...props });
    // keepalive so the dismissal event survives the page losing focus.
    void fetch('/api/analytics/payment-funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* telemetry must never break checkout */ }
}
