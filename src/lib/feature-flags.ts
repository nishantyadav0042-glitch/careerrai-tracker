// Single source of truth for the payments kill-switch. NEXT_PUBLIC_ so the same
// check works in client components and server routes — it's inlined at build.
// Beta default: OFF. Students stay free; the payment UI stays dormant.
export function paymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
}

/**
 * Do STORE launches (Play/iOS wrapper) get the plan-first /start funnel?
 *
 * OFF until Play approves, and the reason is specific rather than cautious.
 * The funnel's last screen (start/screens/screen-login-build.tsx) authenticates
 * by SMS OTP to a 10-digit INDIAN mobile and offers no password option at all.
 * A Play reviewer cannot receive that SMS. Incident #10 is exactly this: "our
 * login sends an SMS OTP to an Indian number a reviewer cannot receive. They
 * had no way in" — a Guideline 2.1 rejection we have already paid for once.
 *
 * With this OFF a store launch lands on /login, password plainly visible,
 * byte-identical to the build Apple approved and the one Play will review.
 * Web visitors still get the funnel: they never carry ?source= or cr_store, so
 * nothing about their journey is held back by this switch.
 *
 * FLIP IT (to 'true') ONCE PLAY HAS APPROVED. Better still, first give
 * screen-login-build a password path so the funnel cannot dead-end anyone,
 * and then this flag stops being load-bearing at all.
 */
export function storeFunnelEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STORE_FUNNEL_ENABLED === 'true';
}
