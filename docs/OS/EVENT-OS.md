# Event OS — Notification & Identity Architecture v1.2 (BINDING)

> Locked 26 Aug 2026 after three review rounds (Claude research ×3, external
> founder-side review ×3) were reconciled line-by-line; v1.2 folds the final
> founder refinements (identity/address separation, importance classes,
> rates-as-inputs). This is the
> constitution for every notification and every identity change. A change that
> violates an invariant here is wrong — escalate to the founder, don't ship it.
> Mission check (docs/MISSION.md): everything below serves the free student's
> loop first — reminders, buddy replies, insights. Monetisation touches exactly
> one event (BUDDY_PITCH) and is capped by an authority this document may never
> weaken.

## The one rule

**ONE BUSINESS EVENT → ONE AUTHORITY (`dispatch()`) → MANY DELIVERY CHANNELS.**

- Every notification passes through `dispatch()` (`src/lib/notification-os.ts`).
  WhatsApp, when it arrives, is a transport *inside* it — never a second engine.
- The `notifications` row IS the event record and the outbox: one row per
  event, per-channel delivery stamps (`pushed_at`, `whatsapp_at` [future, the
  only planned schema column], `emailed_at`) on that same row.
- **Retry the delivery, never the event.** A failed transport retries against
  the same row. Concurrent producers are resolved by DB unique index →
  SQLSTATE 23505 → treat as already-handled (the proven `promo_impressions`
  pattern). No separate outbox table or worker queue until volume forces one;
  if it ever does, the row is already the queue — add a consumer, not a schema.
- **Channel policy = f(event class, user capability).** Producers emit the
  event and stop; `dispatch()` decides channels from what the user actually
  has (calendar connected? WhatsApp consented? push subscribed?) and from the
  event's own ladder (below). Producers never pick channels.

## Hard invariants (each needs a guard test when its phase ships)

1. **No direct writers.** Nothing but `dispatch()` may insert into
   `notifications` or reach a transport. The existing send-boundary source
   guard extends to every new transport. (Phase 0 converts the 18 current
   direct writers — the wiring failure that produced 24 session events with
   0 pushes and a `session_reminder` that never fired.)
2. **Daily habit nudges never ride WhatsApp.** Any `STUDENT_BUDGET_TYPES` /
   daily-ladder type reaching the WhatsApp transport fails the build. WhatsApp
   is the "something important happened" channel; the habit loop lives on push
   (free) and email (near-free). This is a permanent invariant, not a phase.
3. **One commercial interruption per student per study day** — the
   `promo_impressions` claim/settle authority, unchanged and unbypassable.
   Transactional events never consume the commercial slot; the commercial slot
   never exempts a channel from the fatigue caps.
4. **No message body text in WhatsApp templates** (privacy: shared family
   phones, lock screens). Sender + event + deep link. Never a score, rank or
   percentile.
5. **The phone is a verified, MUTABLE address and recovery factor — never the
   identity.** Identity credentials are Google / Apple (and later passkeys —
   already modelled by Supabase's `auth.identities`, so no extra build; the
   only rule is that no table may ever treat the phone as the identity key).
   Changing numbers is a re-verify flow, never account loss. And: **no account
   without a verified phone.** Google (and later Apple) opens the
   door; the phone is the address, verified ONCE per lifetime, WhatsApp consent
   captured at that exact moment into `notification_consent_events`. A student
   may not book a session, message a buddy, or pass day-1 of the journey
   unreachable. Funnel note: `/start` builds the whole plan BEFORE signup, so
   this gate already sits after value — instrument the step; revisit only if
   the measured drop is material (a formal A/B at ~630 signups/month is
   underpowered for ~3 months — do not run experiment theatre).
6. **Google auth ≠ Google authorization.** Sign-in scopes only at the door.
   `calendar.events` is requested incrementally, at the booking moment ("Add
   this session to your Google Calendar?"). `lib/google-oauth.ts` needs an
   auth-only variant before Phase 1 ships. Phrasing discipline: Google is our
   low-cost identity rail and calendar operates within Google quotas — never
   write "Google is free" into a plan.
7. **Google never creates an account by itself.** Linking to an existing
   account is manual and gated on the verified phone (Supabase auto-links only
   on verified email; our base has none — an unguarded Google sign-in mints a
   duplicate and orphans a streak). Disconnecting Google degrades (loses
   calendar+email), never breaks.
8. **iOS ships Sign in with Apple alongside Google** (App Store Guideline 4.8).
   Identity providers are abstracted from day one; Apple is not a retrofit.
9. **Fatigue caps are channel-aware:** existing push budget stays; WhatsApp
   gets its own per-day send cap (tune from data; start ≤2/day/student,
   transactional cancellations exempt). Caps live in `dispatch()`, nowhere else.
10. **Fallback never lands on email while coverage is trivial** (<30%). The
    ladder falls WhatsApp → push → in-app. Email joins per-user as the Google
    door raises coverage; collection starts now, sending waits.

## Soft policies (architecture now, tuning later)

- **Collapse / suppress-within-window:** no second send for the same
  `collapse_key` (e.g. `message_thread:{id}`) within ~10 minutes of an
  unopened one; copy written so "new messages" is true for one or many. True
  batch-and-summarize waits for a delay queue to be worth having.
- **Quiet hours:** per-event-class capability, single-timezone (IST). Window
  derived from measured `student_events` activity by hour — NOT an assumed
  23:00–07:00; CAT aspirants study late. A buddy reply within ~15 minutes of
  the student's own message bypasses quiet hours (the student is visibly
  awake and waiting). Cancellations always bypass. No settings UI yet.
