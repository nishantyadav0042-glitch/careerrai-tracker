import type { SupabaseClient } from '@supabase/supabase-js';

// Freemium upgrade/downgrade side-effects, shared by the Razorpay webhook (paid
// path) and create-order (scholarship/coupon free path). The payment/subscription
// row is handled by the caller (activate_payment RPC or the free-path insert);
// this layers the freemium concerns on top: flip is_premium, queue a buddy, notify.

/** Flip a student to premium, queue a buddy (once), and confirm in-app. Idempotent:
 *  a no-op if the student is already premium, so Razorpay's double delivery
 *  (payment.captured + order.paid) and re-grants never duplicate the queue row
 *  or the "Buddy unlocked!" notification. */
export async function grantPremiumAndQueueBuddy(
  admin: SupabaseClient,
  studentId: string,
): Promise<void> {
  // Atomic gate: flip to premium ONLY if not already premium, and report whether
  // this call is the one that did it. A concurrent second delivery sees 0 rows.
  const { data: flipped } = await admin
    .from('profiles')
    .update({ is_premium: true, premium_since: new Date().toISOString() })
    .eq('id', studentId)
    .eq('is_premium', false)
    .select('id');

  // Already premium (another delivery won the race) → nothing more to do.
  if (!flipped || flipped.length === 0) return;

  // First grant for this student → queue a buddy and confirm in-app, once.
  await admin.from('buddy_assignment_queue').insert({ student_id: studentId, status: 'pending' });

  // They've converted — drop them off the founder's sales-call queue.
  await admin
    .from('student_engagement')
    .update({ sales_ready: false })
    .eq('student_id', studentId);

  await admin.from('notifications').insert({
    user_id: studentId,
    type: 'membership',
    title: '🎉 Buddy unlocked!',
    body: "Your IIM senior is being assigned within 24 hours — they'll message you directly. In the meantime, log today's session. 💪",
    data: { url: '/student/buddy' },
    read: false,
    channel: 'in_app',
  });
}

/** Downgrade to free on refund — keep the account + all logs. Cancels a pending buddy request. */
export async function revokePremium(admin: SupabaseClient, studentId: string): Promise<void> {
  await admin.from('profiles').update({ is_premium: false }).eq('id', studentId);
  await admin
    .from('buddy_assignment_queue')
    .update({ status: 'cancelled' })
    .eq('student_id', studentId)
    .eq('status', 'pending');
}

/**
 * Read the premium/buddy state that gates the buddy surface — or THROW.
 *
 * BOUNDARY 2, change 2 (founder GO, 21 Aug). /student/buddy used to read
 * this row with the error never inspected: one failed read and `profile`
 * was null, isPremium(null) was false, and a PAYING student was shown the
 * locked free experience with a "Rs 299 — book now" button. Infrastructure
 * failure became "not premium" — the auth-gate disease on the paywall.
 *
 * Same contract as readRole and readUpgradeCredits: retry once so a blip
 * stays invisible, then throw. UNKNOWN must surface as an error the student
 * can retry, never as the locked page — a paywall shown to a paying student
 * is, in the reconcile cron's own words, the worst bug this product can
 * have. Deliberately NOT a generic entitlement abstraction: premium,
 * credits and capacity share the error semantic, not a business primitive.
 */
export async function readPremiumProfile(
  // Same loose client type the rest of the payment libs use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  studentId: string,
): Promise<{ full_name: string | null; buddy_id: string | null; is_premium: boolean | null }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('profiles')
      .select('full_name, buddy_id, is_premium')
      .eq('id', studentId)
      .single();
    if (!error) {
      return {
        full_name: data?.full_name ?? null,
        buddy_id: data?.buddy_id ?? null,
        is_premium: data?.is_premium ?? null,
      };
    }
    if (attempt === 1) {
      console.error('[readPremiumProfile] read failed twice:', error.message);
      throw new Error('Could not load your membership state — please retry.');
    }
  }
  throw new Error('unreachable');
}
