import type { Exception } from '@/lib/os/exception';

// ── DID THE STUDENT SIDE MOVE? — the one signal a rep cannot write ──────────
//
// Founder, 15 Sep 2026: make the tracking better without buying telephony.
//
// Every number in the Sales OS today is self_reported — a row a counsellor
// chose to write. lib/os/rep-cadence catches the case where the clock says a
// batch could not have happened, but a patient fabricator at a believable pace
// would pass it. This is the check that does not care about pace at all,
// because it reads the OTHER END of the conversation.
//
// THE IDEA. When a counsellor records `interested` or `callback`, they are
// asserting a human talked to them, and almost every such conversation ends in
// an ask — open the app, log a session, book a slot. Students are fickle and
// most will not act. But across THIRTY such conversations, if not one student
// ever opens the app again, only two readings are left: the conversations did
// not happen, or nothing in them lands. Both need the founder's eyes, and this
// is deliberately unable to tell them apart — saying which would be a guess
// wearing a number's clothes.
//
// WHY A REP CANNOT FAKE IT. student_events rows are written by the STUDENT's
// device, on a surface the counsellor has no access to. Nothing a rep types
// moves this number. That is the whole reason it is worth having, and it is
// the reason it beats any refinement of the cadence heuristic.
//
// ══ WHAT THIS MUST NEVER BECOME ═════════════════════════════════════════════
//
// A conversion rate with a target on it. SALES-OS §0 forbids it, and the
// mechanism is worse than the rule: a counsellor who is judged on whether
// students return will start recording only the students who were returning
// anyway, and the book's honesty collapses in a fortnight. It is an integrity
// check with one trigger — ZERO out of a large sample — and no gradient. There
// is deliberately no "good" score to chase.

/** Days after the conversation in which student-side activity counts. */
export const CORROBORATION_WINDOW_DAYS = 3;

/**
 * Conversations needed before zero means anything.
 *
 * Thirty, because students genuinely do go quiet and a run of ten silent ones
 * is an ordinary fortnight, not evidence. On 8–11 Sep the rep with the
 * fabricated messages logged 70 connected conversations, so a real case clears
 * this comfortably while a slow week never trips it.
 */
export const CORROBORATION_MIN_CONVERSATIONS = 30;

export interface CorroborationReading {
  repId: string;
  repName: string;
  conversations: number;
  corroborated: number;
  /** null when the sample is too small to mean anything — NOT zero. */
  ratio: number | null;
  /** True only at zero on a full sample. There is no partial verdict. */
  isUncorroborated: boolean;
}

export function readCorroboration(args: {
  repId: string; repName: string; conversations: number; corroborated: number;
}): CorroborationReading {
  const { repId, repName, conversations, corroborated } = args;
  const enough = conversations >= CORROBORATION_MIN_CONVERSATIONS;
  return {
    repId,
    repName,
    conversations,
    corroborated,
    // An honest unknown, not a flattering zero. A small sample tells us
    // nothing and must not render as a rate.
    ratio: enough ? corroborated / conversations : null,
    isUncorroborated: enough && corroborated === 0,
  };
}

/** The sentence the founder reads. States both readings; picks neither. */
export function corroborationReason(r: CorroborationReading): string {
  return `${r.repName} recorded ${r.conversations} conversations where a student answered, `
    + `and not one of those students opened the app in the ${CORROBORATION_WINDOW_DAYS} days after. `
    + `Either those conversations are not happening, or nothing in them is landing — `
    + `this cannot tell which, and both are worth an hour of your time.`;
}

/**
 * Severity 'normal': monitor, do not page.
 *
 * A quiet fortnight on a genuinely hard book can produce this, and waking the
 * founder for it would spend the alarm that the money exceptions need.
 */
