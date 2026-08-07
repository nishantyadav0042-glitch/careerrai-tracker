// Reading an Expedify webhook payload — ONE flattener, both shapes.
//
// Expedify speaks two dialects down the same pipe:
//   · our own post-call HTTP node posts the fields flat
//       { phone, disposition, drop_reason, ... }
//   · their CRM events (contact.updated) nest the contact under `data`, with
//     the AI agent's extracted fields inside `data.custom_fields`
//       { event, entity_id, data: { phone, custom_fields: { pain_point, ... } } }
//
// The nested dialect has been arriving since July and matching NOTHING,
// because the route only read the top level: `payload.phone` was undefined,
// so no student matched, so every real call's pain_point, drop_reason and
// momentum_score sat inert in the audit table while the leads export showed
// blanks. Flattening is the fix, and it lives here so both inbound routes
// read a payload the same way.
//
// Precedence: top level wins, then `data`, then `data.custom_fields` — the
// outermost field is the most deliberate one.

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function flattenExpedifyPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(payload.data);
  return { ...asRecord(data.custom_fields), ...data, ...payload };
}

/** First non-empty string among the given keys. */
export function pickStr(flat: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = flat[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * A 0–5 score. Their CRM writes these as strings ("3"); our own node sends
 * numbers. Anything unparseable is null, never 0 — a missing score and a
 * score of zero are different facts.
 */
export function pickScore(flat: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = flat[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n)) return Math.max(0, Math.min(5, n));
  }
  return null;
}
