// Single source of truth for the payments kill-switch. NEXT_PUBLIC_ so the same
// check works in client components and server routes — it's inlined at build.
// Beta default: OFF. Students stay free; the payment UI stays dormant.
export function paymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
}
