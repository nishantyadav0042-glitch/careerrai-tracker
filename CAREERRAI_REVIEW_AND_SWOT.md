# CareerRai — Full Review Brief & SWOT (Launch Readiness)

> Purpose: a complete, honest snapshot of the CareerRai app for an independent
> code/architecture review (e.g. Codex) and a go/no‑go launch decision. It states
> what exists, how it's built, where the risks are, and what to review first.
> Last updated: 2026‑06‑21.

---

## 1. What CareerRai is

A **mobile‑first PWA for Indian CAT/MBA aspirants**: a daily prep tracker paired
with a **human IIM‑alumni mentor ("buddy")** who runs **weekly 1‑on‑1 video
sessions to analyse the student's mocks together**. Core loop = log daily (≈90s)
→ build a streak → take mocks → mentor debriefs them with you → improve percentile.

Three roles: **student**, **buddy (mentor)**, **admin (founder)**.

Positioning: *"Bharat‑first peer mentorship, 0% commission."* CAT 2026 is 29 Nov 2026.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2.6** (App Router, RSC), **React 19**, TypeScript |
| Styling | Tailwind, `framer-motion`, `lucide-react`, Radix UI primitives |
| Charts | `recharts` (lazy‑loaded) |
| Backend | **Supabase** (Postgres + Auth + Storage), region **Singapore (ap‑southeast‑1)** |
| Data access | `@supabase/ssr` (cookie auth) + **service‑role admin client** in server code |
| Hosting | **Vercel** — two projects from one repo: `careerrai-tracker` and `careerrai-daily` (production) |
| Email | **Resend** (`resend`) |
| Push | Web Push / VAPID (`web-push`) |
| SMS OTP | **indiahost.org** via Supabase "Send SMS" auth hook |
| Payments | **Razorpay** (`razorpay.ts`, `/api/payments/*`) |
| Calendar/Video | **Google Calendar API** (`googleapis`) for session scheduling + Meet links |
| AI | `@anthropic-ai/sdk` + `gemini.ts` (scorecard parsing, feedback/chat drafts, weekly signal) |
| Client state | `@tanstack/react-query` |

Build: `next build` (type‑check + ESLint inline). Node 24.x runtime on Vercel.

---

## 3. Architecture & request path

- **Middleware** (`src/proxy.ts`, runs on every non‑static request):
  1. Read‑only **demo guard** — blocks mutating `/api/*` calls when the `cr_demo`
     cookie is set (all `/api/auth/*` exempt).
  2. Supabase **magic‑link param interception** → forwards to `/auth/callback`.
  3. `supabase.auth.getUser()` — validates **and refreshes** the session.
  4. Route protection: `/student|/buddy|/admin` require a user; `/login` redirects in.
- **Pages** are mostly **Server Components** that read via the **service‑role admin
  client** with explicit `.eq('...', user.id)` scoping, then hydrate small client
  components for interactivity.
- **Auth identity in pages**: `getAuthUser()` (`src/lib/auth.ts`) now uses
  `auth.getClaims()` (local JWT verification when on asymmetric keys) with a
  `getUser()` fallback.

### Routes
- ~35 page routes: `/login`, `/student/*` (tracker, home, today, goal, analysis,
  reports, buddy, chat, journey, exams, profile, settings), `/buddy/(dashboard)/*`,
  `/admin/*` (overview tabs + payments, scholarships, coupons, cat‑leads),
  `/cat-readiness`, `/set-password`.
- ~55 API routes under `/api/*` (auth, logging, chat, voice‑notes, calendar,
  payments, google, admin, cron, profiles).

### Cron (`vercel.json`, 10 jobs)
`daily-reminder`, `session-tomorrow`, `buddy-escalation`, `nishant-weekly`,
`weekly-digest`, `check-red-flags`, `expire-subscriptions`, `renewal-reminders`,
`cleanup-voice-notes`, **`refresh-demo`** (keeps the demo account perpetually fresh).

---

## 4. Authentication & security model

**Three login methods** (login page, OTP‑first):
1. **Mobile OTP (primary)** — Supabase phone OTP; Supabase generates the code and
   calls our `/api/auth/sms-hook` (signature‑verified, optional secret), which
   delivers via indiahost.org (`/send_otp.php?mobile&otp&user&key`).
2. **Email magic link** — Supabase `signInWithOtp({email})` → `/auth/callback` (PKCE).
3. **Email/username + password** — for buddies, admins, returning students.

**Allowlist gating**: phone/email must be in `student_allowlist` (status `active`).
Rate limiting via `otp_send_events` (3 sends / 30 min, 30s cooldown).

**Read‑only demo**: one‑tap `/api/auth/demo-login` signs into the Aarav demo
student (server‑side password, not exposed), sets `cr_demo` cookie; proxy blocks
all mutating `/api/*` calls for that session. A "Demo — view only" banner shows.

**Database**: **all 34 public tables have RLS enabled.** However, the server code
overwhelmingly uses the **service‑role admin client (RLS bypassed)** and relies on
explicit per‑query `user.id` filters for isolation. → **This is the #1 thing to
review** (see §10).