export function corroborationException(r: CorroborationReading, detectedAtMs: number): Exception {
  return {
    id: `rep-corroboration:${r.repId}:${new Date(detectedAtMs + 5.5 * 3600_000).toISOString().slice(0, 10)}`,
    code: 'rep_conversations_uncorroborated',
    domain: 'system',
    entity: { kind: 'sales_rep', id: r.repId, label: r.repName },
    severity: 'normal',
    reason: corroborationReason(r),
    detectedAtMs,
    evidence: {
      conversations: r.conversations,
      students_who_returned: r.corroborated,
      window_days: CORROBORATION_WINDOW_DAYS,
      min_sample: CORROBORATION_MIN_CONVERSATIONS,
      evidence_class: 'student_side_observed',
    },
    // The cheapest verification that exists, and the only one no software
    // can beat: ring three of them and ask.
    suggestedAction: { label: `Call 3 of ${r.repName}'s students yourself`, route: `/admin/sales-performance?rep=${r.repId}` },
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: `/admin/sales-performance?rep=${r.repId}`,
    lifecycle: 'detected',
  };
}

type Admin = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Outcomes that assert a human answered. Kept local and explicit rather than
 *  imported, because `messaged` must NOT be here: a sent message asserts
 *  nothing about a conversation, and including it would make the denominator
 *  meaningless for the rep who sends many. */
const CONVERSATION_OUTCOMES = ['interested', 'callback', 'not_interested', 'converted', 'dnd'];

/**
 * Look back over a window of conversations and ask whether any student moved.
 *
 * A failed read returns NOTHING. This check exists to question a record; it
 * must never manufacture a doubt out of our own database having a bad moment.
 */
export async function findUncorroboratedReps(
  admin: Admin, nowMs: number, lookbackDays = 14,
): Promise<Exception[]> {
  const windowMs = CORROBORATION_WINDOW_DAYS * 86_400_000;
  // Only conversations old enough to have HAD their window. A call from an
  // hour ago has not had three days to be answered, and counting it as
  // uncorroborated would be a lie about time.
  const ripeBefore = new Date(nowMs - windowMs).toISOString();
  const since = new Date(nowMs - lookbackDays * 86_400_000).toISOString();

  const { data: seats, error: seatErr } = await admin
    .from('sales_rep_config').select('rep_id').eq('active', true);
  if (seatErr || !seats?.length) return [];
  const repIds = (seats as Array<{ rep_id: string }>).map((s) => s.rep_id);

  const { data: people } = await admin.from('profiles').select('id, full_name').in('id', repIds);
  const nameOf = new Map(((people ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => [p.id, p.full_name ?? 'Counsellor']));

  const { data: convos, error: convoErr } = await admin
    .from('sales_activity')
    .select('actor_id, student_id, created_at')
    .in('actor_id', repIds)
    .eq('provenance', 'self_reported')
    .in('status', CONVERSATION_OUTCOMES)
    .gte('created_at', since)
    .lt('created_at', ripeBefore);
  if (convoErr || !convos) return [];

  const rows = convos as Array<{ actor_id: string; student_id: string; created_at: string }>;
  if (!rows.length) return [];

  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const { data: events, error: evErr } = await admin
    .from('student_events')
    .select('user_id, created_at')
    .in('user_id', studentIds)
    .gte('created_at', since);
  if (evErr) return [];

  // student → sorted activity times, so each conversation asks its own window.
  const seen = new Map<string, number[]>();
  for (const e of (events ?? []) as Array<{ user_id: string; created_at: string }>) {
    const t = Date.parse(e.created_at);
    const list = seen.get(e.user_id);
    if (list) list.push(t); else seen.set(e.user_id, [t]);
  }
  for (const list of seen.values()) list.sort((a, b) => a - b);

  const out: Exception[] = [];
  for (const repId of repIds) {
    const mine = rows.filter((r) => r.actor_id === repId);
    let corroborated = 0;
    for (const c of mine) {
      const at = Date.parse(c.created_at);
      const acts = seen.get(c.student_id);
      if (acts?.some((t) => t > at && t <= at + windowMs)) corroborated += 1;
    }
    const reading = readCorroboration({
      repId, repName: nameOf.get(repId) ?? 'Counsellor', conversations: mine.length, corroborated,
    });
    if (reading.isUncorroborated) out.push(corroborationException(reading, nowMs));
  }
  return out;
}
