// ONE shape for what an AI call leaves behind on a profile.
//
// `profiles.call_feedback` is jsonb and had two writers with two incompatible
// ideas of what goes in it:
//   · /api/expedify/callback wrote an OBJECT  { disposition, drop_reason, … }
//   · /api/expedify/outcome  wrote a STRING  "[29 Jul · call_report] summary"
// and the leads Excel export reads `.disposition` / `.notes` off an object. So
// every outcome the newer route recorded would export as blank columns, and a
// profile that received both would have its object stringified to
// "[object Object]" the first time the string writer touched it.
//
// Both routes now go through mergeCallFeedback, and the reader side (export,
// lead card) reads this one type. Latest values sit flat where the export
// already looks; earlier calls fall into `log` so a second call never erases
// what the first one learned.

export interface CallFeedbackEntry {
  at: string;
  event: string | null;
  notes: string | null;
}

export interface CallFeedback {
  /** HOT / WARM / COLD / NO_ANSWER / APP_ISSUE … whatever the agent reports. */
  disposition: string | null;
  reason_code: string | null;
  /** Why they stopped using the app — the activation-gold field. */
  drop_reason: string | null;
  momentum_score: number | null;
  emotional_trigger: string | null;
  /** The agent's summary of the most recent call. */
  notes: string | null;
  /** Which webhook event produced this (call_report, rescheduled, …). */
  event: string | null;
  /** When we recorded it. */
  at: string;
  /** Previous calls, oldest first. Capped — this is a summary, not an archive. */
  log?: CallFeedbackEntry[];
}

const MAX_LOG = 20;

/** Anything already in the column, in any of the shapes it has ever held. */
export type PriorFeedback = CallFeedback | string | null | undefined;

function asObject(prior: PriorFeedback): Partial<CallFeedback> {
  if (!prior) return {};
  // A legacy string write (or a founder note typed straight in) is not lost —
  // it becomes the first log entry rather than being parsed or discarded.
  if (typeof prior === 'string') return { log: [{ at: '', event: null, notes: prior }] };
  if (typeof prior !== 'object' || Array.isArray(prior)) return {};
  return prior;
}

/**
 * Fold a new call outcome onto whatever the profile already had.
 *
 * A field the new payload omits keeps its previous value — a "NO_ANSWER" event
 * carrying no drop_reason must not wipe the drop_reason a real conversation
 * produced yesterday.
 */
export function mergeCallFeedback(
  prior: PriorFeedback,
  incoming: Partial<CallFeedback> & { at: string },
): CallFeedback {
  const p = asObject(prior);
  const pick = <K extends keyof CallFeedback>(k: K): CallFeedback[K] =>
    (incoming[k] ?? p[k] ?? null) as CallFeedback[K];

  // The outgoing call being summarised now becomes history next time round.
  const priorLog = Array.isArray(p.log) ? p.log : [];
  const priorEntry: CallFeedbackEntry[] = p.at || p.notes
    ? [{ at: p.at ?? '', event: p.event ?? null, notes: p.notes ?? null }]
    : [];
  const log = [...priorLog, ...priorEntry].slice(-MAX_LOG);

  return {
    disposition: pick('disposition'),
    reason_code: pick('reason_code'),
    drop_reason: pick('drop_reason'),
    momentum_score: pick('momentum_score'),
    emotional_trigger: pick('emotional_trigger'),
    notes: pick('notes'),
    event: pick('event'),
    at: incoming.at,
    ...(log.length ? { log } : {}),
  };
}

/** Safe read for the UI and the export, whatever shape the column holds. */
export function readCallFeedback(value: unknown): CallFeedback | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return { disposition: null, reason_code: null, drop_reason: null, momentum_score: null,
             emotional_trigger: null, notes: value, event: null, at: '' };
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Partial<CallFeedback>;
  return {
    disposition: v.disposition ?? null,
    reason_code: v.reason_code ?? null,
    drop_reason: v.drop_reason ?? null,
    momentum_score: v.momentum_score ?? null,
    emotional_trigger: v.emotional_trigger ?? null,
    notes: v.notes ?? null,
    event: v.event ?? null,
    at: v.at ?? '',
    ...(Array.isArray(v.log) ? { log: v.log } : {}),
  };
}

// ── expedify_status, which is now two things ─────────────────────────────────
//
// The signup state machine writes 'queued' | 'sending' | 'sent' | 'failed' |
// 'skipped_activated'. The outcome webhook writes a human string like
// "call_report · interested · HOT". The lead card used to test `=== 'sent'` and
// paint EVERYTHING else red as "Expedify sync failed" — so a successful call
// outcome displayed as a failure.
export interface StatusBadge { label: string; tone: 'good' | 'bad' | 'wait' | 'info' | 'muted' }

export function expedifyStatusBadge(status: string | null | undefined): StatusBadge | null {
  if (!status) return null;
  switch (status) {
    case 'sent':               return { label: '📞 Call triggered', tone: 'good' };
    case 'failed':             return { label: '📞 Hand-off failed', tone: 'bad' };
    case 'queued':             return { label: '📞 Queued for a call', tone: 'wait' };
    case 'sending':            return { label: '📞 Handing off…', tone: 'wait' };
    case 'skipped_activated':  return { label: '📞 Skipped — already active', tone: 'muted' };
    // Anything else is an outcome string from the return webhook: show it.
    default:                   return { label: `📞 ${status}`, tone: 'info' };
  }
}
