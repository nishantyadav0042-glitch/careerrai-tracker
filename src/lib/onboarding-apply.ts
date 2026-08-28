import { setDailyHours } from '@/lib/daily-hours';
import { validateCoverageMatrix, type MatrixEntry } from '@/lib/coverage-validate';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { isValidPushEndpoint } from '@/lib/push-validate';
import { registerSubscription } from '@/lib/push-subscription-registry';
import { isCovered } from '@/lib/coverage-status';

// ── THE ONE PLACE /start ANSWERS BECOME A STUDENT ───────────────────────────
//
// A student answers every onboarding question BEFORE any account exists. Those
// answers then have to survive whichever door they walk through — phone OTP or
// Continue with Google — and land identically either way.
//
// This module exists because they did not. The mapping lived inline inside
// verify-phone-otp as ~170 lines, so the OTP door applied it and the Google
// door did not: a student who answered all 53 topic questions and then chose
// Google arrived with an empty profile and was sent straight back through
// onboarding to answer them again. Copying the block into /auth/callback would
// have fixed that morning's bug and created two sets of business rules that
// drift the first time only one of them is edited — the shape of Incident #23.
//
// So there is ONE authority, and both doors call it. If a rule changes here it
// changes for every student, however they signed in.
//
// WHITELISTED, FIELD BY FIELD. The payload arrives from a browser and is
// therefore hostile input: every field is type-checked and range-bounded, and
// anything unrecognised is dropped rather than written. attempt_year is
// clamped to this year..+3 so a tampered payload cannot set an arbitrary
// countdown; percentiles, hours and array lengths are all bounded the same way.
//
// FIRST SIGNUP ONLY. Callers must apply this to a brand-new or stub profile
// and never to a returning student's real one — a replayed draft would
// otherwise overwrite months of real progress with a stale funnel answer. The
// guard belongs to the caller because only the caller knows whether the
// account it just touched already existed (Incident #42's lesson: a guard in
// the caller is not a guard in the callee, so callers are asserted by
// onboarding-authority.guard.test.ts rather than trusted).

/** Whitelisted answers from the pre-auth /start funnel. */
export interface OnboardingPayload {
  ambition_date?: unknown;
  attempt_year?: unknown;
  dream_colleges?: unknown;
  target_percentile?: unknown;
  hours_available?: unknown;
  self_study_hours?: unknown;
  coaching_enrolled?: unknown;
  is_repeater?: unknown;
  last_year_percentile?: unknown;
  had_buddy_last_year?: unknown;
  is_working_professional?: unknown;
  pain_points?: unknown;
  wants_mentor?: unknown;
  push_subscription?: unknown;
  push_prompted?: unknown;
  topic_matrix?: unknown;
  self_reported_weakest_section?: unknown;
  self_report_status?: unknown;
  onboarding_insight_section?: unknown;
  onboarding_insight_topic?: unknown;
  onboarding_insight_source?: unknown;
  onboarding_insight_root_cause?: unknown;
  onboarding_insight_recommend?: unknown;
}

