# CareerRai Engineering Memory

> **Permanent organizational knowledge.** Every production incident, outage,
> rollback, failed experiment, and architecture mistake becomes a durable entry
> here — so no engineer and no AI agent ever repeats it. This is not a changelog;
> it is the record of what went wrong, *why*, what it cost, and what now prevents
> it. **Before building in a subsystem, read the incidents that touch it.**
>
> **How to add an entry:** append with the next number. Be honest about impact
> and root cause — a sanitized memory teaches nothing. When the prevention is
> encoded in a Constitution, link it, so the lesson has teeth beyond this file.

---

## Index

| # | Date | Title | Area | Students hit |
|---|---|---|---|---|
| 1 | 2026-07 | Push subscriptions dying same-day | Notification | 34 |
| 2 | 2026-07-19 | Zero new students could log | Notification / Learning | full cohort (0/29) |
| 3 | 2026-07-21 | Dead video-session links | Trust | all buddy sessions |
| 4 | 2026-07 | Stale streaks (displayed ≠ real) | Learning / Analytics | all loggers |
| 5 | 2026-07-20 | Dashboard contradicted itself | Analytics | founder (decisions) |
| 6 | 2026-07 | 0-hour log excluded from streak | Learning | honest loggers |
| 7 | 2026-07 | Invented statistic nearly shipped | Trust | (caught pre-ship) |

---

## Incident #1 — Push subscriptions dying same-day

- **Date:** July 2026 · **Area:** Notification OS · **Severity:** P0
- **Impact:** 34 of 75 opted-in students unreachable by push; 17 died the *same
  day* they signed up. Nearly half the reachable base lost, silently.
- **Root cause (two, compounding):** (1) permission was requested in the **browser
  tab** before install; the browser→WebAPK transition killed those subscriptions
  (production survival: browser-born ~25% vs installed-born ~92%). (2) The healer
  **unsubscribed a healthy subscription** on first standalone open and re-persisted
  with a single un-retried write — a failed write stranded the just-killed endpoint
  as a corpse that 410'd on the next send.
- **How it hid:** "a subscription row exists" was treated as "reachable," and the
  re-ask UI was gated on prefs being OFF — so 34 students with prefs ON and a dead
  sub had no path back at all.
- **Lessons:** Never request notification permission before the installed app.
  Never `unsubscribe()` a healthy subscription. "Accepted by the push service" ≠
  "delivered." A subscription is never trusted — verify device delivery.
- **Prevention (encoded):** `docs/NOTIFICATION-OS.md` §2 (non-negotiables 5–10),
  §7 (permission architecture). In-app-only permission, reuse-not-rotate
  (`push-client.ts`), retried persist, delivery beacon (`received_at`), reconnect
  screen, health engine.
- **Owner:** Nishant

---

## Incident #2 — Zero new students could log

- **Date:** July 19–20 2026 · **Area:** Notification / Learning · **Severity:** P0
- **Impact:** An entire onboarded cohort logged **zero** times (0/29) — students
  who installed and did everything right could not complete the one core action.
- **Root cause (two):** (1) server hours-validation capped at 6 while the log
  modal offered 8/10 → a silent `400 Invalid hours`. (2) The modal could not be
  submitted without ticking a plan-task, so an honest "studied off-plan" or
  "0 hours" day was impossible.
- **How it hid:** the failure was a swallowed 400 with no telemetry — the app
  looked fine; the logs simply never appeared.
- **Lessons:** Validate the client↔server contract as one thing. Never block the
  core action. Instrument the core action so a silent failure is visible.
- **Prevention (encoded):** `daily-heartbeat`/log path allows 0-hour honest logs;
  off-plan study path; `log_open` / `log_blocked` / `log_error` telemetry. See
  Learning OS (log is sacred, never punished) and Analytics OS (no silent
  failure).
- **Owner:** Nishant

---

## Incident #3 — Dead video-session links

- **Date:** July 21 2026 · **Area:** Trust OS · **Severity:** P1
- **Impact:** Scheduled buddy video sessions handed out links that dead-ended at
  meeting time — a broken promise at the worst possible moment.
