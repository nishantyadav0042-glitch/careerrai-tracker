# CareerRai — Freemium Pivot: Implementation Plan
### Self-signup free app → ₹999 buddy upgrade · mapped to the real codebase
*Plan only — no code written yet. Sequenced per your go-live order. Hand slice-by-slice to Claude Code.*

---

## 0. The one thing this plan changes that the spec underestimates

The spec assumes the hard part is signup + the webhook. **It isn't.** Reading your actual code:

> **Your app is not paywalled today.** A student with `subscription_status = 'free_beta'` already gets the *complete* buddy experience — `/student/buddy`, `/student/chat`, mock debriefs, everything. Payment currently changes a *status label*, not *access*.

So the freemium model's real engineering centre of gravity is **Phase 3: building a paywall and the "buddy-taste" locked UI that does not currently exist.** Everything else (signup, schema, webhook) is comparatively small. Plan your time accordingly.

**Three current-state facts the plan is built on:**
| Area | What's true in the code today | Implication |
|---|---|---|
| **Auth gate** | Allowlist-gated in 4 routes: `request-phone-otp`, `verify-phone-otp`, `request-otp`, `verify-otp` (+ `auth/callback`). Non-allowlisted phone is **rejected**. | Self-signup = invert this gate **for students only** (keep it for buddy/admin role assignment). |
| **Premium** | No `is_premium`. `subscription_status ∈ {free_beta, active, expired, paused, refund_requested}` exists but **gates nothing in the student UI**. | Add a real gate. The buddy features must learn to hide themselves for free users. |
| **Payments** | `webhook/route.ts` calls `activate_payment` RPC on a pre-created `student_payments` row → sets `subscription_status='active'`. `create-order` *optimistically* sets `active` too (line 43 — a bug for the new model). | Webhook becomes the **upgrade** (`is_premium=true` + queue buddy). Remove the optimistic activation. |
| **Buddy assignment** | `buddy_id` set from the allowlist at signup; admin reassigns manually. | Free users get **no buddy** (`buddy_id=null`); premium users get **queued**, then assigned ≤24h. |
| **OTP cost** | indiahost OTP, ~1000-OTP plan, single vendor (per SWOT). | **Self-signup is an open OTP tap** → abuse/cost risk. Must add throttling + abuse protection (Phase 2). |

---

## 1. Decisions to lock before any code (blocking)

These five choices change the build. My recommendation is in **bold**; correct any.

1. **Premium flag.** Add a dedicated **`is_premium boolean default false`** on `profiles` as the single UI gate, *and* keep `subscription_status` for billing detail (admin/payments/crons already depend on it). Don't overload `subscription_status` for access — a clean boolean is what every component checks. → **Add `is_premium`.**
2. **What free students get for buddy features.** Not a blank — the **locked "buddy-taste" UI** (locked Buddy Card, post-log line, read-only sample debrief, day-3 gap nudge). This is the conversion engine; it's a must-build, not a nice-to-have.
3. **Allowlist's new role.** Keep it **only** for assigning **buddy/admin** roles and (optionally) for *pre-paid* students. Students self-signup as free without it. → Buddies/admins still gated; students open.
4. **Free students & buddy_id.** Free users have **`buddy_id = null`** until they pay. (Today a buddy_id is assigned at signup — must stop for free users, or buddies get unpaid students in their roster.)
5. **OTP abuse protection.** Self-signup needs **device/IP throttling + a daily global OTP ceiling + optional hCaptcha** so a bad actor can't burn your SMS quota. → Design in Phase 2, don't defer.

---

## 2. Phased build (your go-live order)

> Go-live sequence (from your spec): ship **self-signup + buddy-taste + upgrade webhook** → watch **2–3 free users flow to paid** cleanly → **then** floor ad spend.

### PHASE 1 — Schema migration (foundation)
*One migration file: `supabase/migrations/2026XXXX_freemium.sql`. Production apply requires your explicit go-ahead (same as the perf indexes).*