---

## 5. Feature map

**Student:** daily report (sections, energy, stress, sleep, focus), streak system
(`streak_data`, `streak_history`, `streak_shields`, `streak_rewards` — shields/freezes,
milestones, rewards), mock debrief + **auto scorecard scan** (`/api/parse-scorecard`),
**Analysis** (percentile trend, section accuracy, error buckets, strategy notes from
`mock_debriefs`), Goal (target %ile, daily commitment, CAT countdown), Buddy hub
(weekly video sessions, session requests, feedback notes, voice notes, chat), LRDI
daily puzzles, CAT‑readiness diagnostic, journey/reports, push + email reminders.

**Buddy (mentor):** student roster + detail, trends, schedule (Google Calendar /
Meet), earnings/payouts, chat, voice notes, AI‑assisted feedback drafts, SLA tracking.

**Admin (founder):** tabbed dashboard (Overview / Students / Buddies / People & Data /
Broadcast), buddy SLA ranking, churn/red‑flag detection, allowlist + bulk import,
broadcast notifications, Payments/Renewals, Scholarships, Coupons, CAT leads.

**Notifications:** Web Push (VAPID) + email (Resend) + in‑app bell; reminder engine
with rotating copy; broadcast.

**Payments:** Razorpay orders + webhook + refunds; subscriptions (`free_beta`,
plans), scholarships, coupons, buddy payouts.

---

## 6. Data model (34 tables, all RLS)

Identity/access: `profiles`, `student_allowlist`, `otp_send_events`,
`google_oauth_tokens`, `server_config`, `admin_audit_log`.
Tracking: `daily_reports`, `streak_data`, `streak_history`, `streak_shields`,
`streak_rewards`, `brain_break_logs`, `recovery_events`, `todo_items`.
Mocks/tests: `mock_debriefs`, `mock_drop_alerts`, `test_results`, `cat_test_leads`,
`daily_lrdi_puzzles`, `lrdi_puzzle_attempts`.
Mentor: `buddy_feedback`, `buddy_briefings`, `buddy_payouts`, `video_sessions`,
`video_session_history`, `session_requests`, `chat_messages`.
Commerce: `student_payments`, `coupons`, `coupon_redemptions`, `scholarships`,
`reward_claims`.
Other: `notifications`, `analytics_events`, `feedback`, `streak_*`.

Demo freshness: **`refresh_demo_dates()`** Postgres function (daily cron) re‑anchors
the demo account's mock dates, sessions, feedback, chat, notifications, daily‑log
streak (72 days), `profiles.created_at` ("member since"), `streak_data`, and
`test_results` relative to "today" — content unchanged, only dates roll forward.

---

## 7. Performance (current state — important)

**Symptom:** authenticated pages reported at ~6s; target <2s on Indian mobile.

**Diagnosis (hypothesis, being measured):** a 3‑continent split —
**Supabase in Singapore, Vercel functions region not pinned (likely US‑East),
users in India.** Each DB/auth round‑trip pays cross‑region latency, and pages do
several phases → seconds.

**Already fixed (code):**
- `getAuthUser()` → `getClaims()` (local verify, no per‑page Auth network hop;
  `getUser()` fallback). Middleware still validates+refreshes once.
- `/student/goal` converted from a client component (`getUser` → profile → a
  *duplicate* profile query, sequential browser→Singapore) to a Server Component
  with one `profiles` select + a small client editor.
- Temporary `Server-Timing`‑style logging of `process.env.VERCEL_REGION` + phase
  timings on `/goal` and `/tracker` (to be removed after measurement).

**Pending (infra — owner action):**
1. **Pin Vercel Functions region → Singapore (`sin1`)** (project setting / `vercel.json`
   `regions`; `preferredRegion` does NOT apply to these Node functions).
2. **Confirm Supabase uses asymmetric JWT keys** so `getClaims()` verifies locally.

Good existing practices: tracker uses one `Promise.all` for 8 queries; recharts is
lazy‑loaded; `optimizePackageImports` for icon libs; `serverExternalPackages` set.

---

## 8. Known issues / tech debt (be transparent with the reviewer)

- **Service‑role everywhere** → isolation depends on never missing a `user.id`
  filter. No second line of defense if a query is mis‑scoped. (Highest risk.)
- **Cron auth inconsistency**: most cron routes are `POST` + `x-cron-secret`;
  Vercel Cron invokes via **GET + `Authorization: Bearer CRON_SECRET`**. Verify the
  existing crons actually fire. (`/api/cron/refresh-demo` was written to accept both.)
- **Email deliverability** (Resend custom domain / SMTP) not finalized.
- **Demo password** has a hardcoded fallback and lives in this **public repo's git
  history** — rotate before/after launch.
- **Legacy dead code**: `src/lib/msg91.ts` (superseded by `indiahost-otp.ts`).
- **Temp perf instrumentation** (`console.log` perf tags) still in `/goal` + `/tracker`.
- **Single demo account** (Aarav); freshness depends on the daily cron firing.
- Two Vercel projects from one repo → crons/env must be kept in sync on both.

