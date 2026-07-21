# CareerRai Analytics OS — Constitution

> **Status:** binding architecture document. Changes rarely (think Linux kernel
> principles). Every number the founder acts on — a dashboard tile, a funnel
> stage, a health state, a KPI — must obey this. Any AI agent (Claude, Fable,
> Codex, Cursor) reads this **before** writing a line of analytics, dashboard, or
> tracking code. If a change violates this document, the change is wrong, not the
> document — escalate to the founder instead of shipping the violation.
>
> This is the **Constitution** (what the OS is). Its Execution Manual is earned
> when Analytics next sees substantial build work; until then, author every
> change against this standard.

---

## 0. The one KPI

**Every number the founder acts on is deterministic: it reconciles to its source,
and it can be reproduced from a query anyone can re-run.**

Not chart count. Not dashboard coverage. Not "we track everything." The single
measure of this OS is that when the founder taps a tile showing `12`, the list
behind it has exactly 12 rows — and both came from the same WHERE clause. A
metric that can't be reproduced from source is not a metric; it's a rumor with a
font. When two goals conflict, reproducible-truth wins over richness, over
prettiness, over how impressive the number looks.

---

## 1. Founder philosophy — think like a database engineer

- **Every dashboard card is one precise `WHERE` clause.** A student belongs on a
  card because a deterministic predicate says so — never because they're
  "similar," "might need attention," or "look like" the others. Membership is a
  query, not a vibe.
- **A number you can't reproduce from source is a rumor.** If you can't write the
  SQL (or the pure function) that regenerates a figure exactly, it does not go on
  a screen the founder acts on.
- **The count and the list are the same object.** The count is literally
  `list.length` of the query the page renders. They are computed once, together,
  so they can never disagree. A dashboard that contradicts itself has already
  failed its only job.
- **Measure what happened, never what you wish happened.** If the platform emits
  no event for a stage, that stage does not exist on the chart. We do not
  interpolate, estimate, or invent a receipt the browser never gave us.

---

## 2. Non-negotiables (the hard lines) — the heart of Analytics OS

1. **Count = list.length, from the SAME function.** Every card's number is the
   length of the exact list its page renders, produced by one shared filter
   (`src/lib/admin-filters.ts`, `src/lib/streak-breakers.ts`). No card computes
   its count one way and its list another. This is the rule the whole OS exists
   to protect.
2. **No fuzzy / "similar" membership.** A row is in a set because a boolean
   predicate is true for it — `sales_ready = true AND sales_called_at IS NULL AND
   NOT is_premium`, etc. There is no similarity score, no "probably," no
   ranked-inclusion. Ranking may order a list; it may never decide membership.
3. **NULL-safe filters, always.** Flag exclusions use `.not(col, 'is', true)`
   (Postgres `IS NOT TRUE`), never `col <> true` — because `col <> true` silently
   drops NULLs and a future NULL would change a filter's meaning without warning.
   A base population that quietly shifts because someone added a nullable column
   is a P0 waiting to happen.
4. **The base population is defined once.** "Real students" =
   `role = 'student' AND is_test_account IS NOT TRUE AND is_demo IS NOT TRUE`,
   fetched by `getRealStudents()` and threaded into every card in a request. One
   definition, one fetch, every number derived from that exact set. Founder
   testing and demo accounts never inflate a single acquisition, activation, or
   health metric.
5. **No fabricated funnel stages.** Web push has **no delivery receipt and no
   impression event** — so the notification funnel is `Sent → Pushed → Clicked →
   Acted`, with deliberately **no** "delivered" and **no** "opened" stage. You do
   not invent a stage the platform cannot observe. A device-level receipt exists
   only where the service-worker beacon actually fires (`received_at`); until it
   does, the honest label is "delivery not yet confirmed," never a guessed
   percentage.
6. **No invented statistics, anywhere.** No estimated conversion rates, no
   modeled "delivered ~95%," no fabricated cohort curves, no round-number
   placeholders that read as real. Every figure on a founder-facing surface is
   backed by rows. A `—` (unknown) is always correct where an invented number is
   always wrong.
7. **Every event has a stable name.** Event names (`app_open`, `pageview`,
   `push_enabled`, `install_click`, `daily_log`, `first_insight_shown`,
   `log_open`, …) are a contract. You do not rename or repurpose a shipped event
   — historical rows carry the old meaning forever. New moment → new name.
