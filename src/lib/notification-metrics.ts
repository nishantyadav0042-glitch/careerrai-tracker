// ── The canonical notification metrics library ────────────────────────────
//
// Notification Reliability V2, Installment 4, Batch D. Before this file,
// three different surfaces (the old admin health page, mission-control.ts,
// and any future dashboard) each wrote their own SQL for "how many students
// are opted in" — which is exactly how the forensic audit that started this
// whole project found notification-health.ts and push-state.ts disagreeing
// on the same two columns. ONE metric, ONE formula, defined here, computed
// here. Nothing downstream is allowed to redefine any of these.
//
// Every metric below documents: exact formula, source table, source event,
// denominator, timezone, time window, and known limitations — because an
// ambiguous word ("sent", "delivered", "reach") is exactly how a dashboard
// starts lying by omission. Where a metric genuinely cannot be computed yet
// (per-notification-type action attribution, for example), it says so
// explicitly rather than being silently absent.

import { classifyNotificationState, classifyRecovery, type NotificationStateInput } from './notification-state';
import type { AudienceName } from './notification-audience';

// 16 Aug, Installment 5 (founder review of Installment 4): "0 observed" and
// "impossible by current code path" are DIFFERENT CLAIMS and must never be
// displayed as the same thing. A metric derived from counting real rows is
// runtime evidence; a metric that is zero because the code physically
// cannot produce it is an architectural guarantee proven by a build-time
// guard test, not an observation. Any surface rendering these must label
// them differently — see evidenceType.
export type MetricEvidenceType =
  /** Counted from real production rows. A number here is an observation. */
  | 'runtime_measured'
  /** Zero because the code path cannot exist, enforced by a guard test.
   *  NOT an observation — never render this as "0 observed in production". */
  | 'architectural_guarantee';

