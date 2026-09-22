import { COMPANION_SLOTS, companionType } from './companion';

// ── WHAT WE STOP KEEPING IN THE TRAY, AND WHY IT IS SAFE ────────────────────
//
// Measured 22 Sep 2026 against production. The database is 431 MB of a 500 MB
// free-tier ceiling and grows ~3.9 MB a day: writes start failing around
// 10 October, and when they do a student cannot log study.
//
// `notifications` is 106.7 MB of that and the fastest-growing table we have —
// 73 MB on 7 Sep, 88 on 13 Sep, 106.7 today, roughly 57% of all growth. The
// telemetry sweep cannot touch it and should not: the same table holds
// payment receipts, session reminders and buddy escalations.
//
// But the growth is not the table, it is one feature inside it. 128,537 of
// 161,956 rows (79%) are the Study Companion's four daily slots, and the
// shape of those rows is the whole argument:
//
//   in_app, send_status 'created', pushed_at null      20,921 rows / 7 days
//     → 754 students who have no push subscription. The row is written, it
//       is never sent, and it waits in a tray they do not open. Read: ZERO.
//   pushed (provider_accepted or unknown)               4,849 rows / 7 days
//     → 195 students who actually receive the cadence.
//   failed                                              4,069 rows / 7 days
//
// Across fourteen days the entire cadence produced 128 reads and 48 clicks.
//
// THE POLICY IS PER DELIVERY HALF, and the default is KEEP. A notification
// type nobody names below is kept forever; only the Study Companion is ever
// swept, and the DATABASE enforces that (migration 20260922a refuses a type
// that does not match `companion_%`), not this file. Adding a new
// notification type therefore cannot cost you data by accident.
//
// The two halves get different windows because they have different readers,
// and that distinction is the reason this is not one rule with one number.

export type DeliveryHalf = 'pushed' | 'unpushed';

export interface NotificationRetentionRule {
  /** Every element must match `companion_%`; the database re-checks. */
  types: readonly string[];
  delivery: DeliveryHalf;
  keepDays: number;
  /** The reader window this survives, in one sentence. Not decoration. */
  because: string;
}

/**
 * All nine slots, live and retired. The five retired ones stopped being
 * written on 27 July 2026 but their rows are still here, and there is no
 * reason to keep an unsent notification from a cadence that no longer runs.
 */
export const SWEEPABLE_COMPANION_TYPES: readonly string[] = COMPANION_SLOTS.map(companionType);

/**
 * The student's bell loads the last 20 notifications, newest first, with no
 * time filter (`components/notification-bell.tsx`). A student on the live
 * cadence receives four a day, so twenty rows is FIVE DAYS of tray. This is
 * the shortest-horizon reader that can see an unpushed row at all, and the
 * 14-day window below is it with nearly three times over.
 */
export const BELL_PAGE_SIZE = 20;

/**
 * `student-360.ts` shows the founder a student's last 200 PUSHED
 * notifications, no time filter. At the measured ~2.9 pushed rows a day for a
 * student who receives the cadence, 200 rows is about ten weeks — so the
 * 45-day pushed window below is the real constraint on that surface, and it
 * still leaves a month and a half of per-student push history to diagnose from.
 */
export const STUDENT_360_PUSHED_LIMIT = 200;

/** The database refuses a cutoff younger than this (migration 20260922a). */
export const NOTIFICATION_SWEEP_MIN_KEEP_DAYS = 14;

export const NOTIFICATION_RETENTION_RULES: readonly NotificationRetentionRule[] = [
  {
    types: SWEEPABLE_COMPANION_TYPES,
    delivery: 'unpushed',
    keepDays: 14,
    because:
      `Never left the building — no endpoint, no push, no receipt, no click. The only reader that can ` +
      `see one is the student's bell, which shows ${BELL_PAGE_SIZE} rows — five days at four a day.`,
  },
  {
    types: SWEEPABLE_COMPANION_TYPES,
    delivery: 'pushed',
    keepDays: 45,
    because:
      `Delivery analytics (momentum, mission-queue, notification-health, call-queue) all read seven days ` +
      `or less; student-360 reads the last ${STUDENT_360_PUSHED_LIMIT} pushed rows per student with no ` +
      `time filter, and 45 days keeps a month and a half of that.`,
  },
];

/**
 * Off unless switched on, which is the opposite of the telemetry sweep.
 *
 * That asymmetry is deliberate and it is not timidity. Deleting a `tap` event
 * changes nothing anyone can see. Deleting a notification changes two numbers
 * on a student's home screen — the bell's unread count (`chat-unread.ts`,
 * lifetime, unfiltered) and "N reminders sent" on the Value Proof card
 * (`student/tracker/page.tsx`, likewise lifetime). Measured on 22 Sep: the
 * first run would touch 942 students and move that number from an average of
 * 148 to 88.
 *
 * Both counts are arguably wrong today — they count notifications that were
 * written but never sent, so a student with no push subscription is told about
 * 148 reminders they never received. Sweeping makes them MORE honest. But
 * "more honest" is a product decision and this is a capacity fix, so the code
 * ships inert and the founder throws the switch:
 *
 *   insert into server_config (key, value) values ('NOTIFICATION_RETENTION_ENABLED', 'on')
 *     on conflict (key) do update set value = excluded.value;
 */
export const NOTIFICATION_RETENTION_ENABLED_KEY = 'NOTIFICATION_RETENTION_ENABLED';

export const notificationSweepEnabled = (v: string | null): boolean =>
  v != null && ['true', '1', 'on', 'yes'].includes(v.trim().toLowerCase());
