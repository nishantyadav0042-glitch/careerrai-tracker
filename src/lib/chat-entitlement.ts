import { createAdminClient } from '@/lib/supabase/admin';
import { MENTOR_FREE_MESSAGES } from '@/lib/mentor-doors';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Who may say something to a mentor, and how often ────────────────────────
//
// ONE authority for a question that used to be answered in two places with two
// different answers.
//
// THE BUG THIS EXISTS TO KILL: /api/chat/send asked `resolvePair()` whether a
// student was paired, and `resolvePair` asks exactly one question — does this
// student hold a profiles.buddy_id? No plan check, no premium check, no
// entitlement check of any kind. The 3-message cap lived in the `if (!pair)`
// branch, so ANY student holding a buddy_id skipped it entirely.
//
// That is not an edge case for the ₹299 product: connecting a session buyer to
// their mentor is exactly how they would acquire a buddy_id, and it would have
// handed them the ₹2,999 continuous-chat product for ₹299.
//
// PAIRING AND ENTITLEMENT ARE DIFFERENT QUESTIONS:
//   resolvePair          — WHO is on the other end (unchanged, still correct)
//   resolveChatEntitlement — MAY this person speak, and how many times
//
// Nothing here decides pairing, and resolvePair no longer decides entitlement.

export type ChatEntitlement =
  /** Mentors, and students on a subscription plan. */
  | { kind: 'unlimited'; reason: 'mentor' | 'subscription' }
  /** A ₹299 buyer, or a free student who earned a Mentor Door. */
  | { kind: 'limited'; buddyId: string; used: number; allowance: number; remaining: number }
  /** No relationship, or the entitlement is spent. */
  | { kind: 'exhausted'; buddyId: string; used: number; allowance: number }
  | { kind: 'none'; reason: string };

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Resolve what this user is entitled to say, right now.
 *
 * Deliberately does NOT consume anything — asking is free, spending is a
 * separate atomic call. A read that also mutated would make every "how many
 * do I have left?" render burn a message.
 */
export async function resolveChatEntitlement(
  admin: Admin, userId: string, studentId?: string | null,
): Promise<ChatEntitlement> {
  const { data: me, error } = await admin
    .from('profiles')
    .select('id, role, buddy_id, is_premium')
    .eq('id', userId)
    .maybeSingle();

  // A read we could not complete is NOT "no entitlement" — that would silence
  // a paying student because of a database blip. Boundary 2.
  if (error) return { kind: 'none', reason: 'lookup_failed' };
  if (!me) return { kind: 'none', reason: 'no_profile' };

  // A mentor replying is never rate-limited. The cap is a commercial boundary
  // on what a STUDENT bought, not a limit on how much help a mentor may give.
  if (me.role === 'buddy') return { kind: 'unlimited', reason: 'mentor' };
  if (me.role !== 'student') return { kind: 'none', reason: 'not_a_student' };

  // The subscription plans (₹999 / ₹2,499 / ₹2,999) are what continuous chat
  // is FOR. is_premium is the existing single authority for that — set only by
  // the subscription activation path, never by the ₹299 one.
  if (me.is_premium === true) return { kind: 'unlimited', reason: 'subscription' };

  // Everyone else is limited, and the grant is the entitlement record. A
  // buddy_id on its own grants NOTHING — that was the leak.
  const { data: grant, error: grantErr } = await admin
    .from('mentor_grants')
    .select('buddy_id, activated_at, messages_used, messages_allowance')
    .eq('student_id', me.id)
    .maybeSingle();

  if (grantErr) return { kind: 'none', reason: 'lookup_failed' };
  if (!grant || grant.activated_at == null || grant.buddy_id == null) {
    return { kind: 'none', reason: 'no_entitlement' };
  }

  const used = (grant.messages_used as number) ?? 0;
  const allowance = (grant.messages_allowance as number) ?? MENTOR_FREE_MESSAGES;
  const remaining = Math.max(0, allowance - used);

  if (remaining <= 0) {
    return { kind: 'exhausted', buddyId: grant.buddy_id as string, used, allowance };
  }
  return { kind: 'limited', buddyId: grant.buddy_id as string, used, allowance, remaining };
}

export type ConsumeResult =
  | { ok: true; unlimited: true }
  | { ok: true; unlimited: false; used: number; allowance: number; remaining: number }
  | { ok: false; used: number; allowance: number };

/**
 * Spend one message, atomically.
 *
 * The whole point is that this is ONE guarded UPDATE inside the database
 * (consume_chat_message). Counting rows in the application and then deciding
 * — which is what this replaced — can always be beaten by a second browser
 * tab: both requests read 2, both conclude "one left", both write.
 *
 * Verified on careerrai-test: 80 attempts across two separate connections
 * against a 3-message grant let exactly 3 through.
 */
export async function consumeChatMessage(
  admin: Admin, ent: ChatEntitlement, studentId: string,
): Promise<ConsumeResult> {
  if (ent.kind === 'unlimited') return { ok: true, unlimited: true };
  if (ent.kind === 'none') return { ok: false, used: 0, allowance: 0 };
  if (ent.kind === 'exhausted') return { ok: false, used: ent.used, allowance: ent.allowance };

  const { data, error } = await admin.rpc('consume_chat_message', {
    p_student_id: studentId,
    p_buddy_id: ent.buddyId,
  });
  if (error) {
    console.error('[chat-entitlement] consume failed:', error.message);
    // Refuse rather than let a failed spend through. An entitlement that
    // cannot be debited must not be spendable.
    return { ok: false, used: ent.used, allowance: ent.allowance };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { allowed: boolean; used: number; allowance: number } | undefined;
  if (!row?.allowed) {
    return { ok: false, used: row?.used ?? ent.used, allowance: row?.allowance ?? ent.allowance };
  }
  return {
    ok: true, unlimited: false,
    used: row.used, allowance: row.allowance,
    remaining: Math.max(0, row.allowance - row.used),
  };
}

/**
 * What a student is told when the entitlement is spent.
 *
 * Names the plan tier rather than a price, so this does not become a second
 * pricing authority that can drift from lib/plans.
 */
export function upgradeMessage(allowance: number): string {
  return `You've used all ${allowance} free message${allowance === 1 ? '' : 's'} with your buddy. `
    + 'Continuous chat comes with a monthly plan — your buddy, every day, until the exam.';
}