---

## 9. Launch‑readiness checklist

- [ ] Pin Vercel region → Singapore; re‑measure `/goal` + `/tracker` (target <2s).
- [ ] Confirm asymmetric JWT keys (else keep `getUser()`).
- [ ] Verify every cron actually fires (auth method) — esp. reminders + `refresh-demo`.
- [ ] Finalize Resend domain (email login + reminders deliver).
- [ ] Rotate demo/admin password; scrub from any public surface.
- [ ] Razorpay webhook signature verification audited; refund path tested.
- [ ] RLS + service‑role query‑scoping audit (see §10).
- [ ] Remove temporary perf logs after baseline captured.
- [ ] Wrong‑role / unauthenticated access tests across `/student`, `/buddy`, `/admin`.
- [ ] indiahost OTP quota/monitoring (currently a 1000‑OTP plan, single vendor).

---

## 10. What to review first (focus areas for the code reviewer)

1. **Data isolation under service‑role.** Grep every `createAdminClient()` usage and
   confirm each read/write is scoped to the authenticated `user.id` (or properly
   role‑gated for admin/buddy). A single missing filter = cross‑tenant leak.
2. **Authorization on API routes.** Confirm each `/api/*` mutating route re‑checks
   the caller's identity/role server‑side (not just middleware), and that buddy/admin
   routes verify role, not just authentication.
3. **Payments**: Razorpay webhook signature verification, idempotency, and that
   subscription state can't be forged client‑side.
4. **Cron security + delivery**: secret checks and whether Vercel actually triggers them.
5. **Auth correctness**: `getClaims()` fallback path; the SMS‑hook signature check;
   PKCE callback; allowlist gating; rate‑limit bypass.
6. **Performance**: confirm the region hypothesis with the logged `VERCEL_REGION`;
   look for remaining client‑side fetch waterfalls (`'use client'` + `useEffect` +
   sequential Supabase calls) on `/reports`, `/analysis`, `/profile`, buddy pages.
7. **Read‑only demo**: confirm the proxy guard can't be bypassed and the `cr_demo`
   cookie is cleared on every real login path.

---

## 11. SWOT

### Strengths
- **Differentiated model**: daily tracking + *human IIM mentor* + *weekly video
  mock‑analysis* — directly targets the documented pain that aspirants take 30+
  mocks but never learn to analyse one; cohort/mentor accountability has strong
  completion‑rate evidence.
- **Breadth already built**: tracking, streaks/gamification, mock analysis with AI
  scorecard scan, mentor tooling, payments, scholarships/coupons, admin ops, push/email.
- **Security baseline**: RLS enabled on all 34 tables; allowlist‑gated signups;
  signature‑verified SMS hook; read‑only sandbox demo as a sales asset.
- **Self‑serve demo** that's perpetually fresh (cron‑anchored) — lets a prospect
  feel "I should be doing this" without a salesperson.
- **Mobile‑first PWA**, OTP‑first login suited to the Indian audience.

### Weaknesses
- **Performance**: ~6s loads from the Singapore‑DB / US‑functions / India‑users split
  (fix identified, not yet applied).
- **Security depends on discipline**: heavy service‑role usage means RLS is bypassed
  in app code; one mis‑scoped query leaks data.
- **Operational fragility**: cron auth/delivery unverified; email deliverability
  unfinished; single SMS vendor with a quota; demo password in public git history.
- **Scalability of the core promise**: weekly 1‑on‑1 *human* video sessions are
  hard to scale and margin‑sensitive.

### Opportunities
- **Region fix → sub‑2s** should lift activation/retention (Indian edtech conversion
  ~2–3%, churn 70–80% in month one — speed and first‑run matter a lot).
- **Asymmetric JWT keys** → cheaper, faster auth at scale.
- **AI‑assisted mock analysis** as a wedge that scales the mentor (drafts, summaries).
- **Conversion levers from research**: EMI options, WhatsApp‑led onboarding,
  outcome‑specific "person‑like‑me" proof, visible cohort accountability.
- **The streak/identity mechanic** (loss aversion, 72‑day demo streak) is a strong
  retention hook if surfaced prominently.

### Threats
- **Indian edtech churn** (70–80% month‑one) and **low conversion** baselines.
- **Established competition** (iQuanta, 2IIM, T.I.M.E., coaching) with brand + scale.
- **Vendor/infra risk**: indiahost OTP quota/single vendor; Supabase free‑tier limits
  at scale; Razorpay/Google API dependencies.
- **Trust/security incidents** would be costly given the service‑role exposure.
- **Mentor supply**: quality IIM‑alumni mentors are the bottleneck for the weekly‑session
  promise as the user base grows.

---

## 12. Recommendation

**Conditional go.** The product is feature‑complete and demonstrably compelling. The
two launch‑blocking items are operational, not product: **(a) pin the Vercel region
to Singapore and confirm sub‑2s**, and **(b) the service‑role data‑isolation audit**.
Everything else in §9 is fast follow. Fix (a) and (b), spot‑check crons + email, and
launch.
