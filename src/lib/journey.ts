// Client-side journey tracking. Every event carries the context that the old
// telemetry lacked: display_mode (installed app vs browser tab) + which browser
// + platform. This is what lets us see, per student, whether push was granted
// in the real app or a browser tab (the root cause of undelivered notifications).
//
// Best-effort and non-blocking by design: events are queued and flushed with
// keepalive/sendBeacon, and every failure is swallowed. Tracking must never
// slow down or break the app.

export type DisplayMode = 'standalone' | 'twa' | 'ios_app' | 'browser' | 'unknown';

/**
 * Decide the display mode from explicit signals. Pure, so it can be tested.
 *
 * The bug this replaces, found 9 Aug: `twa` was decided by
 * `document.referrer.startsWith('android-app://')` ALONE. That referrer is set
 * when a link is opened from ANY Android app — WhatsApp, Instagram, Gmail —
 * and WhatsApp is our main outreach channel. So every Android student who
 * tapped a careerrai.in link in WhatsApp was recorded as a Play Store wrapper
 * user, on a day when the Android app was not on the Play Store at all.
 *
 * Eleven "TWA" people were counted that way. Their sessions start at /welcome,
 * /start, /login and /set-password; a genuine wrapper launch always begins at
 * its start URL, `/student/tracker?source=twa`.
 *
 * The `cr_store` cookie is the reliable signal: the server stamps it from
 * `?source=twa|ios` and it survives the logged-out redirect that eats the query
 * param. Only that cookie proves a wrapper.
 *
 * `ios_app` is new. The iOS App Store build went live and was invisible here —
 * a WKWebView never matches `display-mode: standalone`, so every App Store
 * session was being filed as a plain browser tab, and there was no way to
 * measure the app at all.
 */
export function displayModeFrom(s: {
  storeSource: 'twa' | 'ios' | null;
  standalone: boolean;
}): DisplayMode {
  if (s.storeSource === 'twa') return 'twa';
  if (s.storeSource === 'ios') return 'ios_app';
  return s.standalone ? 'standalone' : 'browser';
}

