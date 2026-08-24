import crypto from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The vendor boundary: correlation, not guessing ──────────────────────────
//
// What the audit found, and what this module exists to make impossible:
//
//   · Both Expedify inbound routes resolved the student with
//       .in('phone', phoneVariants(phone)).limit(1).maybeSingle()
//     so whoever controlled the payload chose which student row was written,
//     and an ambiguous phone silently selected an arbitrary profile.
//   · We had never sent Expedify a CareerRai identifier. `studentId` sat in
//     the outbound TypeScript interface and was deliberately omitted from the
//     request body — so the missing correlation key was OURS, not theirs.
//   · expedify_events.dedupe_key carried a UNIQUE constraint and was NULL on
//     all 239 production rows. PostgreSQL permits unlimited NULLs in a unique
//     index, so replay protection was structurally inert — and 220 duplicate
//     deliveries of one payload landed on 12 August to prove it.
//
// THE RULE
//
//   internal → external : we send external_ref = profiles.id
//   external → internal : the vendor returns it
//   missing or ambiguous: UNMATCHED. Never a phone guess, never `.limit(1)`.
//
// An unmatched event is not an error and is not discarded. It is stored,
// surfaced to the founder, and repairable by hand with the repair recorded.

/** Every field name we will accept as OUR correlation reference coming back. */
const REF_KEYS = ['external_ref', 'externalRef', 'external_id', 'reference', 'client_ref', 'careerrai_id'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readExternalRef(flat: Record<string, unknown>): string | null {
  for (const k of REF_KEYS) {
    const v = flat[k];
    if (typeof v === 'string' && UUID_RE.test(v.trim())) return v.trim();
  }
  return null;
}

/** The vendor's own identifier for the call/message, when they send one. */
const CALL_ID_KEYS = ['call_id', 'callId', 'message_id', 'messageId', 'attempt_id', 'session_id'];

export function readVendorCallId(flat: Record<string, unknown>): string | null {
  for (const k of CALL_ID_KEYS) {
    const v = flat[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 200);
  }
  return null;
}

/**
 * A dedupe key that ALWAYS exists.
 *
 * Preference order:
 *   1. the vendor's own call id — the strongest signal, one row per attempt
 *   2. lead id + attempt + event — their older dialect
 *   3. sha256 of the canonicalised payload
 *
 * (3) is the important one. The previous code produced NULL whenever the
 * vendor sent no identifier, and NULL is exactly what slips past a unique
 * index. A content hash is deterministic: a genuine redelivery of the same
 * bytes collapses onto one row, while a different call — different summary,
 * different timestamp — hashes differently and is kept. It is weaker than a
 * real id (a vendor could legitimately send two byte-identical events) and
 * that trade is deliberate: silently storing a duplicate is a smaller harm
 * than silently accepting every duplicate, which is what happened.
 */
export function deriveDedupeKey(
  flat: Record<string, unknown>,
  payload: Record<string, unknown>,
  event: string,
): { key: string; basis: 'call_id' | 'lead_attempt' | 'payload_hash' } {
  const callId = readVendorCallId(flat);
  if (callId) return { key: `call:${callId}:${event}`, basis: 'call_id' };

  const leadId = ['expedify_lead_id', 'lead_id', 'contact_id']
    .map((k) => (typeof flat[k] === 'string' ? (flat[k] as string).trim() : ''))
    .find(Boolean);
  const attempt = flat.attempt_number != null ? String(flat.attempt_number) : null;
  if (leadId && attempt) return { key: `lead:${leadId}:${attempt}:${event}`, basis: 'lead_attempt' };

  return { key: `sha256:${canonicalHash(payload)}`, basis: 'payload_hash' };
}

/** Stable JSON hash — key order must not change the digest. */
export function canonicalHash(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export type Correlation =
  | { kind: 'matched'; studentId: string }
  | { kind: 'unmatched'; why: 'no_reference' | 'reference_not_a_student' | 'lookup_failed' };

/**
 * Resolve OUR reference to a student. Phone is never consulted.
 *
 * Note what is absent: there is no fallback. A vendor that does not return
 * external_ref produces an unmatched event, which is a visible, repairable
 * state — not a silent write to whichever profile happened to share a number.
 */
export async function correlate(admin: any, flat: Record<string, unknown>): Promise<Correlation> {
  const ref = readExternalRef(flat);
  if (!ref) return { kind: 'unmatched', why: 'no_reference' };

  const { data, error } = await admin
    .from('profiles')
    .select('id, role, is_test_account, is_demo')
    .eq('id', ref)
    .maybeSingle();
  if (error) {
    console.error('[vendor-correlation] lookup failed:', error.message);
    return { kind: 'unmatched', why: 'lookup_failed' };
  }
  if (!data || data.role !== 'student' || data.is_test_account === true || data.is_demo === true) {
    return { kind: 'unmatched', why: 'reference_not_a_student' };
  }
  return { kind: 'matched', studentId: data.id as string };
}
