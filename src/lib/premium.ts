import type { SupabaseClient } from '@supabase/supabase-js';

// Freemium upgrade/downgrade side-effects, shared by the Razorpay webhook (paid
// path) and create-order (scholarship/coupon free path). The payment/subscription
// row is handled by the caller (activate_payment RPC or the free-path insert);
// this layers the freemium concerns on top: flip is_premium, queue a buddy, notify.

/** Flip a student to premium, queue a buddy (once), and confirm in-app. Idempotent. */
export async function grantPremiumAndQueueBuddy(
  admin: SupabaseClient,
  studentId: string,
): Promise<void> {
  await admin
    .from('profiles')
    .update({ is_premium: true, premium_since: new Date().toISOString() })
    .eq('id', studentId);

  // Queue a buddy only if there isn't already a pending request (unique partial
  // index also enforces this; the check keeps it quiet on retries).
  const { data: pending } = await admin
    .from('buddy_assignment_queue')
    .select('id')
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!pending) {
    await admin.from('buddy_assignment_queue').insert({ student_id: studentId, status: 'pending' });
  }

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