- **Root cause:** the Daily.co fallback only checked room *creation*, not *join*;
  creation succeeded while join was blocked by a missing payment method. The Jitsi
  fallback then dead-ended on a moderator-login wall.
- **Lessons:** Never hand out a link you can't verify **end to end**. If the
  provider fails, refuse loudly (503) so the user retries — never save a link that
  only fails at the call.
- **Prevention (encoded):** `docs/OS/TRUST-OS.md` — single provider, "no dead
  links" law, 503-not-a-corpse, `/api/admin/video-health` one-tap end-to-end check.
- **Owner:** Nishant

---

## Incident #4 — Stale streaks (displayed ≠ real)

- **Date:** July 2026 · **Area:** Learning / Analytics · **Severity:** P2
- **Impact:** Students (and the admin view) saw a live streak — e.g. "7-day
  streak" — for a student who had actually broken it. A trust-eroding lie in the
  one number students care most about.
- **Root cause:** `current_streak` was persisted and never decayed; the display
  read the stored value, not the live computed one.
- **Lessons:** A displayed value must equal the **live-computed** value, not a
  stale stored one. One source of truth for derived state.
- **Prevention (encoded):** `liveStreak()` / `momentumStreak()` used on every
  surface; the Momentum Shield replay computes from all logs. Analytics OS: a
  number that doesn't reconcile to source is a rumor.
- **Owner:** Nishant

---

## Incident #5 — Dashboard contradicted itself

- **Date:** July 20 2026 · **Area:** Analytics OS · **Severity:** P0 (decisions)
- **Impact:** The admin dashboard showed a card count that disagreed with the list
  behind it (e.g. "logged today = 1" while other cards implied more; remind-count
  132 vs page ~115). The founder could not trust the numbers he steers by.
- **Root cause:** the card count and its list were computed by **different
  queries**, with fuzzy/`similar` membership and NULL-dropping filters.
- **Lessons:** Count and list come from the **same function** — count is literally
  `list.length`. Membership is a deterministic WHERE clause. NULL-safe filters.
- **Prevention (encoded):** `src/lib/admin-filters.ts` (shared filters, one base
  population); `docs/OS/ANALYTICS-OS.md` non-negotiables. This is the reference
  implementation of the count=list.length doctrine.
- **Owner:** Nishant

---

## Incident #6 — 0-hour log excluded from streak

- **Date:** July 2026 · **Area:** Learning · **Severity:** P2
- **Impact:** A student who logged an honest 0-hour day (Hridyansh) showed a zero
  streak — the app punished honesty, the exact opposite of the habit doctrine.
- **Root cause:** the streak replay ignored 0-hour logs as "no activity."
- **Lessons:** Every honest log counts — showing up is the behaviour, hours are
  secondary. Never let a data-shape assumption punish the desired behaviour.
- **Prevention (encoded):** migration + backfill so all distinct log dates count;
  Notification/Learning OS: reward showing up, never punish a miss.
- **Owner:** Nishant

---

## Incident #7 — Invented statistic nearly shipped

- **Date:** July 2026 · **Area:** Trust OS · **Severity:** caught pre-ship
- **Impact:** An insight line claimed error-logging "separates 85%ilers from
  95%ilers" — a fabricated statistic. Caught before students saw it.
- **Root cause:** reaching for a persuasive number that wasn't real.
- **Lessons:** No invented statistics, ever. Persuade with a true behaviour
  ("the habit toppers credit most"), never a made-up percentile.
- **Prevention (encoded):** company-wide non-negotiable in every Constitution and
  the Engineering Playbook.
- **Owner:** Nishant

---

## Incident #8 — PWA start_url redirected, installs silently failed

- **Date:** 25 July 2026 · **Area:** Growth OS (install) · **Severity:** live,
  student-reported
- **Impact:** A student messaged at 07:30 IST: "App open nhi ho rhi." He had
  accepted the install prompt at 07:24 and accepted it AGAIN at 07:35 — Chrome
  does not re-prompt for an installed PWA, so the install never completed.
  Every event he produced stayed `display_mode: browser`; he never once reached
  standalone. Across all students: **74 accepted the install prompt, 66 reached
  standalone, 8 never did** (~11%). All 8 were Chrome on Android.
