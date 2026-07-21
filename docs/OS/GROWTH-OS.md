# CareerRai Growth OS — Constitution

> **Status:** binding architecture document. Changes rarely (think Linux kernel
> principles). Every growth surface — the `/start` funnel, the install flow, the
> post-signup ceremony, attribution, leads, referral copy — must obey this. Any
> AI agent (Claude, Fable, Codex, Cursor) reads this **before** writing a line of
> growth, funnel, onboarding, or acquisition code. If a change violates this
> document, the change is wrong, not the document — escalate to the founder
> instead of shipping the violation.
>
> This is the **Constitution** (what Growth OS is). It hands the student off to
> the **Notification OS** (`docs/NOTIFICATION-OS.md`) the moment they are
> reachable — Growth's job ends where habit begins.

---

## 0. The one KPI

An **activated student**: someone who (1) installed the app, (2) switched
notifications **on inside the installed app**, and (3) logged their **first
honest study**. All three, or it does not count.

Not signups. Not installs. Not permission grants. A signup that never installs is
a lead. An install that never opts in is unreachable. An opt-in that never logs is
a subscription with no habit behind it. The activated student is the only one who
crossed from *acquired* to *reachable-and-having-felt-the-value-once* — the exact
handoff point to Notification OS. Every decision below optimizes this and nothing
else. When two goals conflict, activation wins over signup count, over install
speed, over raw permission rate, over vanity reach.

---

## 1. Founder philosophy — why the funnel exists

- **The funnel is a journey, not a job.** The student should feel pulled toward a
  finish line they can see (`post-signup-sequence.tsx :: JourneyRail`: *date →
  commitment → install → open app → reminders on*), never processed through a
  form. "Sticky like a magnet till app notifications are on."
- **Value before the ask, every time.** The student decides their target date,
  maps their own syllabus, and sees a real diagnosis of their gap *before an
  account exists*. The Instant Insight (`screen-instant-insight.tsx`) is the
  pitch; signup is the consequence, not the price of entry.
- **Every step earns the next.** No screen exists to collect a metric. Each one
  gives the student something (a date they own, a coverage map, an insight, a
  plan) so the next ask is deserved. Install is the *finish line* of onboarding,
  not a mid-flow interruption.
- **Growth's product is a reachable, activated student — not a number in Meta.**
  We deliver students to the habit engine. A "lead" Meta counts twice, or an
  install that dies in a browser tab, is a failure of this OS even if the
  dashboard looks green.

---

## 2. Non-negotiables (the hard lines)

1. **No invented stats, no fabricated testimonials, ever.** Every number a
   student sees is computed from what they told us. The Instant Insight compares
   *their* untouched high-weightage topics against *their* finished ones by real
   `TOPIC_METADATA` mark-weights — never a made-up "students like you score X."
2. **Value before the ask.** Never request signup, install, or a permission
   before the student has been given something real. The order is law:
   diagnosis → plan → install → opt-in.
3. **Measure activation, not vanity.** Installs, page views, and raw permission
   grants are diagnostics, never the goal. A "browser-only" permission we know
   won't deliver is not a win — we don't optimize it (see Notification OS §7).
4. **One conversion per student, ever.** Meta `CompleteRegistration` fires once
   per device, guarded by `localStorage cr_meta_reg_fired` — because the sequence
   re-renders until `post_signup_done` flips, and iOS remounts it after the
   install round-trip. An un-guarded fire is how Meta once counted ~2x real
   signups. Duplicate conversion signal is a lie to ourselves.
5. **The account is born last.** Nothing writes to Supabase until the student
   verifies their phone (`ScreenLoginBuild`). The entire onboarding payload is
   handed over in one request at that moment. Abandoned journeys leave no ghost
   rows.
6. **Push is never asked in a browser.** The opt-in ask lives *only* inside the
   installed app. Asking pre-install trades a reliable future grant for a dead
   one. This is Notification OS law, and Growth OS honors it end to end.
7. **The draft is a resume, not a resurrection.** A pre-auth draft older than 72h
   is an abandoned lead, not a session — it is dropped, never resumed. A finished
   or shared-device journey is wiped on signup and by "Start over."
8. **Honest progress only.** The build bar advances to 92% while the real request
   is in flight and reaches 100% *only* when the server confirms the plan is
   saved (`ScreenLoginBuild`). We never fake completion.

---

## 3. The funnel / state model

The pre-auth funnel is **11 screens, entirely client-side**, driven by
`src/app/start/page.tsx`. Every question happens *before* the account exists —
"you decide the date, you own the plan" comes first; signup comes last as "log in
while we build."