export interface AppliedOnboarding {
  /** Profile columns written. Empty when the payload carried nothing usable. */
  fieldsWritten: string[];
  /** True once topic_coverage rows were accepted AND onboarding_completed set. */
  completed: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = { from: (table: string) => any };

/**
 * Apply one /start draft to one freshly created student.
 *
 * The caller MUST already have established that this profile is brand-new or a
 * stub. Best-effort by construction: the account exists and the session is
 * live before this runs, so nothing in here may throw a student out of a
 * signup that already succeeded.
 */
export async function applyOnboarding(
  admin: Admin,
  userId: string,
  onboarding: OnboardingPayload,
): Promise<AppliedOnboarding> {
  const profileUpdate: Record<string, unknown> = {};
  if (typeof onboarding.ambition_date === 'string') profileUpdate.syllabus_target_date = onboarding.ambition_date;
  // Which CAT they picked in the funnel. Bounded to this year..+3 so a
  // tampered payload can't set a countdown to an arbitrary date, and so a
  // 2027 aspirant stops being silently filed under this year's exam.
  if (typeof onboarding.attempt_year === 'number') {
    const thisYear = new Date().getFullYear();
    if (Number.isInteger(onboarding.attempt_year)
        && onboarding.attempt_year >= thisYear && onboarding.attempt_year <= thisYear + 3) {
      profileUpdate.attempt_year = onboarding.attempt_year;
    }
  }
  if (Array.isArray(onboarding.dream_colleges)) {
    profileUpdate.dream_colleges = onboarding.dream_colleges.filter((c): c is string => typeof c === 'string').slice(0, 3);
  }
  if (typeof onboarding.target_percentile === 'number' && onboarding.target_percentile >= 50 && onboarding.target_percentile <= 99) {
    profileUpdate.target_percentile = onboarding.target_percentile;
  }
  if (typeof onboarding.hours_available === 'number') {
    // Replaying what they entered pre-signup. Still their own number.
    // (Legacy clients mid-funnel may still send hours; accepted as before.)
    Object.assign(profileUpdate, setDailyHours(onboarding.hours_available, 'signup'));
  }
  if (typeof onboarding.self_study_hours === 'number') {
    // The normal-day self-study number, excluding coaching/college/work.
    // Same one writer as every other hours write. It is asked at signup
    // again (it was removed this morning) because the finish date cannot
    // be computed without it — but it no longer sizes the daily plan, so
    // an ambitious answer costs a date correction, not a broken day.
    Object.assign(profileUpdate, setDailyHours(onboarding.self_study_hours, 'signup'));
  }
  if (typeof onboarding.coaching_enrolled === 'boolean') profileUpdate.coaching_enrolled = onboarding.coaching_enrolled;
  if (typeof onboarding.is_repeater === 'boolean') profileUpdate.is_repeater = onboarding.is_repeater;
  // Repeater-only sales signal (founder, 23 Jul): last year's real
  // percentile + whether they had genuine expert support last time.
  if (typeof onboarding.last_year_percentile === 'number' && onboarding.last_year_percentile >= 0 && onboarding.last_year_percentile <= 99.99) {
    profileUpdate.last_year_percentile = onboarding.last_year_percentile;
  }
  if (typeof onboarding.had_buddy_last_year === 'boolean') profileUpdate.had_buddy_last_year = onboarding.had_buddy_last_year;
  // Identity Engine (LIS L1): capture whether they're working — the persona
  // that most changes the plan shape (was never asked, so a working student
  // like Pranav got a full-time-aspirant plan).
  if (typeof onboarding.is_working_professional === 'boolean') profileUpdate.is_working_professional = onboarding.is_working_professional;
  if (Array.isArray(onboarding.pain_points)) {
    profileUpdate.pain_points = onboarding.pain_points.filter((p): p is string => typeof p === 'string').slice(0, 2);
  }
  if (typeof onboarding.wants_mentor === 'boolean') profileUpdate.wants_mentor = onboarding.wants_mentor;

  // Weakest section — screen-weakest-section.tsx, added to THIS funnel
  // 15 Aug. Keyed on PRESENCE, not truthiness: "Not sure yet" is a real,
  // honest answer that submits null, and a truthiness check would drop it
  // silently and leave the student on the DILR default it exists to
  // replace (same rule the post-login modal already applies to this
  // exact field — onboarding-modal.tsx).
  if (onboarding && 'self_reported_weakest_section' in onboarding) {
    const v = (onboarding as Record<string, unknown>).self_reported_weakest_section;
    profileUpdate.self_reported_weakest_section =
      v === 'VARC' || v === 'DILR' || v === 'QA' ? v : null;
    // self_report_status makes "not sure" a first-class DB state instead
    // of an indistinguishable null (Preparation Insight Engine final
    // spec, Part M) — the DB CHECK constraint on profiles requires the
    // two columns agree, so this must always be written alongside the
    // section above, never independently.
    const status = (onboarding as Record<string, unknown>).self_report_status;
    profileUpdate.self_report_status =
      status === 'SELECTED_SECTION' || status === 'NOT_SURE_YET' ? status : null;
  }

  // The Insight→Plan handoff (final spec, Part J) — what Instant Insight
  // ACTUALLY showed this student, persisted so the real plan can later
  // be compared against it instead of the two silently diverging. Only
  // written when the screen actually had a real, actionable primary
  // finding (screen-instant-insight.tsx omits this object entirely for
  // a strength-only or insufficient-evidence hero).
  if (onboarding && 'onboarding_insight_section' in onboarding) {
    const o = onboarding as Record<string, unknown>;
    const sec = o.onboarding_insight_section;
    profileUpdate.onboarding_insight_section = sec === 'VARC' || sec === 'DILR' || sec === 'QA' ? sec : null;
    profileUpdate.onboarding_insight_topic = typeof o.onboarding_insight_topic === 'string' ? o.onboarding_insight_topic : null;
    const src = o.onboarding_insight_source;
    profileUpdate.onboarding_insight_source = src === 'student' || src === 'careerrai' ? src : null;
    profileUpdate.onboarding_insight_root_cause = typeof o.onboarding_insight_root_cause === 'string' ? o.onboarding_insight_root_cause : null;
    profileUpdate.onboarding_insight_recommend = typeof o.onboarding_insight_recommend === 'string' ? o.onboarding_insight_recommend : null;
  }

  // Same canonical registration the authenticated toggle uses
  // (the shared client-side subscribe path). This is the exact write that used to skip
  // push_subscribed_at — the field the health engine's subscription-age
  // math depends on — because this branch hand-wrote `{ push: true }` as
  // the whole notif_prefs column instead of going through it. Fixed 15
  // Aug. A brand-new signup has no existing prefs/subscribedAt to
  // preserve, so the merge is a no-op today, but it is no longer a
  // SEPARATE definition that could silently drift from the other one.
  const subscription = onboarding.push_subscription as { endpoint?: unknown } | null | undefined;
  if (subscription?.endpoint && isValidPushEndpoint(subscription.endpoint)) {
    const reg = registerSubscription(
      { notifPrefs: null, pushSubscribedAt: null },
      subscription,
      new Date().toISOString(),
      (onboarding as Record<string, unknown>).push_context
    );
    Object.assign(profileUpdate, reg);
  } else if (onboarding.push_prompted === true) {
    profileUpdate.notif_prefs = { push_prompted: true };
  }

  // A non-empty topic matrix is only ever sent once the /start wizard's
  // final mandatory step completed — the same signal the old post-login
  // Builder used to mark itself done.
  //
  // BUG FIX (audit, 14 July): onboarding_completed used to be flipped
  // true in THIS same profileUpdate, written BEFORE the coverage matrix
  // below was even validated — so a student whose matrix failed server
  // validation (or hit a transient DB error on the upsert) ended up with
  // onboarding_completed=true and ZERO coverage rows, and no way back
  // in (the pre-auth payload only replays for brand-new/stub profiles).
  // Now it's only set after the coverage write actually succeeds.
  const matrixOk = Array.isArray(onboarding.topic_matrix) && onboarding.topic_matrix.length > 0;

  let completedOnboarding = false;
  if (Object.keys(profileUpdate).length > 0) {
    await admin.from('profiles').update(profileUpdate).eq('id', userId);
  }

  if (matrixOk) {
    const matrix = onboarding.topic_matrix as MatrixEntry[];
    const problem = validateCoverageMatrix(matrix);
    if (!problem) {
      // Topics a student says they already covered BEFORE joining must get a
      // realistic revision schedule. Seeding them all at "now" makes the
      // engine treat them as freshly studied, so they'd never come due for
      // revision. Backdate the covered ones (practicing/revising/exam_ready)
      // so revision comes due STAGGERED over the first ~2.5 weeks — timely,
      // but no day-1 flood. not_started / learning keep "now".
      const now = Date.now();
      const coveredEntries = matrix.filter((e) => isCovered(e.status));
      const SPREAD_DAYS = 18;
      const rows = matrix.map((e) => {
        let updatedAt = new Date(now).toISOString();
        if (isCovered(e.status)) {
          const idx = coveredEntries.indexOf(e);
          const dueInDays = coveredEntries.length > 1
            ? Math.round((idx / (coveredEntries.length - 1)) * SPREAD_DAYS)
            : 0;
          const freq = TOPIC_METADATA[e.topic!]?.revisionFrequencyDays ?? 14;
          // updated_at = now − (freq − dueInDays) → comes revision-due ~dueInDays from now
          const backdate = Math.max(0, freq - dueInDays);
          updatedAt = new Date(now - backdate * 86_400_000).toISOString();
        }
        return { student_id: userId, section: e.section!, topic: e.topic!, status: e.status!, updated_at: updatedAt };
      });
      const { error: coverageError } = await admin.from('topic_coverage').upsert(rows, { onConflict: 'student_id,section,topic' });
      if (coverageError) {
        console.error('[onboarding-apply] coverage upsert failed, NOT marking onboarding complete:', coverageError.message);
      } else {
        await admin.from('profiles').update({
          onboarding_completed: true,
          onboarding_last_activity_at: new Date().toISOString(),
        }).eq('id', userId);
        completedOnboarding = true;
      }
    } else {
      console.error('[onboarding-apply] rejected pre-auth coverage matrix, NOT marking onboarding complete:', problem);
    }
  }
  return {
    fieldsWritten: Object.keys(profileUpdate),
    completed: completedOnboarding,
  };
}