// Reuse the same anon cookie the /start funnel already sets, so a visitor's
// pre-signup clicks and their post-signup student events share one identity.
function getAnonId(): string {
  try {
    const m = document.cookie.match(/(?:^|; )cr_anon=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    document.cookie = `cr_anon=${id}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    return id;
  } catch {
    return 'anon';
  }
}

// One id per browsing session (cleared when the tab/app is closed).
function getSessionId(): string {
  try {
    const k = 'cr_sid';
    let id = sessionStorage.getItem(k);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `s${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(k, id);
    }
    return id;
  } catch {
    return 'sess';
  }
}

export function detectDisplayMode(): DisplayMode {
  if (typeof window === 'undefined') return 'unknown';
  try {
    // The `cr_store` cookie, never document.referrer — see displayModeFrom.
    const raw = document.cookie.match(/(?:^|;\s*)cr_store=([^;]+)/)?.[1] ?? null;
    const storeSource = raw === 'twa' || raw === 'ios' ? raw : null;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
    return displayModeFrom({ storeSource, standalone });
  } catch {
    return 'unknown';
  }
}

export function detectBrowser(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // Order matters: in-app webviews first (they also contain "Chrome"/"Safari").
  if (/(FBAN|FBAV|Instagram)/i.test(ua)) return 'instagram';
  if (/Line\//i.test(ua)) return 'line';
  if (/MicroMessenger/i.test(ua)) return 'wechat';
  if (/(FB_IAB|FB4A)/i.test(ua)) return 'facebook';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/EdgA?\//i.test(ua)) return 'edge';
  if (/(FxiOS|Firefox)/i.test(ua)) return 'firefox';
  if (/(OPR|OPX|OperaMini)/i.test(ua)) return 'opera';
  if (/UCBrowser/i.test(ua)) return 'uc';
  if (/CriOS|Chrome/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  if (/; wv\)/i.test(ua)) return 'android-webview';
  return 'other';
}

export function detectPlatform(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

interface QueuedEvent {
  event: string;
  props: Record<string, unknown>;
  path: string;
  ts: number;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function context() {
  return {
    anon: getAnonId(),
    sessionId: getSessionId(),
    displayMode: detectDisplayMode(),
    browser: detectBrowser(),
    platform: detectPlatform(),
  };
}

// Days since this device first opened CareerRai (cohort/retention axis).
function daysSinceInstall(): number {
  try {
    const m = document.cookie.match(/(?:^|; )cr_first_seen=([^;]+)/);
    let first: number;
    if (m) {
      first = Number(m[1]);
    } else {
      first = Date.now();
      document.cookie = `cr_first_seen=${first}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
    }
    return Math.max(0, Math.floor((Date.now() - first) / 86_400_000));
  } catch {
    return 0;
  }
}

// Per-flush enrichment merged into every event server-side (see the ingest).
// Cheap, device/session-level context that would be wasteful to repeat inline.
function envCtx() {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  return {
    vw: typeof window !== 'undefined' ? window.innerWidth : null,
    vh: typeof window !== 'undefined' ? window.innerHeight : null,
    net: nav.connection?.effectiveType ?? null,
    dayN: daysSinceInstall(),
    appv: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
  };
}

function flush(useBeacon = false): void {
  if (typeof window === 'undefined' || queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const payload = JSON.stringify({ ...context(), ctx: envCtx(), events: batch });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/events/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* best effort */
  }
}

// Monotonic within a page load — lets the event stream be replayed in exact
// order even when timestamps collide (autocapture fires many events per ms).
let seq = 0;

/** Record one journey event. Fire-and-forget; batched ~1s, flushed on hide. */
// ── THE event-name registry ─────────────────────────────────────────────────
// Every trackable event, as a closed union. Before this existed, track() took
// any string: 58 free-form names had accumulated, including double-counted
// and synonym pairs ('coverage_reviewed' fired client AND server; 
// 'timetable_saved' vs 'timetable_confirmed'). A typo now fails the build
// instead of silently minting a new metric. Add new events HERE first.
export type EventName =
  // ── TEMPORARY, 25 Aug: the WKWebView escape probe ────────────────────────
  // Answers one question — does window.open() from the iOS App Store build
  // reach real Safari or another WKWebView? Delete both members, and
  // src/app/probe/*, once the answer is recorded.
  | 'probe_escape_origin' | 'probe_escape_landed'
  | 'app_open' | 'screen_view' | 'screen_exit' | 'tap'
  // ── The signup + session funnel (26 Aug, Event OS Track B) ───────────────
  // The forensic auth audit found this registry had NOT ONE signup, login,
  // OTP or session event: `app_open` was the earliest thing measured, and it
  // is post-auth. So every claim about onboarding friction — "the phone step
  // costs us students", "OTP retries are hurting conversion" — was an
  // opinion nobody could check, and the OTP retry rate (830 sends against
  // 630 signups, 1.32x) was only visible as a bill.
  //
  // These name the steps a person actually walks. Deliberately NOT one
  // 'signup' event: the whole value is knowing WHICH step loses them.
  | 'auth_identity_started'      // tapped a sign-in door (which one, in props)
  | 'auth_identity_completed'    // identity established
  | 'auth_otp_requested'         // an OTP was asked for
  | 'auth_otp_resent'            // ...and asked for again — the 1.32x, measured
  | 'auth_otp_verified'          // the code worked
  | 'auth_otp_failed'            // it did not (reason in props, never the code)
  | 'auth_phone_step_shown'      // the phone/address step appeared
  | 'auth_phone_step_completed'  // ...and was finished
  | 'auth_phone_step_abandoned'  // ...or left behind: the founder's open question
  | 'auth_account_linked'        // a second identity joined an existing account
  | 'auth_link_refused'          // ...or was refused (duplicate-account defence)
  | 'auth_session_lost'          // a live session vanished without a logout
  | 'auth_logout'                // a deliberate logout (scope in props)
  | 'sample_insight_shown'
  | 'log_open' | 'log_blocked' | 'log_error' | 'log_dismissed' | 'daily_log'
  // G10B: the outcome of every complete-task call made by the INTEGRATED log
  // fan-out. That call site is the only one that cannot tell success from an
  // HTTP error — the plan-card tick already checks res.ok and shows the
  // student the failure. Observability only; nothing retries or reorders.
  | 'completion_write'
  | 'first_log_prompt'
  // The daily "Rai noticed" card on Home (19 Aug). shown fires once per
  // render-day, dismissed on the deliberate close -- the pair that lets the
  // funnel distinguish "delivered" from "read", which the old 7-second toast
  // could not (it marked itself seen on mount, so delivery and reading were
  // indistinguishable and both unmeasurable).
  | 'insight_shown' | 'insight_dismissed'
  // Onboarding's closing log-practice screen (13 Aug): props carry how many of
  // the 3 practice tasks were marked and whether it was skipped — the cohort
  // key for "does practising the log move onboarded → first real log".
  | 'log_tour_done'
  | 'install_click' | 'install_already' | 'install_dismissed' | 'install_escape'
  // The ONLY event in this list that is proof of an install rather than of an
  // intention to install. The browser fires `appinstalled` after the install
  // actually completes, whatever route was used. It was handled client-side
  // only — it flipped a button's label and redirected — so it never reached
  // this server, and the lifetime install count was therefore unknowable from
  // our own data. Recorded from 29 Aug; it says nothing about installs that
  // happened before that date, and nothing about uninstalls, because the
  // platform provides no uninstall event to listen for.
  | 'app_installed'
  | 'install_guide_shown' | 'install_prompt_result' | 'install_prompt_shown'
  // iOS since the native app shipped: the App Store hand-off, and the quiet
  // Add-to-Home-Screen fallback for anyone the App Store fails.
  | 'install_app_store' | 'install_a2hs_fallback'
  | 'install_prompt_unavailable' | 'install_unsupported'
  | 'meta_escape_click' | 'meta_escape_dismissed' | 'meta_escape_shown'
  | 'pay_blocked_flag_off' | 'pay_checkout_opened' | 'pay_dismissed'
  // The single session — its own funnel, because it converts a FREE
  // student and we need to see it separately from subscription checkout.
  | 'session_book_click' | 'session_pay_dismissed' | 'session_pay_success'
  // The WhatsApp opt-in, as its own funnel: join vs skip is the only way to
  // answer whether day-2 return actually moves for joiners.
  | 'whatsapp_join_click' | 'whatsapp_skip'
  // Proof-before-ask on the install screen. Pairs with install_click to answer
  // the only question that matters: does seeing the real plan move installs?
  | 'plan_snapshot_shown'
  | 'pay_escape_browser' | 'pay_exception' | 'pay_failed' | 'pay_free_unlock'
  // Full-page redirect checkout (installed iOS PWA). Distinct from
  // pay_escape_browser: nothing escapes, this page navigates and comes back.
  | 'pay_redirect'
  | 'pay_order_created' | 'pay_order_failed' | 'pay_script_failed'
  | 'pay_success_callback'
  | 'push_enabled' | 'shield_intro_shown'
  | 'buddy_plan_click' | 'buddy_unlock_open'
  // Independence Day campaign (12 Aug): one funnel, measured end to end —
  // card seen → clicked → offer page → checkout (pay_* above carries the rest).
  | 'campaign_card_seen' | 'campaign_card_click' | 'campaign_card_dismissed'
  | 'campaign_offer_view' | 'campaign_offer_cta'
  | 'coverage_review_shown' | 'coverage_reviewed'
  | 'timetable_upload_start' | 'timetable_saved' | 'timetable_parse_failed'
  | 'timetable_dismissed'
  | 'busy_day_used'
  | 'next_action_started' | 'next_action_done' | 'next_action_expanded'
  | 'prep_index_expanded' | 'evidence_logged'
  | 'evidence_announce_shown' | 'evidence_announce_dismissed'
  | 'challenge_opened' | 'challenge_answered' | 'challenge_shared'
  | 'coaching_progress_logged'
  | 'daily_pick_open' | 'community_voted' | 'community_submitted'
  // Which KIND of thing Daily Pick served, and whether it landed. The 12 Aug
  // zero-vote day took an hour of SQL to diagnose because the surface recorded
  // that it was opened but never what it had offered — so a low-engagement day
  // was indistinguishable from a day the rotation served something nobody
  // wanted. These two make that a query instead of an investigation.
  | 'daily_slot_served' | 'daily_slot_reflected'
  // Impressions of the daily rotation's winner — without this the next "are
  // students really picking anything?" question is unanswerable again.
  | 'top_pick_shown'
  // The Share funnel's three rungs. 'opened' alone could not tell a student
  // who looked and changed their mind from one whose send never completed —
  // 11 students opened the sheet and 0 submitted, and the difference between
  // "not compelling" and "broken" was unobservable. 'attempted' fires the
  // moment they press Send; 'failed' fires when the request never produced a
  // server answer at all (network/runtime), which used to be silent.
  | 'community_share_opened' | 'community_share_attempted'
  | 'community_share_blocked' | 'community_share_failed'
  // Crop is the progressive-friction step: opened by the student's choice or
  // suggested by the server. Separating confirmed from cancelled is what
  // tells capture friction apart from motivation — a student who opens the
  // crop and cancels is a different problem from one who never opens it.
  | 'community_crop_opened' | 'community_crop_confirmed' | 'community_crop_cancelled'
  // Client-side photo prep, and the REAL end-to-end duration the student
  // experienced. The server's timing log starts after Vercel has buffered the
  // request body, so it cannot see the upload leg at all — this can.
  | 'community_photo_prepared'
  | 'content_reported'
  | 'channel_prompt_shown' | 'channel_join_click' | 'channel_joined'
  | 'channel_referred'
  | 'checkin_shown' | 'checkin_answered' | 'checkin_completed'
  // Q5: the gate saved a work outcome it cannot price and handed the student
  // to the full sheet. Distinct from checkin_completed, which means the gate
  // finished the answer by itself.
  | 'checkin_handoff_to_log'
  // The store-rating ask. Shown is recorded server-side too (rating_prompts),
  // but the client event is what ties an impression to the surface and session
  // it appeared in -- the row alone cannot say that.
  | 'rating_prompt_shown' | 'rating_prompt_rated'
  | 'rating_prompt_dismissed' | 'rating_prompt_never_ask_again'
  // The payoff stage of the loop: the rebuilt timetable handed back after the
  // check-in. payoff_shown vs completed measures how often a check-in actually
  // produced a plan to show; payoff_start is the student accepting it.
  | 'checkin_payoff_shown' | 'checkin_payoff_start'
  // G12 (19 Aug): the daily Buddy nudge, which emitted NOTHING until now. It
  // is shown to ~349 eligible students at most once per student per study-day,
  // and it competes with every other auto-modal for a single daily slot — a
  // trade we have been making on assertion. `_rung` is deliberately separate
  // from `_dismissed`: four controls on that modal call the same setShow(false),
  // and folding the single-session link in with them would record the deepest
  // engagement on the screen as an abandonment.
  | 'buddy_nudge_shown' | 'buddy_nudge_dismissed'
  | 'buddy_nudge_cta' | 'buddy_nudge_rung';

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined') return;
    queue.push({ event, props: { ...props, seq: seq++ }, path: window.location?.pathname ?? '', ts: Date.now() });
    if (queue.length >= 12) { flush(); return; }
    if (!flushTimer) flushTimer = setTimeout(() => flush(), 1000);
  } catch {
    /* best effort */
  }
}

/** Force an immediate beacon flush — used when a screen is about to unload. */
export function flushEvents(): void {
  flush(true);
}

let listenersBound = false;
/** Flush any pending events when the page is hidden/closed. Idempotent. */
export function bindFlushOnHide(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}
