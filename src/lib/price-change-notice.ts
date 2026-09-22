import { PLANS } from '@/lib/plans';

// ── TELLING STUDENTS THE PRICE CHANGED, DAY BY DAY ──────────────────────────
//
// On 22 Sep 2026 Till CAT moved from its old price to ₹1,599 because the
// calendar had made the old one irrational — with ~69 days to the exam it cost
// more than the two months of ₹999 it covered. Founder: "Also share the same
// with all students."
//
// WHAT THIS IS, AND WHAT IT REFUSES TO BE. The founder's own framing is the
// spec: "information symmetry, not a marketing campaign." A student who would
// have found out by chance should not have an advantage over one who would
// not. That makes this a NOTICE, and it is built to be incapable of becoming
// anything else:
//
//   · No urgency. No "limited time", no "offer", no countdown, no "before it
//     goes back up". NOTIFICATION-OS forbids manufactured urgency and the
//     founder refused it independently before being asked.
//   · One price, not a price list. Only the number that actually MOVED is
//     stated. Reciting all three prices to someone who did not ask is a
//     catalogue, and a catalogue is a campaign.
//   · The old price is not quoted. "It was ₹2,599" is an anchor — it invites
//     the student to value the drop rather than to know the price — and to a
//     student who never saw the old number it is pure salesmanship. It also
//     would put a retired price back into active code, which the price
//     authority guard now forbids outright.
//   · Nothing internal. Not the counsellor incentive, not the engagement
//     letter, not the call queue. Those are three other audiences.
//
// WHY DAY-WISE. Founder: "only send notification for pricing day wise...not
// all pricing at once." Two reasons it is also the correct engineering call:
//
//   1. Incident #102 is still recovering. Device confirmation is climbing back
//      from ~12% toward ~62% and display_status has never once been non-null.
//      A single blast to the whole roster on that infrastructure produces one
//      undiagnosable number; a bounded daily batch produces a readable series.
//   2. A send that cannot be stopped is a send that cannot be corrected. Seven
//      days of small batches can be halted after the first if the copy is
//      wrong. One blast cannot.
//
// The price itself is never typed here — it is read from the authority, so
// this file cannot be the place a price goes stale.

/** The notification type. Registered in event-policy with its own ladder. */
export const PRICE_NOTICE_TYPE = 'price_change';

/**
 * WHICH revision this is, carried in the row's `data` and deduped on.
 *
 * Deliberately not keyed on the type alone. A student who was told about this
 * change must never be told twice — but they must still be reachable for the
 * NEXT change, and `type = 'price_change' already exists` would silence that
 * one forever. The key changes when the price does.
 */
export const PRICE_REVISION_KEY = 'tillcat-2026-09-22';

/**
 * Students told per day.
 *
 * ~1,220 real students at 200/day is a week. Small enough that a bad batch is
 * a bad day rather than a bad roster, and large enough that the last student
 * hears about it while it is still news.
 */
export const PRICE_NOTICE_DAILY_CAP = 200;

/** The notice itself. Prices come from the authority; none is typed here. */
export function priceNoticeContent(): { title: string; body: string; url: string } {
  return {
    title: `${PLANS.tillcat.label} plan is now ${PLANS.tillcat.display}`,
    // Reassurance, not a pitch. The one question a paying student actually has
    // on reading this is "what happens to what I already bought", and the
    // answer is nothing — so it is answered in the notice rather than in a
    // support conversation the next morning.
    body: `That is the price from now on. Anything you have already paid for is unaffected.`,
    url: '/pricing',
  };
}

/**
 * Who gets told today. PURE — ids in, ids out, no clock and no I/O, so every
 * rule below is a test rather than an argument.
 *
 * Deterministic ORDER is the load-bearing part. The batch is a stable slice of
 * a sorted list minus those already told, so a run that dies halfway resumes
 * exactly where it stopped, and a run that fires twice in one day tells the
 * same people rather than racing ahead through the roster.
 */
export function selectNoticeBatch(args: {
  candidateIds: string[];
  alreadyNotified: Iterable<string>;
  cap?: number;
}): string[] {
  const done = new Set(args.alreadyNotified);
  const cap = args.cap ?? PRICE_NOTICE_DAILY_CAP;
  if (cap <= 0) return [];
  return [...new Set(args.candidateIds)]
    .filter((id) => !done.has(id))
    .sort()
    .slice(0, cap);
}

/** True once every real student has been told — the cron can stop running. */
export function noticeComplete(candidateIds: string[], alreadyNotified: Iterable<string>): boolean {
  return selectNoticeBatch({ candidateIds, alreadyNotified, cap: 1 }).length === 0;
}