export interface MetricDefinition {
  name: string;
  formula: string;
  sourceTable: string;
  denominator: string;
  timezone: string;
  window: string;
  knownLimitations: string;
  evidenceType: MetricEvidenceType;
  /** For architectural_guarantee metrics: what actually enforces it. */
  enforcedBy?: string;
  /**
   * WHICH POPULATION this metric counts. Required, never inferred — the
   * 111-vs-110 production discrepancy on 16 Aug happened precisely because
   * two surfaces used the word "reachable" over two different populations
   * with nothing forcing either to say which. Metrics that count
   * notification rows rather than students carry 'all_student_rows' with an
   * explanatory note in knownLimitations.
   */
  audience: AudienceName;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  permission_granted: {
    name: 'permission_granted',
    formula: "count(*) where notif_prefs->>'push' = 'true'",
    sourceTable: 'profiles',
    denominator: 'all non-test, non-demo students with role=student',
    timezone: 'n/a (point-in-time count)',
    window: 'current state, no time window',
    knownLimitations: 'A stored preference, not live browser Notification.permission — see classifyNotificationState doc comment for why that is deliberate, not a gap.',
    evidenceType: 'runtime_measured',
    audience: 'production_students',
  },
  active_subscription: {
    name: 'active_subscription',
    formula: 'count(*) where push_subscription is not null',
    sourceTable: 'profiles',
    denominator: 'same pool as permission_granted',
    timezone: 'n/a',
    window: 'current state',
    knownLimitations: 'A stored subscription blob existing does not itself prove the endpoint is still valid at the provider — only a real send attempt (accepted or 410/404) proves that.',
    evidenceType: 'runtime_measured',
    audience: 'production_students',
  },
  reachable: {
    name: 'reachable',
    formula: 'count(*) where permission_granted AND active_subscription',
    sourceTable: 'profiles (derived via classifyNotificationState)',
    denominator: 'permission_granted count',
    timezone: 'n/a',
    window: 'current state',
    knownLimitations: 'Same caveat as active_subscription — this is "has a stored, unproven-dead subscription", not a delivery guarantee. RECONCILED 16 Aug against the first real cron run post-deploy: /api/cron/daily-heartbeat reported reachable=111 where this metric says 110. Not a bug in either — that cron deliberately KEEPS test accounts in scope (its own comment: "this cron IS the student experience", the founder tests as a student) while this metric excludes them, and exactly 1 test account currently holds a live subscription. Any surface showing both numbers must label them differently; they answer different questions.',
    evidenceType: 'runtime_measured',
    audience: 'production_students',
  },
  provider_dead: {
    name: 'provider_dead',
    formula: 'count(*) where push_died_at is not null AND push_subscription is null',
    sourceTable: 'profiles',
    denominator: 'permission_granted count',
    timezone: 'n/a',
    window: 'current state (push_died_at is a lifetime marker, cleared on resubscribe)',
    knownLimitations: 'Requires a real HTTP 410/404 on record — NEVER inferred from subscription absence alone (see notification-state.ts, Installment 1/4 fix).',
    evidenceType: 'runtime_measured',
    audience: 'production_students',
  },
  recovery_required: {
    name: 'recovery_required',
    formula: "classifyRecovery(...) === 'recovery_required'",
    sourceTable: 'profiles (push_recovery_attempted_at, push_recovery_last_error)',
    denominator: 'permission_granted count',
    timezone: 'n/a',
    window: 'current state',
    knownLimitations: 'None known — this is the P0 number per the founder\'s own priority order and is deliberately never allowed to auto-resolve to healthy.',
    evidenceType: 'runtime_measured',
    audience: 'production_students',
  },
  eligible: {
    name: 'eligible',
    formula: 'per-cron: the candidate set BEFORE any budget/dedup/preference gate — defined by each notification-producing cron\'s own selection query',
    sourceTable: 'varies per cron (profiles + feature tables)',
    denominator: 'n/a — this IS the denominator for send_attempted',
    timezone: 'Asia/Kolkata for all cron-window logic',
    window: 'per cron invocation',
    knownLimitations: 'Not centrally computed — each cron\'s own eligibility logic is the source of truth for what "eligible" means for that cron, and cron_runs.result now records the count where the cron reports one.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  send_attempted: {
    name: 'send_attempted',
    formula: "count(*) where notifications.send_status is not null (created, provider_accepted, or failed)",
    sourceTable: 'notifications',
    denominator: 'n/a',
    timezone: 'Asia/Kolkata for window filters',
    window: 'caller-specified',
    knownLimitations: 'send_status only exists on rows created after the Installment 1 dispatch() fix (16 Aug) — earlier rows have send_status = null and are excluded, not miscounted as failures.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  provider_accepted: {
    name: 'provider_accepted',
    formula: "count(*) where notifications.send_status = 'provider_accepted' (equivalently pushed_at is not null)",
    sourceTable: 'notifications',
    denominator: 'send_attempted count in the same window',
    timezone: 'Asia/Kolkata',
    window: 'caller-specified',
    knownLimitations: 'This is PROVIDER acceptance, not device delivery — never call this "delivered".',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  provider_failed: {
    name: 'provider_failed',
    formula: "count(*) where notifications.send_status = 'failed'",
    sourceTable: 'notifications',
    denominator: 'send_attempted count in the same window',
    timezone: 'Asia/Kolkata',
    window: 'caller-specified',
    knownLimitations: 'send_error carries the real reason (send_failed_410, vapid_not_configured, etc.) — always break down by reason, never report this as one undifferentiated number.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  device_received: {
    name: 'device_received',
    formula: 'count(*) where notifications.received_at is not null',
    sourceTable: 'notifications',
    denominator: 'provider_accepted count in the same window',
    timezone: 'Asia/Kolkata',
    window: 'caller-specified',
    knownLimitations: 'Requires the device to be online and the SW to successfully beacon back (retried once as of Installment 3) — absence does NOT mean failed delivery, see delivery_unknown.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  delivery_unknown: {
    name: 'delivery_unknown',
    formula: 'provider_accepted count MINUS device_received count',
    sourceTable: 'notifications',
    denominator: 'provider_accepted count in the same window',
    timezone: 'Asia/Kolkata',
    window: 'caller-specified',
    knownLimitations: 'This is the honest bucket for "we cannot prove either way" — NEVER collapsed into provider_accepted="delivered" and never called "failed".',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  clicked: {
    name: 'clicked',
    formula: 'count(*) where notifications.clicked_at is not null',
    sourceTable: 'notifications',
    denominator: 'device_received count in the same window (a click without a proven receipt is possible — the receipt beacon can itself fail — but a receipt is the honest denominator for "of what we know arrived, how much got tapped")',
    timezone: 'Asia/Kolkata',
    window: 'caller-specified',
    knownLimitations: 'The click-race fix (Installment 1) means clicked_at no longer requires pushed_at to already be set — a small number of clicks may now be recorded with pushed_at still null in a genuine race; this is correct, not a bug.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  app_opened: {
    name: 'app_opened',
    formula: 'count(*) where notifications.app_opened_at is not null',
    sourceTable: 'notifications',
    denominator: 'clicked count in the same window',
    timezone: 'Asia/Kolkata',
    window: 'caller-specified',
    knownLimitations: 'Only set by an explicit signal carrying this notification\'s own id (Installment 4) — never inferred from generic app activity. A student who tapped but whose browser session never re-delivered the postMessage/URL param (e.g. a crashed cold start) will show clicked without app_opened — an honest gap, not miscounted.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  action_completed: {
    name: 'action_completed',
    formula: "classifyActionAttribution(...) — see action-attribution.ts. NEVER emits 'acted', only 'correlated' | 'not_attributed' | 'unknown'",
    sourceTable: 'notifications joined against the relevant completion table per expected_action type',
    denominator: 'app_opened count in the same window',
    timezone: 'Asia/Kolkata',
    window: 'a 30-minute default correlation window past app_opened_at',
    knownLimitations: 'NOT MEASURABLE as a hard causal number for any expected_action type — this codebase does not thread the notification id through action-completion call sites. Only "correlated" (strong temporal link) is ever reported; "acted" is never claimed.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  duplicate_suppressed: {
    name: 'duplicate_suppressed',
    formula: "count(*) where dispatch() returned 'duplicate_suppressed' (Postgres 23505 on the once-per-day unique index) OR a decision-engine-level pre-check skip",
    sourceTable: 'notification-os.ts dispatch() return value, not separately persisted per-attempt',
    denominator: 'n/a',
    timezone: 'Asia/Kolkata (the unique index is keyed on IST calendar day)',
    window: 'caller-specified',
    knownLimitations: 'Not currently written to its own table — only observable via each cron\'s own returned counts, or cron_runs.result where wired. A dedicated duplicate-attempt log is not built this pass.',
    evidenceType: 'runtime_measured',
    audience: 'all_student_rows',
  },
  untracked_send: {
    name: 'untracked_send',
    formula: 'a real push send with no matching notifications row — structurally impossible as of Installment 1 (send-boundary.guard.test.ts enforces one importer of the push transport, and its notifId parameter is required, not optional)',
    sourceTable: 'n/a — this is a build-time guarantee, not a runtime query',
    denominator: 'n/a',
    timezone: 'n/a',
    window: 'n/a',
    knownLimitations: 'Proven by static analysis (the guard test), not by a runtime count — there is nothing to count because the code path cannot exist.',
    evidenceType: 'architectural_guarantee',
    audience: 'all_student_rows',
    enforcedBy: 'src/lib/send-boundary.guard.test.ts — source-scan guard: exactly one file may import the push transport, and its notifId parameter is required, not optional. Build fails otherwise.',
  },
  consent_violation: {
    name: 'consent_violation',
    formula: "dispatch() calls where opts.prefs.push !== true but the push transport ran anyway — structurally impossible: the push branch in dispatch() is gated on opts.prefs.push === true",
    sourceTable: 'n/a — enforced in code (notification-os.ts dispatch()), not measured after the fact',
    denominator: 'n/a',
    timezone: 'n/a',
    window: 'n/a',
    knownLimitations: 'The remaining risk is a CALLER passing a stale or hard-coded prefs object into dispatch() — Installment 1 removed the two hard-coded push:true overrides found; no runtime audit re-scans for a new one being reintroduced. A guard test for this specific pattern is not built this pass.',
    evidenceType: 'architectural_guarantee',
    audience: 'all_student_rows',
    enforcedBy: "notification-os.ts dispatch(): the push branch is gated on opts.prefs.push === true, so a send cannot occur without consent in the prefs object handed to it. NOT a runtime audit of callers — see knownLimitations.",
  },
};

/**
 * The founder's Installment 5 rule, enforced in code rather than in a
 * convention nobody can check: a surface rendering an
 * architectural_guarantee metric must never label it "0 observed in
 * production". This returns the honest label for a metric whose computed
 * value is zero, so every dashboard says the same true thing.
 */
export function zeroLabelFor(metric: MetricDefinition): string {
  return metric.evidenceType === 'architectural_guarantee'
    ? 'PREVENTED BY DESIGN (not a production observation)'
    : '0 observed';
}

export interface ReachabilitySnapshot {
  totalStudents: number;
  permissionGranted: number;
  permissionDenied: number;
  permissionNotRequested: number;
  active: number;
  reachable: number;
  providerDead: number;
  recoveryRequired: number;
  recoveryAttempted: number;
  recoveryFailed: number;
  recovered: number;
  reachablePct: number | null; // reachable / permissionGranted, null if permissionGranted = 0
  snapshotAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeReachabilitySnapshot(admin: any, now = () => new Date().toISOString()): Promise<ReachabilitySnapshot> {
  const { data } = await admin
    .from('profiles')
    .select('notif_prefs, push_subscription, push_died_at, push_recovery_attempted_at, push_recovery_last_error')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true);

  const rows = (data ?? []) as Array<{
    notif_prefs: Record<string, unknown> | null; push_subscription: unknown; push_died_at: string | null;
    push_recovery_attempted_at: string | null; push_recovery_last_error: string | null;
  }>;

  let permissionGranted = 0, permissionDenied = 0, permissionNotRequested = 0;
  let active = 0, reachable = 0, providerDead = 0;
  let recoveryRequired = 0, recoveryAttempted = 0, recoveryFailed = 0, recovered = 0;

  for (const r of rows) {
    const prefs = r.notif_prefs ?? {};
    const input: NotificationStateInput = {
      prefsPush: prefs.push === true,
      wasPrompted: prefs.push_prompted === true || prefs.push_reprompted === true,
      hasSubscription: r.push_subscription != null,
      diedAt: r.push_died_at,
    };
    const state = classifyNotificationState(input);
    if (state.permission === 'granted') permissionGranted++;
    else if (state.permission === 'denied') permissionDenied++;
    else permissionNotRequested++;

    if (state.subscription === 'active') active++;
    if (state.permission === 'granted' && state.subscription === 'active') reachable++;
    if (state.subscription === 'provider_dead') providerDead++;

    const recovery = classifyRecovery({
      permission: state.permission, subscription: state.subscription,
      recoveryAttemptedAt: r.push_recovery_attempted_at, recoveryLastError: r.push_recovery_last_error,
    });
    if (recovery === 'recovery_required') recoveryRequired++;
    else if (recovery === 'recovery_attempted') recoveryAttempted++;
    else if (recovery === 'recovery_failed') recoveryFailed++;
    else if (recovery === 'recovered') recovered++;
  }

  return {
    totalStudents: rows.length,
    permissionGranted, permissionDenied, permissionNotRequested,
    active, reachable, providerDead,
    recoveryRequired, recoveryAttempted, recoveryFailed, recovered,
    reachablePct: permissionGranted > 0 ? Math.round((reachable / permissionGranted) * 1000) / 10 : null,
    snapshotAt: now(),
  };
}
