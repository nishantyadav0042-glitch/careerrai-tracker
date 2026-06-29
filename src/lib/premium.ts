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
    body: 'Aapka IIM senior 24 ghante ke andar assign ho raha hai — woh khud aapko message karega. Tab tak aaj ka log bhar do. 💪',
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