// ── The runner ──────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getRealStudents } from '@/lib/admin-filters';
import { readRowsForIds } from '@/lib/truth/batch';
import { isUnavailable } from '@/lib/truth/source';
import { dispatch } from '@/lib/notification-os';

export interface PriceNoticeRun {
  ok: boolean;
  dryRun: boolean;
  revision: string;
  /** Real students in the population. */
  population: number;
  /** Already told about THIS revision before this run. */
  alreadyTold: number;
  /** Chosen for today. */
  batch: number;
  sent: number;
  failed: number;
  /** True when nobody is left — the cron has finished its job. */
  complete: boolean;
  error?: string;
}

/**
 * One day's batch.
 *
 * THREE REFUSALS, each of which is the run failing rather than the run lying:
 *
 *  · A failed roster read throws out of getRealStudents. An empty population
 *    would read as "everyone has been told" and permanently end the rollout
 *    after telling nobody — Incident #65's shape, an absent value presenting
 *    itself as a valid one.
 *  · A failed read of who was already told aborts. Re-notifying a student
 *    because we could not remember telling them is the one failure this
 *    function exists to prevent.
 *  · A partial preferences read aborts the whole batch. A student whose prefs
 *    did not arrive would be pushed against unknown settings — silently
 *    notifying someone who turned push off. Same rule as the admin broadcast.
 *
 * One student's dispatch failure never stops the others: they are simply not
 * marked as told, so tomorrow's batch picks them up again.
 */
export async function runPriceChangeNotice(
  admin: any,
  opts: { dryRun?: boolean; cap?: number } = {},
): Promise<PriceNoticeRun> {
  const dryRun = opts.dryRun === true;
  const base: PriceNoticeRun = {
    ok: false, dryRun, revision: PRICE_REVISION_KEY,
    population: 0, alreadyTold: 0, batch: 0, sent: 0, failed: 0, complete: false,
  };

  const students = await getRealStudents(admin);
  const candidateIds = students.map((s) => s.id);
  base.population = candidateIds.length;

  // Who already knows. Keyed on the REVISION, not the type, so this change is
  // told once and the next change is still tellable.
  const told = await fetchAll<{ user_id: string }>(() => admin
    .from('notifications')
    .select('user_id')
    .eq('type', PRICE_NOTICE_TYPE)
    .eq('data->>revision', PRICE_REVISION_KEY));
  if (told.error) {
    return { ...base, error: `could not read who was already told (${told.error.message}) — refusing rather than risk telling someone twice` };
  }
  const alreadyNotified = new Set((told.data ?? []).map((r) => r.user_id));
  base.alreadyTold = alreadyNotified.size;

  const batch = selectNoticeBatch({ candidateIds, alreadyNotified, cap: opts.cap });
  base.batch = batch.length;
  if (batch.length === 0) return { ...base, ok: true, complete: true };

  if (dryRun) return { ...base, ok: true };

  // Bounded, all-or-nothing. An unbounded .in() here is a population-scaled
  // read on a path that mutates student state, and PostgREST puts the whole
  // id list in the URL.
  const prefsSource = await readRowsForIds<string, { id: string; notif_prefs: unknown }>(
    'profiles(price notice recipients)', batch,
    (chunk) => admin.from('profiles').select('id, notif_prefs').in('id', chunk),
  );
  if (isUnavailable(prefsSource)) {
    return { ...base, error: `could not read recipient preferences (${prefsSource.reason}) — batch refused rather than sent against unknown settings` };
  }
  const prefsById = new Map<string, Record<string, unknown>>(
    (prefsSource.state === 'value' ? prefsSource.value : [])
      .map((r) => [r.id, (r.notif_prefs as Record<string, unknown>) ?? {}]),
  );

  const { title, body, url } = priceNoticeContent();
  let sent = 0;
  let failed = 0;
  for (const userId of batch) {
    try {
      const outcome = await dispatch({
        userId,
        type: PRICE_NOTICE_TYPE,
        title, body, url,
        reason: `Till CAT price changed to ${PLANS.tillcat.display} — every student is told once, ${PRICE_NOTICE_DAILY_CAP}/day`,
        expectedAction: 'acknowledge',
        prefs: prefsById.get(userId) ?? {},
        // The dedupe key, written with the row it deduplicates. Without this
        // the next run cannot tell this student was told.
        data: { revision: PRICE_REVISION_KEY },
      });
      if (outcome === 'sent') sent++; else failed++;
    } catch {
      failed++;
    }
  }

  return {
    ...base, ok: true, sent, failed,
    complete: noticeComplete(candidateIds, new Set([...alreadyNotified, ...batch])),
  };
}
