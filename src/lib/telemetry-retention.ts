import { getServerConfig } from '@/lib/server-config';
import { BUDDY_INTEREST_LOOKBACK_DAYS } from '@/lib/os/buddy-interest';

// ── WHAT WE STOP KEEPING, AND WHY IT IS SAFE ────────────────────────────────
//
// Measured 7 Sep 2026: production is 379 MB against the free tier's 500 MB and
// growing ~15 MB a day. student_events (196 MB), notifications (73 MB) and
// perf_events (21 MB) are 290 MB of it. None of that is student work — it is
// instrumentation about student work.
//
// The trap here is that "delete telemetry older than N days" is WRONG for this
// table. student_events is two things at once:
//
//   • UI instrumentation — `tap` alone is 41,554 rows a week, half of all
//     events, and NOTHING reads it. Grep the repo: the only occurrences of
//     'tap' outside the writer are the event-name union in journey.ts and the
//     FORBIDDEN_KINDS list in os/timeline.ts, which exists to keep it OFF the
//     student's timeline. It is written and never read.
//
//   • the learning loop — `app_open` feeds os/activation-funnel.ts, which
//     compares July's activation against September's and deliberately carries
//     NO time filter. Ageing those rows out would destroy the one measurement
//     the company steers by, silently, months before anyone noticed.
//
// So the policy is per EVENT NAME, and the default is KEEP. An event nobody
// listed here is kept forever; only names written down below are ever deleted.
// Adding a new event to the app therefore cannot cost you data by accident —
// the failure mode is "we kept too much", which is recoverable.
//
// Each window is the longest reader window plus real margin, and where a
// reader's window is a constant, this file IMPORTS it: widen the reader and
// the guard test fails here rather than the data going missing in production.

export type SweepTable = 'student_events' | 'perf_events';

export interface RetentionRule {
  table: SweepTable;
  /** Event names this rule may delete. `null` means every row in the table. */
  events: readonly string[] | null;
  keepDays: number;
  /** The reader window this survives, in one sentence. Not decoration. */
  because: string;
}

/**
 * Written and never read. Verified by grep on 7 Sep 2026: outside the writer,
 * each of these appears only in the event-name union (`lib/journey.ts`) or in
 * `os/timeline.ts` FORBIDDEN_KINDS, which exists to keep them off the student's
 * timeline. Fourteen days is kept so a bug can still be reconstructed from
 * behaviour; nothing computes a number from them.
 */
export const WRITE_ONLY_EVENTS = [
  'tap',
  'resource_shown',
  'storage_persistence',
  'session_forensics',
  'insight_shown',
  'insight_dismissed',
  'meta_escape_shown',
  'meta_escape_click',
  'meta_escape_dismissed',
] as const;

/** Read by os/buddy-interest (21 days), the founder digest and /admin/analytics. */
export const SCREEN_EVENTS = ['screen_view', 'screen_exit'] as const;

/** /admin/perf reads one week of page-load timings. Nothing else touches them. */
export const PERF_READER_DAYS = 7;

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    table: 'student_events',
    events: WRITE_ONLY_EVENTS,
    keepDays: 14,
    because: 'No reader anywhere in the repo. Kept two weeks for debugging only.',
  },
  {
    table: 'student_events',
    events: SCREEN_EVENTS,
    keepDays: 45,
    because: `Longest reader is buddy-interest at ${BUDDY_INTEREST_LOOKBACK_DAYS} days; 45 leaves three weeks of margin.`,
  },
  {
    table: 'perf_events',
    events: null,
    keepDays: 21,
    because: `/admin/perf reads ${PERF_READER_DAYS} days; 21 leaves two weeks of margin.`,
  },
];

export const RETENTION_KILL_SWITCH_KEY = 'TELEMETRY_RETENTION_ENABLED';

