import type { Exception } from '@/lib/os/exception';

// ── THE BURST DETECTOR — a record logged faster than the act it claims ──────
//
// Founder, 15 Sep 2026, after the counsellor review: build this, so the next
// one is caught by the system instead of by a founder's suspicion.
//
// WHAT WAS FOUND BY HAND ON 15 SEP, and what this now watches for
// automatically. Across 1–15 Sep, self_reported rows:
//
//   rep      channel     median gap   gaps under 10s
//   Anshul   phone            146s      2%   (10 of 671)
//   Anshul   whatsapp          32s      2%   (1 of 48)
//   Neelam   phone            125s      0%   (1 of 298)
//   Neelam   whatsapp           4s     90%   (277 of 316)
//
// One burst put 22 WhatsApp rows between 19:27:45 and 19:29:51 — gaps of 3–6
// seconds, every row carrying one template. Sending on WhatsApp means leaving
// the app, sending, and coming back. It is not a four-second round trip.
//
// ══ WHAT THIS IS NOT ════════════════════════════════════════════════════════
//
// It is NOT a productivity measure, and SALES-OS §0 forbids it from becoming
// one: "a P5 number may never appear as a performance judgement, a target, a
// quota, or an input to pay." Working fast is good. Working slowly is fine.
// The only thing this can say is narrower and harder: THIS RECORD CANNOT BE
// TRUE, because the clock says the action it claims did not have time to
// happen. That is a data-integrity fault, not a verdict on a person — and the
// sentence it produces has to read that way, because a founder will take it
// into a room with the counsellor.
//
// ══ THE DIRECTION OF FAILURE ════════════════════════════════════════════════
//
// Every threshold below is set to MISS rather than to accuse. A false flag
// against someone who is doing the work costs their trust and the founder's
// judgement; a missed burst costs one more week of the same noise, and the
// pattern is persistent enough that next week catches it. So: a wide margin
// from the honest reps' real numbers, a minimum sample that ignores a short
// day, and gaps measured WITHIN one channel — a rep who calls and messages in
// parallel is not producing a burst.

/** Below this, two rows cannot describe two separate real actions. */
export const IMPOSSIBLE_GAP_SECONDS = 10;

/**
 * Fraction of a channel-day's gaps that must be impossible before this is a
 * burst rather than a busy patch.
 *
 * The honest reps sit at 0–2%. The fabricated batch sat at 90%. A third is far
 * from both — a rep would have to log a third of their day at machine speed to
 * reach it, which no amount of genuinely quick work produces.
 */
export const BURST_RATIO = 0.33;

/**
 * Rows needed in one channel-day before the ratio means anything.
 *
 * Fifteen because a real rep who fires off four quick corrections in a row
 * would hit 100% on a sample of five, and that is not a burst — that is a
 * person fixing typos.
 */
export const BURST_MIN_ROWS = 15;

export interface CadenceRow {
  /** ms epoch. */
  atMs: number;
  /** 'phone' | 'whatsapp' | null — gaps are only compared within one channel. */
  channel: string | null;
}

export interface CadenceReading {
  channel: string;
  rows: number;
  /** Gaps measured — always rows - 1. */
  gaps: number;
  impossibleGaps: number;
  impossibleRatio: number;
  medianGapSeconds: number | null;
  isBurst: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Read one rep's one channel for one day.
 *
 * Pure, so the judgement is testable without a database and the same function
 * serves the live watch and any replay of a past day.
 */
export function readCadence(channel: string, rows: CadenceRow[]): CadenceReading {
  const times = rows.map((r) => r.atMs).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 1000);

  const impossibleGaps = gaps.filter((g) => g < IMPOSSIBLE_GAP_SECONDS).length;
  const impossibleRatio = gaps.length ? impossibleGaps / gaps.length : 0;

  return {
    channel,
    rows: times.length,
    gaps: gaps.length,
    impossibleGaps,
    impossibleRatio,
    medianGapSeconds: median(gaps),
    // Both conditions, never either: a high ratio on six rows is noise, and a
    // big day at an honest pace is exactly what we want people doing.
    isBurst: times.length >= BURST_MIN_ROWS && impossibleRatio >= BURST_RATIO,
  };
}

/** Group a day's rows by channel and read each. Rows with no channel are skipped —
 *  a skip disposition carries no action whose duration we could reason about. */