- **Root cause:** `manifest.json` had `start_url: /student/home?source=pwa`.
  `/student/home` is a server redirect to `/student/tracker`, and the student
  layout redirects to `/login` when unauthenticated — so an unauthenticated
  fetch of start_url returned **307 → /login**, never 200. Chrome validates
  start_url during install; a redirect chain there makes the install unreliable.
  It also cost every real launch an extra redirect hop, and `?source=pwa` was
  destroyed by the redirect exactly as `?source=twa` had been (Incident: TWA
  store-build marker, same week — same bug class, second occurrence).
- **Detection gap:** every automated check we run asks "does this route work
  when logged in". Nothing asked "what does an anonymous fetch of start_url
  return", which is precisely the request Chrome makes.
- **Fix:** `start_url` now points at `/app?source=pwa`, a client-rendered entry
  page that returns **200 unauthenticated** and routes onward in the browser.
  Verified: `/app?source=pwa` → 200, old value → 307 → /login.
- **Lessons:** A URL that a browser or an OS fetches on our behalf must be
  tested **the way that agent fetches it** — unauthenticated, no cookies. And
  the second time a redirect ate a `?source=` marker should have been the first
  time we generalised the lesson.
- **Prevention (encoded):** the release sweep now includes an anonymous fetch of
  every URL an external agent resolves — `manifest.json` start_url, the service
  worker, icons, and `.well-known/assetlinks.json` — asserting 200, not 3xx.
- **Owner:** Nishant

---

## Incident #9 — exam_ready was self-declarable through the mandatory weekly review

- **Date detected:** 25 Jul 2026 · **Severity:** SEV-3 (data integrity, 10 rows / 6 students)
- **What happened:** "exam_ready cannot be self-declared" was enforced in
  `validateCoverageEntry` — but `topic_coverage.status` had ten write paths,
  and the weekly coverage review (the one screen we had just made *mandatory*)
  validated only "is it a real status" and "is it a forward move". Students
  could tap Exam Ready from a chip row. Ten topics across six students
  acquired it in the eight days the review was live, with every section
  engine switched off — no legitimate path existed.
- **Second door found in the same audit:** `applyConfidenceSignal` promoted
  one rank per green tap **up to and including exam_ready**, and the Home
  card's Done button sends green automatically — four Done taps would have
  finished a topic with zero accuracy recorded.
- **Root cause:** an invariant that N writers must each remember is an
  invariant that fails at writer N+1. Same failure class as Incidents #4
  (streak) and #5 (dashboard): a business rule with more than one
  implementation.
- **Fix:** rule enforced three layers deep — (1) the weekly review rejects
  `exam_ready` server-side and no longer renders the chip; (2) green taps cap
  at `revising` (`topic-selector.ts`); (3) a database trigger
  (`guard_exam_ready`, migration `20260725_exam_ready_guard`) refuses
  `exam_ready` for any (student, topic) with zero `topic_evidence` rows — the
  layer no forgotten writer can skip. Both directions live-tested in
  production: write without evidence → rejected; with evidence → accepted,
  then rolled back. The 10 leaked rows were reset to `revising`.
- **Lessons:** enforce integrity invariants **in the database**, where every
  writer must pass, and keep app-level checks as the friendly error message —
  not the wall. The status ladder itself is now declared once
  (`coverage-status.ts`) so a new writer can't quietly diverge.
- **Prevention (encoded):** the trigger; the shared ladder module; the
  Playbook §3 gate ("a change that redefines an existing business concept
  instead of importing it is rejected").
- **Owner:** engineering

---

## How prevention becomes permanent

An incident is only closed when its lesson is encoded somewhere with teeth — a
Constitution non-negotiable, a shared library that makes the wrong thing
impossible, or a Playbook gate. A lesson that lives only in this file will be
repeated; a lesson wired into `push-client.ts` or `admin-filters.ts` cannot be.