- **Presence suppression:** V1 sends regardless of app presence (idempotency
  makes this safe). `last_seen_at` exists; suppression becomes a measured
  experiment later, never an assumption.

## Event catalogue (producer is exclusive; key is DB-enforced)

Every event carries an **importance class** and a **taxonomy class**; channel
rules follow deterministically from (importance, taxonomy, user capability) —
never from a developer's mood. Classes: **P0 must-reach** (cancellation,
reschedule, booking confirmation, buddy reply, 30-min reminder), **P1
important** (24h reminder, new student message, SLA approaching), **P2 digest**
(weekly insight, roster digest), **P3 habit** (daily nudges — push only,
forever). Taxonomy: commercial / transactional / relationship / habit /
digest — the commercial class alone is governed by the pitch authority, and no
other class may ever be counted against it or borrow its exemptions.

| Event | Class | Sole producer | Idempotency key | Ladder (per capability) | Phase |
|---|---|---|---|---|---|
| SESSION_BOOKED | P0 · transactional | booking route via dispatch() | session_id+"booked" | WA → push → in-app; calendar minted both sides | 2 |
| SESSION_REMINDER_24H | P1 · transactional | session cron | session_id+"24h" | calendar if connected, else WA → push | 2 |
| SESSION_REMINDER_30M | P0 · transactional | session cron | session_id+"30m" | WA → push (join link) | 2 |
| SESSION_CANCELLED / RESCHEDULED | P0 · transactional | cancel/reschedule routes | session_id+state-version | WA → push; calendar updated; bypasses quiet hours | 2 |
| MESSAGE_RECEIVED (student→buddy) | P1 · relationship | chat send route | message_id (collapse: thread) | WA → push; deep link; no body | 2 |
| MESSAGE_REPLIED (buddy→student) | P0 · relationship | chat send route | message_id (collapse: thread) | WA → push; highest-value retention trigger | 2 |
| SESSION_COMPLETED → FEEDBACK_REQUEST | P1 · transactional | completion route | session_id+"feedback" | WA/push → in-app rating | 3 |
| GOOD_RATING → TESTIMONIAL_ASK | P2 · relationship | feedback handler | session_id+"testimonial" | only after positive rating; bad rating → recovery, never an ask | 3 |
| BUDDY_SLA_BREACH | P1 · relationship | SLA cron | message_id+"sla" | WA to buddy; admin on 2nd breach; never nags the student | 4 |
| DAILY_NUDGE | P3 · habit | existing ladder crons | user+IST-day+type (live index) | push ONLY (invariant 2) | 4 |
| WEEKLY_INSIGHT_DIGEST | P2 · digest | weekly cron | user+ISO-week | email → push; behaviour-powered — the moat notification | 4 |
| BUDDY_PITCH | commercial | claim authority | promo_impressions PK | unchanged, live | live |

Note on "session starting now": rejected for V1 (a second paid message ≤30
minutes after the reminder). Reconsider push-only, only if no-show data
survives the 30-minute reminder. WhatsApp quick-action buttons
(Confirm/Reschedule) are a V2 possibility; inbound WhatsApp chat is not — the
app is the workspace and the behavioural record, permanently.

## Build order

- **Phase 0 (no vendor, no cost):** all 18 direct writers through
  `dispatch()`; `session_reminder` actually firing; dead
  `video_sessions.*_notified` columns dropped; event keys; guard extended.
- **Phase 0.5 (ops):** 8 buddies connect Google; retire the shared Meet room.
- **Phase 1:** Google door (auth-only scopes) + hard phone step + consent +
  Sign in with Apple + safe linking + long-lived sessions.
- **Phase 2:** WhatsApp transport + 7 utility templates + incremental calendar
  at booking + session AND chat events (chat is not deferred: same transport,
  and it is the loop that matters most).
- **Phase 3:** feedback → recovery/testimonial. **Phase 4:** weekly digest,
  SLA, quiet-hours tuning from data.
- External clocks gating Phase 1–2, startable today at zero cost: Google OAuth
  consent-screen verification; Meta Business verification (owner + legal
  entity + non-personal number + stable privacy-policy URL).

## Never build (on the record)

Campaign/funnel builder · WhatsApp as workspace or inbound channel · daily
habit messages on WhatsApp (invariant, not preference) · triple-send per event
· preference centre beyond per-class on/off · any second notification engine,
bought or built (Topmate runs on SuprSend; we already own an orchestrator —
buy a transport, never a brain).

## Cost envelope (Model G, annual, estimates with stated assumptions)

~₹800 @1k → ~₹29k @10k → ~₹1.3L @50k → ~₹2.7L @100k students.
Rejected daily-on-WhatsApp alternative at the same points: ₹1.2L → ₹11.8L →
₹59L → ₹1.18Cr. The gap is structural (engagement on owned channels), which is
why invariant 2 is an invariant. Rates: India per-message (Jan 2026), utility
₹0.13, marketing ₹0.88–1.09; free service-window messaging ends 1 Oct 2026 and
is never assumed. **Rates are modelling inputs, not architecture — revalidate
against Meta's current price list before Phase 2 launch.** Only the structural
conclusion is load-bearing: habit traffic never rides a paid channel.
