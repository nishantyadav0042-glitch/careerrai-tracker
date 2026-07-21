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

## How prevention becomes permanent

An incident is only closed when its lesson is encoded somewhere with teeth — a
Constitution non-negotiable, a shared library that makes the wrong thing
impossible, or a Playbook gate. A lesson that lives only in this file will be
repeated; a lesson wired into `push-client.ts` or `admin-filters.ts` cannot be.