- **`profiles`** — add:
  - `is_premium boolean not null default false`
  - `premium_since timestamptz`
  - (reuse existing `subscription_renews_at` for period end — don't add a duplicate)
  - `signup_source text` (e.g. `'self_serve'`, `'allowlist'`) — for funnel metrics
- **New table `buddy_assignment_queue`** — `id, student_id, status ('pending'|'assigned'|'cancelled'), created_at, assigned_at, assigned_buddy_id`. RLS on (service-role only).
- **New table `student_engagement`** (1 row/student) — `student_id pk, signed_up_at, first_log_at, tour_completed bool, mock_opened bool, sample_debrief_viewed bool, buddy_cta_clicks int default 0, sales_ready bool default false, sales_called_at`. (Streak already lives in `streak_data` — read from there, don't duplicate.)
- **`handle_new_user` trigger** — confirm the auto-created stub defaults to `is_premium=false`, `subscription_status='free_beta'`, `buddy_id=null`. Adjust if it copies anything else.
- **Backfill** — set existing real students `is_premium = (subscription_status = 'active')` so current paying users aren't downgraded. **Demo account stays `is_demo=true` and untouched.**

**Files:** new migration only. No app code. **Risk:** production migration — gate behind your approval.

---

### PHASE 2 — Self-serve signup (`/start`)

- **New page `src/app/start/page.tsx`** — 2-field form (Name + Phone), phone-OTP, no password. Hinglish copy from your spec. On success → straight into the free app. (Mirror the existing login OTP client logic; reuse `normalizeIndianPhone`.)
- **`src/app/api/auth/request-phone-otp/route.ts`** — invert the gate (lines 21–34): if phone **not** in allowlist, allow OTP send **as a free-student signup** (don't reject). Keep allowlist lookup only to detect buddy/admin. **Add the abuse protections from Decision 5** (per-IP/device throttle + global daily OTP ceiling).
- **`src/app/api/auth/verify-phone-otp/route.ts`** — the no-allowlist branch (lines 55–60) must **create a free student** instead of returning 403: `role='student'`, `is_premium=false`, `subscription_status='free_beta'`, `buddy_id=null`, `signup_source='self_serve'`, plus an `student_engagement` row with `signed_up_at`. Keep the existing allowlist branch for buddy/admin/pre-paid.
- **Lead → Expedify** — on first-time self-signup, POST name+phone+signup time to Expedify (new `src/lib/expedify.ts` + call from verify route). Fire-and-forget; never block signup.
- **Meta ad CTA** → `careerrai-daily.vercel.app/start` (optionally preview `/demo` first — already live).

**Files:** `app/start/page.tsx` (new), `request-phone-otp/route.ts`, `verify-phone-otp/route.ts`, `lib/expedify.ts` (new). **Risk:** this is the auth-model change — removes the human approval gate. The SWOT's service-role data-isolation note now matters more; budget a scoping spot-check.

---

### PHASE 3 — Free app + the "buddy-taste" paywall (the real work)

**3a. The gate.** Introduce one helper, e.g. `src/lib/access.ts → isPremium(profile)`, and gate every real-buddy surface on it:
- `src/app/student/buddy/*` — premium → real Buddy Hub; free → **LockedBuddyCard**.
- `src/app/student/chat/*` — premium → real chat; free → locked "chat with your buddy" CTA.
- `src/app/student/analysis` + mock debrief views — premium → real debrief; free → **read-only sample debrief**.
- `src/app/student/layout.tsx` — the bottom nav / badges adapt to free vs premium.

**3b. The desire engine (new components):**
- `LockedBuddyCard` — dashboard card: *"Your IIM buddy (locked) — daily tracking + 1:1 mock analysis. [Unlock]"*.
- **Post-log buddy line** — after a daily log, free users see: *"Streak shuru 🔥 — ek IIM senior abhi is log ko dekhke kal ka plan banata. [Unlock your buddy]"*. (Hook into the existing daily-log success path in `DailyTracker`.)
- **Sample mock debrief** (read-only) — a static, beautifully-rendered example debrief with *"Want this on YOUR mocks?"*.
- **Day-3 gap nudge** — *"3 din ho gaye 👏 par kisi ne check nahi kiya…"* (triggered by streak + no premium).
- The **"Unlock your buddy" sheet** — explains premium, says "we'll set you up on a quick call", **does NOT take payment** (founder closes on the call). Clicking **anything** here = hot signal.

**3c. Engagement tracking (§D).** New `src/app/api/engagement/route.ts` (or extend logging) to record `tour_completed`, `mock_opened`, `sample_debrief_viewed`, and **`buddy_cta_clicks++`** into `student_engagement`. Client fires these on the relevant interactions. **`buddy_cta_clicks` is your hottest buying signal — make sure it's logged reliably.**

**Files:** new `lib/access.ts`, `components/locked-buddy-card.tsx`, `components/sample-debrief.tsx`, `components/unlock-buddy-sheet.tsx`, gap-nudge logic; edits to `student/buddy`, `student/chat`, `student/analysis`, `student/layout.tsx`, `DailyTracker` success path; new `api/engagement/route.ts`. **This is the largest phase — treat it as the product, not a wrapper.**

---

### PHASE 4 — Upgrade webhook (§C) + sales-ready trigger (§D)

- **`src/app/api/payments/webhook/route.ts`** — after `activate_payment`, also: set `is_premium=true`, `premium_since=now()`; **insert into `buddy_assignment_queue` (pending)**; send the "buddy unlocked" confirmation (WhatsApp + in-app). Keep signature-verify + idempotency that already exist. (Cleanest: extend the `activate_payment` RPC to also flip `is_premium` and enqueue, so it stays one atomic transaction.)
- **Add `refund.processed` handling** — set `is_premium=false` (downgrade, **keep the account + logs**), remove pending queue row, log reason.
- **`src/app/api/payments/create-order/route.ts`** — **remove the optimistic `subscription_status:'active'` (line 43).** Access must flip only on the verified webhook, never at order creation. (This is a real bug for the new model.)
- **Sales-ready trigger (§D)** — a small server check (cron or on-write) that sets `student_engagement.sales_ready=true` when `streak_days>=3` OR `buddy_cta_clicks>=1` OR (`mock_opened` && `first_log_at`). Surface a **call queue in `/admin`** (hottest first by `buddy_cta_clicks`), plus the **day-5 fallback** for anyone uncalled.

**Files:** `payments/webhook/route.ts`, `migrations/...activate_payment` (extend RPC), `payments/create-order/route.ts`, new admin call-queue view + `api/admin/sales-queue`. **Risk:** payments — test in Razorpay test mode end-to-end before production.

---

### PHASE 5 — Post-upgrade & buddy intro

- **Instant unlock confirmation** screen/toast (copy from spec 3d).
- **Buddy assignment** — admin view to drain `buddy_assignment_queue` (or auto-assign by fit), set `buddy_id`, mark `assigned`.
- **Buddy intro message** template (spec 3e) sent on assignment.

**Files:** unlock confirmation UI, admin queue-drain action, buddy-intro send. Small.

---

### PHASE 6 — Validate, then scale

- **Dry-run 2–3 fake users** end-to-end on the branch/preview: self-signup → free app → buddy-taste → Razorpay **test-mode** payment → webhook upgrade → buddy assigned. Confirm each `is_premium` flip and queue insert.
- Wire the **funnel metrics (§E)**: tap→signup, signup→first-log (activation), activation→engaged, **buddy-CTA click rate**, engaged→call, call→paid, **free→paid overall**, paid→30-day retention. (Most are queryable from `student_engagement` + `streak_data` + `student_payments`.)
- **Only then** floor the Meta ad spend.

---

## 3. Risk register (read before approving any phase)

| Risk | Why it matters | Mitigation |
|---|---|---|
| **OTP abuse / cost** | Open self-signup = anyone can trigger paid SMS; ~1000-OTP single-vendor plan. | Per-IP/device throttle + global daily OTP ceiling + optional captcha (Phase 2). Monitor vendor quota. |
| **Data isolation** | Removing the human approval gate means many more real accounts; app relies on service-role + per-query `user.id` filters (no RLS safety net in app code). | Run the SWOT §10 scoping spot-check before opening signup. |
| **Production schema migration** | `is_premium` + 2 tables on the production DB; backfill must not downgrade current payers. | Gate apply behind your explicit go-ahead; backfill `is_premium` from `subscription_status='active'`. |
| **Paywall regressions** | Gating buddy/chat/analysis could break existing (grandfathered) students if `is_premium` backfill is wrong. | Backfill first; test with a known paying account before shipping the gate. |
| **`create-order` optimistic activation** | Currently flips `active` before payment — under the new model that's free premium. | Remove it (Phase 4); access flips only on webhook. |
| **Buddy economics** | Free users must NOT land in a buddy's roster (unpaid work). | `buddy_id=null` until premium; queue only on payment. |

---

## 4. Suggested sequencing for *me* (Claude Code), branch-only

I'd build and commit to `claude/status-update-t1g5as` in this order, pausing for your review between each:

1. **Phase 1 migration** (write the SQL; **do not apply to prod** until you say so).
2. **Phase 2 self-signup** (`/start` + inverted gate + abuse guard) — testable on preview.
3. **Phase 3 paywall + buddy-taste** — the big one; I'd split it: (a) `isPremium` gate + LockedBuddyCard, (b) sample debrief + post-log line + gap nudge, (c) engagement tracking.
4. **Phase 4 webhook upgrade + sales queue.**
5. **Phase 5 post-upgrade + buddy intro.**
6. **Phase 6 dry-run + metrics.**

Nothing touches production until you approve the migration apply and the go-live.

---

## 5. Open questions for you

1. **Expedify integration** — do you have an API/webhook for pushing leads, or is it manual for now? (Affects Phase 2 effort.)
2. **`is_premium` vs `subscription_status`** — OK to add the boolean and keep status for billing? (Decision 1.)
3. **Free window** — hard day-5 fallback call, or purely engagement-triggered? (Affects §D cron.)
4. **Captcha** — acceptable to add hCaptcha/Turnstile to `/start` for OTP-abuse protection? (Friction vs. cost trade-off.)
5. **Pre-paid students** — keep the allowlist path for any students you onboard manually/offline, or fully retire it for students?

---

### What I'll do next
Say **"build Phase 1"** (or any phase) and I'll implement it on the branch, commit, and stop for your review. I won't apply the production migration or touch the live deploy without your explicit go-ahead — same guardrail as the perf indexes and the `/demo` push.