export function readDay(rows: CadenceRow[]): CadenceReading[] {
  const byChannel = new Map<string, CadenceRow[]>();
  for (const r of rows) {
    if (!r.channel) continue;
    const list = byChannel.get(r.channel);
    if (list) list.push(r); else byChannel.set(r.channel, [r]);
  }
  return [...byChannel.entries()]
    .map(([channel, list]) => readCadence(channel, list))
    .sort((a, b) => b.impossibleRatio - a.impossibleRatio);
}

/** The sentence the founder reads. Describes the clock, never the person. */
export function burstReason(rep: string, r: CadenceReading, day: string): string {
  const pct = Math.round(r.impossibleRatio * 100);
  return `${rep} logged ${r.rows} ${r.channel} rows on ${day}, and ${pct}% of them `
    + `landed under ${IMPOSSIBLE_GAP_SECONDS}s after the previous one `
    + `(median gap ${r.medianGapSeconds}s). A ${r.channel} action cannot complete that fast, `
    + `so these rows record something that did not happen as recorded.`;
}

/**
 * The Exception, in the shape every other producer emits.
 *
 * Severity 'high', not 'critical': nothing is on fire and no student is
 * blocked, but the founder's picture of the day is wrong until it is looked
 * at, and a wrong picture is what the whole Sales OS is built to prevent.
 */
export function cadenceException(args: {
  repId: string; repName: string; day: string; reading: CadenceReading; detectedAtMs: number;
}): Exception {
  const { repId, repName, day, reading, detectedAtMs } = args;
  return {
    id: `rep-cadence:${repId}:${day}:${reading.channel}`,
    code: 'rep_cadence_burst',
    domain: 'system',
    entity: { kind: 'sales_rep', id: repId, label: repName },
    severity: 'high',
    reason: burstReason(repName, reading, day),
    detectedAtMs,
    evidence: {
      day,
      channel: reading.channel,
      rows: reading.rows,
      impossible_gaps: reading.impossibleGaps,
      impossible_pct: Math.round(reading.impossibleRatio * 100),
      median_gap_seconds: reading.medianGapSeconds,
      threshold_seconds: IMPOSSIBLE_GAP_SECONDS,
    },
    // Deliberately "look at", not "discipline". The founder decides what it
    // means; this only says where to look.
    suggestedAction: { label: `Review ${repName}'s activity`, route: `/admin/sales-performance?rep=${repId}` },
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    // The rep's own activity view, which lists the individual rows behind
    // this reading. Founder rule 6: an exception you cannot drill into is a
    // chart, and this contract does not permit charts.
    destination: `/admin/sales-performance?rep=${repId}`,
    lifecycle: 'detected',
  };
}

type Admin = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Read yesterday-and-today for every active seat and return any bursts.
 *
 * Two days, because the watch runs during the day: today catches a burst while
 * it is still the founder's problem to raise, and yesterday catches one that
 * happened after the last run.
 *
 * A failed read returns NOTHING rather than a flag. The one thing worse than
 * missing a burst is inventing one.
 */
export async function findCadenceBursts(admin: Admin, nowMs: number): Promise<Exception[]> {
  const IST = 5.5 * 3600_000;
  const dayOf = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
  const days = [dayOf(nowMs - 86_400_000), dayOf(nowMs)];
  const sinceIso = new Date(new Date(`${days[0]}T00:00:00.000Z`).getTime() - IST).toISOString();

  const { data: seats, error: seatErr } = await admin
    .from('sales_rep_config').select('rep_id').eq('active', true);
  if (seatErr || !seats?.length) return [];

  const repIds = (seats as Array<{ rep_id: string }>).map((s) => s.rep_id);
  const { data: people } = await admin.from('profiles').select('id, full_name').in('id', repIds);
  const nameOf = new Map(((people ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => [p.id, p.full_name ?? 'Counsellor']));

  const { data: rows, error: rowErr } = await admin
    .from('sales_activity')
    .select('actor_id, channel, created_at')
    .in('actor_id', repIds)
    .eq('provenance', 'self_reported')
    .gte('created_at', sinceIso);
  if (rowErr || !rows) return [];

  const out: Exception[] = [];
  for (const repId of repIds) {
    for (const day of days) {
      const mine = (rows as Array<{ actor_id: string; channel: string | null; created_at: string }>)
        .filter((r) => r.actor_id === repId && dayOf(Date.parse(r.created_at)) === day)
        .map((r) => ({ atMs: Date.parse(r.created_at), channel: r.channel }));
      for (const reading of readDay(mine)) {
        if (!reading.isBurst) continue;
        out.push(cadenceException({
          repId, repName: nameOf.get(repId) ?? 'Counsellor', day, reading, detectedAtMs: nowMs,
        }));
      }
    }
  }
  return out;
}