| # | Screen | What it gives / earns |
|---|---|---|
| 0 | `need-check` | qualifies intent |
| 1 | `target-date` | the student **owns** their finish date |
| 2 | `dream-percentile` | the goal that makes the gap matter |
| 3 | `quick-facts` | attempt history, repeater flag |
| 4 | `pain-points` | their words, reused in leads + copy |
| 5 | `reality-check` | honest self-assessment |
| 6 | `topic-coverage` | the coverage matrix (`deferSave` — held in memory) |
| 7 | `instant-insight` | **the WOW** — a real diagnosis from their taps |
| 8 | `mentor` | declared want-a-buddy intent |
| 9 | `social-proof` | testimonial |
| 10 | `login-build` | phone OTP → account born → plan built |

State lives in `localStorage` (`cr_preauth_draft_v5`, 72h TTL); progress is a bar
over the first 10 screens. **Draft key is versioned** — bump it to invalidate
every draft saved before a breaking change.

**Post-signup ceremony** (`post-signup-sequence.tsx`), once per student, guarded
by `profiles.post_signup_done`: *date reconciliation → hold-to-commit →
thanks → install (the finale) → open app → share.* Install is deliberately the
finale, marked `done` **before** the install step so the iOS `/app` navigation
can never re-trigger the ceremony.

**In-app opt-in** (`standalone-notif-ask.tsx`): fires only in the installed
standalone app, *after* the first Career Insight, and returns on **every app
open** until notifications are actually on. This is the last gate of Growth OS
and the front door of Notification OS.

The full arc: **land → own the date → map coverage → instant insight → build plan
(signup) → commit → install → open app → opt in → first log.** Only the student
who completes it is *activated*.

---

## 4. Key components map

| Concern | Real file / table |
|---|---|
| Pre-auth funnel orchestrator | `src/app/start/page.tsx` |
| The WOW diagnosis | `src/app/start/screens/screen-instant-insight.tsx` |
| Signup (phone OTP + payload handoff) | `src/app/start/screens/screen-login-build.tsx` → `/api/auth/{request,verify}-phone-otp` |
| Post-signup ceremony | `src/components/post-signup-sequence.tsx` |
| Install prompt (once/session till installed) | `src/components/install-journey.tsx` |
| Install engine (native / escape / A2HS guide) | `src/lib/install/use-install.ts`, `src/components/install/*` |
| In-app browser escape (Instagram/FB webview) | `src/components/install/meta-escape.tsx` |
| In-app notification opt-in | `src/components/standalone-notif-ask.tsx` |
| Anonymous funnel beacon | `src/lib/funnel.ts` → `/api/funnel` → `funnel_events` |
| Full journey telemetry | `src/lib/journey.ts` → `/api/events/track` → `student_events` |
| Meta Pixel (web-only) | `src/components/meta-pixel.tsx`, `src/lib/track.ts` |
| Meta Conversions API (server) | `src/lib/meta-capi.ts` |
| Leads pipeline (every login is a lead) | `src/app/admin/leads/**`, `profiles` |
| Deterministic pipeline filters | `src/lib/admin-filters.ts`, `student_engagement`, `mentor_grants` |
| Anon→student identity link | `cr_anon` cookie (90d), shared by `funnel.ts` + `journey.ts` |

---

## 5. Attribution & experiments

**Identity spine.** One anonymous id (`cr_anon`, 90-day cookie) is minted on the
first `/start` visit and **reused** by both the funnel beacon and journey
telemetry, so a visitor's pre-signup clicks and their post-signup events share one
timeline. When authenticated, `/api/events/track` attaches the real `user_id`
server-side — events can never be spoofed onto another user.

**What is instrumented (Live):**

- `funnel_events` — one row per `/start` step reached, including `start:landed`
  fired by an inline script *before* React hydrates (so it matches Meta's Landing
  Page Views and catches pre-hydration bounces). This is the drop-off map.
- `student_events` — every meaningful moment with `display_mode` (standalone vs
  browser), `browser`, and `platform` attached. This is the table that made
  "push granted in a browser tab" (the historical cause of undelivered
  notifications) visible for the first time. A standalone `app_open` opportunistically
  **heals** `profiles.last_seen_at` and `app_installed`.
- **Meta Pixel** — web-only by design. It never loads in the installed app,
  because cross-site tracking there would trigger Apple's ATT requirement
  (Guideline 5.1.2) which a WKWebView wrapper cannot satisfy. `PageView` +
  `CompleteRegistration` (once-guarded).
- **Meta CAPI** (`meta-capi.ts`) — server-side, hashed PII, `event_id` shared with
  the Pixel for dedup. Currently wired for the payments `Purchase` event
  (`/api/payments/webhook`); inert until `META_CAPI_TOKEN` + pixel id are set.
- **First-party ad attribution** — `cr_attr` cookie captures `utm_*` / `gclid` /
  `fbclid` for 30 days on landing.

**Planned (honest gaps):**