8. **A funnel counts distinct identities, not rows.** Pre-signup funnel stages
   count **distinct `anon_id`s** reaching each step, not event rows — a visitor
   who reloads is one visitor. The `cr_anon` cookie is the through-line from a
   pre-signup click to the same person's post-signup events.

---

## 3. The event model

Two event streams, one identity spine:

- **`student_events`** (`supabase/migrations/20260715_student_events_tracking.sql`)
  — the full post-hydration journey. Every row carries the dimension the old
  telemetry lacked: `display_mode` (`standalone` = real installed app vs
  `browser` tab), `browser`, `platform`, plus `user_id` / `anon_id` /
  `session_id` / `props` / `path`. This is what makes "push granted in a browser
  tab" (the root cause of undelivered notifications) queryable, per student, from
  first click to last. Service-role only (RLS on, admin client bypasses).
  `v_student_timeline` gives one student's ordered history.
- **`funnel_events`** (`supabase/migrations/20260712_funnel_events.sql`) — the
  pre-signup `/start` wizard beacon, a fixed whitelist of step names
  (`start:landed` … `start:login-build`). `start:landed` fires from an inline
  script the instant the HTML parses, **before** React hydrates, so it counts
  visitors who bounce before the app loads (matches Meta's Landing Page Views).

**`track(event, props)`** (`src/lib/journey.ts`) is the single client entry point:
best-effort, non-blocking, batched ~1s and flushed on `pagehide` via
`sendBeacon`/`keepalive`. Every failure is swallowed — **tracking must never slow
or break the app.** Auto-capture (`src/components/journey-tracker.tsx`, mounted
once in the root layout) fires the journey spine — `app_open` (with the
push-permission snapshot and the `browser_only_push` tell-tale) and `pageview`;
explicit events fire from their own call sites.

**Ingest** (`src/app/api/events/track/route.ts`): public (works pre-auth via
`anon_id`) but resolves the authenticated `user_id` **server-side** so events can
never be spoofed onto another user. Always returns 200. It bounds input
(max events, event-name length, props bytes), flood-guards per IP (fail open),
and opportunistically **heals** profile signals from the single highest-confidence
signal — a `standalone` `app_open` sets `last_seen_at` and `app_installed`. It
never trusts a client-claimed identity or a browser-mode it doesn't recognize.

---

## 4. Deterministic dashboard doctrine

`src/lib/admin-filters.ts` is the **reference implementation** of this whole OS —
read it before building any dashboard surface. Its shape is law:

- `getRealStudents(admin)` fetches the base population **once**; every card
  function takes that set and derives from it.
- Each card is one exported function returning the **list**; the page renders the
  list and the admin home shows `list.length` as the count (`src/app/admin/page.tsx`).
  `getLoggedToday`, `getStreaksAlive`, `getRemindToLog`, `getGoingCold`,
  `getSalesReadyToCall`, `getWantsBuddy`, and `getStreakBreakers` all follow this.
- The ratified card definitions live as a comment block at the top of
  `admin-filters.ts` — the founder-approved WHERE clause for each. Changing a
  card's meaning means changing that definition on purpose, not drifting into it.
- Membership is deterministic; **sorting is separate** — "hottest first" ordering
  (unlock taps → live streak → freshest activity) decides row order, never who is
  on the list.
- Admin pages are `dynamic = 'force-dynamic'`: the dashboard is a live ops panel,
  and a cached tile showing a stale count reads as broken.

---

## 5. Key components map (concern → real file/table)

| Concern | Where it lives |
|---|---|
| Deterministic card filters (the doctrine) | `src/lib/admin-filters.ts` |
| Shared count/list filter (streak win-back) | `src/lib/streak-breakers.ts` |
| Admin home — summary tiles + attention doors | `src/app/admin/page.tsx` |
| Growth & funnel (signup → onboard → log → active → paid) | `src/app/admin/growth/page.tsx` |
| Notification command center (reachability + reliability + send funnel) | `src/app/admin/notification-health/page.tsx` |
| Notification health engine (one state per student) | `src/lib/notification-health.ts` |
| Client event API + auto-capture | `src/lib/journey.ts`, `src/components/journey-tracker.tsx` |
| Journey event ingest (+ profile-signal healing) | `src/app/api/events/track/route.ts` |
| Journey event store | `student_events` table, `v_student_timeline` view |
| Pre-signup funnel beacon + store | `src/app/api/funnel/route.ts`, `funnel_events` table |
| Business KPI sources | `profiles` (`created_at`, `is_premium`, `premium_since`), `student_engagement` (`sales_ready`), `daily_reports`, `notifications` |

---

## 6. Business KPIs — the founder's real numbers

- **Leads:** new real students by `created_at` in the IST day; windows (7d/30d)
  and per-day bars on `/admin/growth`. Source `signup_source` is self-reported at
  signup; UTM/ad attribution is captured in a cookie but **not yet persisted per
  signup** (Planned — §8).
- **Activation funnel:** signed up → finished onboarding → logged ≥1 → active
  (last 7d) → reached for a buddy → paid. Each stage is a filter over the same
  real-student set; percentages are `of signups` and `from prev`.
- **Conversions / upgrades:** `is_premium = true` (total), and
  `is_premium AND premium_since is today` (upgraded today) on the admin home.
  "Paid" on Growth uses `subscription_status = 'active'`.
- **Sales-ready:** `student_engagement.sales_ready = true AND sales_called_at IS
  NULL AND NOT is_premium` — a call queue, count and list from one function.

Every one of these is a WHERE clause over the single base population. None is
modeled, smoothed, or estimated.

---

## 7. Success & failure

- **Success** is a founder who trusts every number without checking — because
  each tile's count is its list's length, each filter is NULL-safe, each stage is
  real, and any figure can be reproduced from source on demand.
- **Failure is a contradicting dashboard — a P0.** A card that says `12` over a
  list of `9`, a funnel stage the platform can't observe, a filter that flips
  meaning on a NULL, or an invented percentage — each is a break in the one thing
  this OS guarantees, and each is fixed before feature work resumes.
- **Silent failure** (a metric quietly wrong that only the founder or a student
  notices, never a check) is unacceptable — the same company-wide law the
  Notification OS holds.

---

## 8. Honest status — Live / Partial / Planned

**Live**
- Deterministic admin dashboard: `admin-filters.ts` + `admin/page.tsx`, every
  card count = list.length over `getRealStudents`. **Reference implementation.**
- Notification command center: reachability funnel (one health state per student),
  reliability (7/14/28-day survival, today's pipeline, same-day deaths), and the
  honest `Sent → Pushed → Clicked → Acted` send funnel — **no invented delivered/
  opened stage.**
- Growth & funnel page: activation funnel, acquisition windows, daily signups,
  by-source breakdown — all excluding test accounts.
- Event ingest + auto-capture: `track()`, `student_events`, server-side identity
  resolution, standalone-signal profile healing; pre-signup `/start` funnel via
  `funnel_events` (distinct-anon counting).

**Partial**
- `student_events` is captured richly but is **not yet surfaced in an admin
  dashboard** — today it powers profile-signal healing and the per-student
  `v_student_timeline`, not aggregate charts. The event spine exists; dashboards
  on it are Planned.
- Device-level delivery receipts (`received_at`) land only where the service-worker
  beacon has rolled out; "delivery-verified" climbs as SWs update. Reported
  honestly as `unverified` until confirmed — never guessed.

**Planned**
- Aggregate dashboards over `student_events` (install → push-context → activation
  cohorts; browser-vs-standalone breakdowns) built to the same count=list law.
- UTM / ad-campaign attribution persisted per signup (cookie is captured today).
- Experimentation / A-B framework: variant assignment, exposure logging, and
  readouts that reconcile to source like every other number here.
- Cohort retention curves (Dn return) derived from `daily_reports` + events.

---

## 9. Scalability & engineering standards

- **The doctrine is identical at 87 students and at 500,000.** One base
  population, one function per card, count = list.length, NULL-safe predicates,
  distinct-identity funnels, real stages only. Volume changes indexes, pagination,
  and pre-aggregation — never the shape. The admin home is designed to look
  identical at 87 leads and 5,000: tiles are counts, the people live one tap away.
- **New card ⇒ new shared filter function.** Never inline a query in a page and a
  count elsewhere; add one function returning the list, render it, count its
  length. Add the ratified definition to the comment block.
- **New event ⇒ new stable name**, fired through `track()` (never a bespoke
  fetch), bounded and swallowed so it can't slow the app. Register the meaning;
  never overload an existing name.
- **Reproducibility is a review gate.** If a reviewer can't re-derive a number
  from the query in front of them, it doesn't ship.
- **Exclude test/demo everywhere**, via the shared NULL-safe predicate — one
  definition of "real," enforced identically on every surface.
- No invented statistics, no fabricated funnel stages, no fuzzy membership, ever.