/**
 * Rows deleted per statement.
 *
 * Was 20,000, and the first live run proved that wrong: the write-only rule
 * came back `canceling statement due to statement timeout` and deleted NOTHING,
 * while the two smaller rules beside it succeeded. `student_events` carries six
 * indexes, so a delete pays six index updates per row — measured at 486 ms for
 * 2,000 rows, which puts 20,000 around five seconds and over the statement
 * timeout once a cold cache is added.
 *
 * The batch is not a throughput knob, it is a LATENCY budget: each statement
 * must finish comfortably inside the timeout, and volume comes from running
 * more of them.
 */
export const SWEEP_BATCH = 2_000;
/**
 * Statements per rule per run. 40 x 2,000 is 80,000 rows a rule — an order of
 * magnitude above the ~7,500/day this sweep exists to remove, so a backlog
 * drains rather than creeping. At the measured half-second a batch, a full run
 * of three rules is about a minute against `maxDuration` 300.
 */
export const SWEEP_MAX_BATCHES = 40;

export const cutoffIso = (rule: RetentionRule, nowMs: number): string =>
  new Date(nowMs - rule.keepDays * 86_400_000).toISOString();

export interface SweepLine {
  table: SweepTable;
  events: readonly string[] | null;
  keepDays: number;
  cutoff: string;
  deleted: number;
  /** True when the batch budget ran out with rows still older than the cutoff. */
  more: boolean;
  error?: string;
}

export interface SweepResult {
  ok: boolean;
  state: 'SWEPT' | 'DRY_RUN' | 'ENGINE_DISABLED';
  deleted: number;
  lines: SweepLine[];
}

const off = (v: string | null) => v != null && ['false', '0', 'off'].includes(v.trim().toLowerCase());

interface SweepDb {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(cols: string, opts: { count: 'exact'; head: true }): {
      lt(col: string, v: string): {
        in(col: string, v: readonly string[]): Promise<{ count: number | null; error: { message: string } | null }>;
      } & Promise<{ count: number | null; error: { message: string } | null }>;
    };
  };
}

/**
 * Delete what the policy says is expired. Idempotent, resumable, and bounded:
 * a run that hits its batch budget reports `more: true` and the next run picks
 * up where it stopped, so the first sweep of a large backlog costs several
 * runs rather than one long lock.
 *
 * A dry run counts and deletes nothing — always the first thing to look at.
 */
export async function runRetentionSweep(
  db: SweepDb,
  opts: { now?: Date; dryRun?: boolean; maxBatches?: number } = {},
): Promise<SweepResult> {
  const flag = await getServerConfig(RETENTION_KILL_SWITCH_KEY, RETENTION_KILL_SWITCH_KEY);
  if (off(flag)) return { ok: true, state: 'ENGINE_DISABLED', deleted: 0, lines: [] };

  const nowMs = (opts.now ?? new Date()).getTime();
  const budget = opts.maxBatches ?? SWEEP_MAX_BATCHES;
  const lines: SweepLine[] = [];
  let total = 0;

  for (const rule of RETENTION_RULES) {
    const cutoff = cutoffIso(rule, nowMs);
    const line: SweepLine = { table: rule.table, events: rule.events, keepDays: rule.keepDays, cutoff, deleted: 0, more: false };

    if (opts.dryRun) {
      const base = db.from(rule.table).select('id', { count: 'exact', head: true }).lt('created_at', cutoff);
      const { count, error } = await (rule.events ? base.in('event', rule.events) : base);
      if (error) line.error = error.message;
      line.deleted = count ?? 0;
      lines.push(line);
      total += line.deleted;
      continue;
    }

    for (let i = 0; i < budget; i++) {
      const { data, error } = await db.rpc('sweep_telemetry', {
        p_table: rule.table,
        p_events: rule.events ?? null,
        p_cutoff: cutoff,
        p_limit: SWEEP_BATCH,
      });
      if (error) { line.error = error.message; break; }
      const n = Number(data ?? 0);
      line.deleted += n;
      if (n < SWEEP_BATCH) break;
      if (i === budget - 1) line.more = true;
    }
    lines.push(line);
    total += line.deleted;
  }

  return {
    ok: lines.every((l) => !l.error),
    state: opts.dryRun ? 'DRY_RUN' : 'SWEPT',
    deleted: total,
    lines,
  };
}