- **Attribution join.** `cr_attr` is *captured* but not yet *read server-side* at
  signup to stamp the campaign onto the `profiles`/lead row. Until then, ad→signup
  attribution is Pixel/CAPI-side only, not first-party.
- **Funnel-to-activation cohorting.** `funnel_events` and `student_events` exist
  but there is no dashboard that reports step-by-step conversion or an
  activation-rate cohort over time.
- **Experiment framework.** No A/B harness exists. Funnel changes today are
  founder-directed and shipped whole; there is no variant assignment on `cr_anon`.
- **Referral loop.** The post-signup share step (native share → WhatsApp
  fallback, with honest "I locked my CAT date" copy) exists, but there is **no
  referral attribution, no invite tracking, and no reward** — it is share-for-
  goodwill only. A measured referral loop is Planned.

---

## 6. Leads & the human pipeline

Every login is a lead (`/admin/leads`) — students and buddies, newest first,
test/demo accounts hidden (`is_test_account`, `is_demo`). Each card shows the true
state: plan built vs dropped-at-step, **App ✓/✗**, **Notif ✓/✗**, declared
pain-points, "wants buddy · unassigned." One-tap WhatsApp is pre-filled with the
message matched to the lead's state (no app → install nudge; installed-no-notifs →
turn on reminders; engaged → keep going). Excel export for the founder.

Pipeline filters are **deterministic** (`src/lib/admin-filters.ts`) — the count on
a card equals `list.length` of the same function; a student is never included
because they "might" need attention. `getWantsBuddy` = `wants_mentor=true AND
buddy_id IS NULL AND not premium` (a *declared* want, not inferred).
`getSalesReadyToCall` = `student_engagement.sales_ready AND never called AND still
free`, sorted by real intent signals (buddy-CTA clicks → live streak → freshness).

---

## 7. Success & failure

- **Success is an activated student**, defined in §0 — installed, opted-in,
  first honest log — handed to Notification OS reachable and having felt the loop
  once.
- **Success is never a vanity number.** A high signup count with low install-
  through, or a high permission-grant rate built on browser-tab subscriptions
  that die same-day, is a *failed* month dressed as a good one.
- **Failure is a silent leak.** Any drop-off the team learns about from a founder
  hunch rather than from `funnel_events` / `student_events` is unacceptable —
  every funnel step must be observable.
- **Failure is a step that takes without giving.** A screen that raises drop-off
  while adding no value to the student is a violation of §1, not an optimization.

---

## 8. Health metrics (target model)

| Metric | What it proves | Status |
|---|---|---|
| `/start` landed → plan built | funnel efficiency | Live (raw), dashboard Planned |
| Plan built → app installed | install-through | Live (raw) |
| Installed → notifications on | reachability conversion | Live (raw) |
| Opted-in → first honest log | **activation rate (the KPI)** | Planned (cohort) |
| Signup dedup (Meta vs real) | attribution honesty | Live (guarded) |
| Ad click → first-party attributed signup | acquisition ROI | Planned (join) |
| Referral share → attributed signup | viral coefficient | Planned |

Raw signal exists today for most of these; the honest gap is the *reporting layer*
that turns rows into a step-by-step activation funnel.

---

## 9. Scalability & engineering standards (no exceptions)

- **The funnel is client-first and cheap.** All 11 screens run without a network
  round-trip; the only writes are the funnel beacon (fire-and-forget) and the
  single signup payload. The architecture is identical at 100 and 1,000,000
  students — volume changes thresholds and dashboards, never the shape.
- **All telemetry is best-effort and non-blocking.** Beacons queue, batch (~1s),
  and flush on `pagehide`/`visibilitychange` via `sendBeacon`/`keepalive`; every
  failure is swallowed. **Tracking must never slow down or break the funnel.**
- **Public ingest endpoints fail open and flood-guard by IP** (`/api/funnel`,
  `/api/events/track`) — they always return 200 so a beacon never blocks
  navigation, and cap inserts per IP so they can't be used to flood a table.
- **One identity, reused.** `cr_anon` is minted once and shared across funnel and
  journey tracking — never mint a second anon id for a second surface.
- **Attribution is server-trusted.** `user_id` is resolved from the session
  cookie server-side; the client's claimed id is never trusted for identity.
- **PII is hashed before it leaves us.** CAPI emails/phones are SHA-256 hashed
  (`meta-capi.ts`); `META_CAPI_TOKEN` is server-only and lives only in env.
- **Every conversion event is idempotent** — device-level guards on
  `CompleteRegistration`, `post_signup_done` on the ceremony, `app_installed` as
  the terminal install truth. No double-counting, no re-triggering.
- **No invented statistics, no fabricated testimonials, ever.** (Restated because
  it is the one line a growth engineer is most tempted to cross.)
