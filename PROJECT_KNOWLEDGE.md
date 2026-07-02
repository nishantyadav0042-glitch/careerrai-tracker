# CareerRai — Project Knowledge

_A single reference for how CareerRai is built, configured, and operated. No secrets or private keys are stored in this doc — sensitive values live in the DB config table / Vercel env and are referenced by name only._

---

## 1. What it is

**CareerRai** is a **CAT-exam-prep accountability app** for Indian aspirants. Students log their prep daily; an **IIM-alumni "buddy"** mentors and holds them accountable. Mobile-first **PWA** (installable, push notifications).

**Business model — freemium:**
- Self-signup is **free** (the tracker, mocks, analysis, streaks).
- The **buddy is the paywall**: an IIM mentor is a **premium** upgrade (₹999/month and longer plans).
- Free students see a **locked buddy hub** (upsell). Existing/grandfathered users were set premium so the paywall only affects new signups.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2.6** (App Router, RSC), **React 19.2.4** |
| Language | TypeScript |
| Styling | Tailwind CSS (stone/orange/teal palette) |
| Data / auth | **Supabase** (Postgres + RLS, phone-OTP auth, service-role admin client) |
| Client state | `@tanstack/react-query` 5.x |
| Hosting | **Vercel** (production from `main` only) |
| PWA / push | `web-push` (VAPID), service worker, manifest |
| Video | **Daily.co** (REST API, one server key) |
| Payments | **Razorpay** (raw HTTP, no SDK) — feature-flagged |
| AI | Gemini (`GEMINI_API_KEY`) for nudges/insights |

Scripts: `npm run dev | build | start | lint`. ~66 API routes, ~38 DB tables.

> ⚠️ **Read `AGENTS.md` before coding** — the repo pins a Next.js version with breaking API changes; docs live in `node_modules/next/dist/docs/`.

---

## 3. Infrastructure & IDs

| Thing | Value |
|---|---|
| Vercel team | `team_A1UBxPMxuPnMiXsWP094LD35` |
| Vercel project | `prj_u0nHt9NEO8a5UmItuDe3ESA4dFh7` (`careerrai-daily`) |
| Production URL | `https://careerrai-daily.vercel.app` |
| Supabase project | `pobhpszlsozeonejtzqy` |
| Supabase region | `ap-southeast-1` (Singapore) |
| Server functions region | `sin1` (`preferredRegion` in root layout — colocated with DB) |
| Daily.co domain | `careerrai.daily.co` |
| GitHub repo | `nishantyadav0042-glitch/careerrai-tracker` (public) |
| Working branch | `claude/status-update-t1g5as` |

---

## 4. Deployment & branch workflow

- **Production deploys ONLY from `main`.** Every push to `main` triggers a Vercel production build.
- Develop on the feature branch → merge to `main` → push. Branch histories can diverge; reset `main` to `origin/main` before merging.
- Vercel also builds **preview** deploys for the feature branch (behind SSO wall, lack prod env — don't rely on them for testing paid/DB features).
- After a deploy, the **service worker auto-updates** (network-only fetch handler, v4). A device on an old SW needs a **one-time cache clear** (Chrome ⋮ → History → Clear browsing data → "Cached images and files") to pick up the new build.

---

## 5. Roles & authentication

Three roles on `profiles.role`: **student**, **buddy**, **admin**.

- **Auth = phone OTP** (Indian numbers, via SMS). No passwords for signup; optional password set later.
- **Self-signup** (no allowlist entry) → creates a **free student** (`signup_source='self_serve'`, `is_premium=false`).
- **`student_allowlist`** pre-assigns a role: an entry with `person_type='buddy'` makes that number a **buddy** on login; otherwise student. Admins manage it in the admin panel (People & Data).
- **Admin phone** is stored in `server_config.ADMIN_PHONES_E164` (never hardcoded in source). That number always resolves to `role='admin'`.
- A `handle_new_user` DB trigger creates a bare `profiles` stub ("New User") the instant an auth user is created; the verify-OTP route then fills real name/role/buddy.
- Role is cached in a `user_role` cookie for fast layout routing.

**Login entry points:** `/login` (Student/Buddy role picker + OTP), `/start` (freemium self-signup landing for ads), `/demo` (one-tap read-only demo session).

---

## 6. App structure (routes)

**Student** (`/student/*`): `tracker` (home/daily log), `home`, `today`, `exams` (**Mocks** — logs `test_results`), `analysis` (percentile trajectory), `buddy` (paywalled hub), `chat`, `reports` (History), `journey`, `goal`, `profile`, `settings`.
Bottom nav (primary): **Home · Mocks · Analysis · Buddy · Chat** + More (History/Profile/Settings).

**Buddy** (`/buddy/(dashboard)/*`): `home`, `students` + `students/[id]`, `schedule` (video sessions), `chat` + `chat/[studentId]`, `trends`, `earnings`, `profile`, `settings`. Setup gate: `/buddy/setup` (storefront) before dashboard.

**Admin** (`/admin`, single page + sub-pages): Overview / Students / Buddies / People & Data / Broadcast tabs; sub-pages `payments`, `coupons`, `scholarships`, `cat-leads`, `sales-queue`.

---

## 7. Data model (key tables)

38 tables. The important ones:

| Table | Purpose |
|---|---|
| `profiles` (67 cols) | Users (student/buddy/admin), onboarding data, `is_premium`, `buddy_id`, `notif_prefs`, `push_subscription`, subscription fields |
| `daily_reports` (23) | The daily log — hours, sections/topics, `mock_taken`, scores, energy, emotional chips |
| `mock_debriefs` (14) | Deep per-mock analysis (VARC/DILR/QA + percentile), keyed by `log_date` |
| `test_results` (9) | Mock/diagnostic scores shown on the Mocks page |
| `video_sessions` (23) | Buddy↔student sessions; `google_meet_link` column stores the **join link** (now a Daily/Jitsi URL) |
| `streak_data` / `streak_history` / `streak_shields` / `streak_rewards` | Streak system |
| `student_engagement` (11) | Sales-ready / engagement signals |
| `student_allowlist` (9) | Pre-authorized numbers + `person_type` (student/buddy) |
| `notifications` (12) | In-app + push notifications (`type` is free-text) |
| `student_payments` / `refund_requests` / `coupons` / `coupon_redemptions` / `scholarships` | Payments & pricing |
| `buddy_feedback` / `buddy_briefings` / `buddy_payouts` / `session_requests` | Buddy workflow |
| `cat_test_leads` (16) | Lead capture (Meta ads → CAT readiness) |
| `server_config` (2) | **DB-backed config** (key/value) — see §8 |
| `analytics_events` / `admin_audit_log` | Tracking & audit |

**FK cleanup note:** most child tables `CASCADE` on profile delete; a few are `NO ACTION` (`feedback`, `profiles.buddy_id`, `profiles.shadow_rival_id`, `todo_items.created_by`) — clear those before deleting a profile, then delete the `auth.users` row too.

---

## 8. Configuration & secrets

Two config sources, resolved by `getServerConfig(key, envVar?)` in `src/lib/server-config.ts` — **env var first, then the `server_config` DB table** (cached). This lets us change config **without a Vercel redeploy**.

**In `server_config` (DB, RLS-locked — values never in source):**
`ADMIN_PHONES_E164`, `DAILY_API_KEY`, `GEMINI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`.

**In Vercel env (build-time / secrets not in DB):**
- `NEXT_PUBLIC_PAYMENTS_ENABLED` — payments kill-switch (build-time `NEXT_PUBLIC_`; must be `true` to show any payment UI). Beta default: **OFF**.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Supabase service-role key.
- `NEXT_PUBLIC_APP_URL`.

> 🔒 The repo is **public** — never hardcode secrets, the VAPID private key, or the admin phone in source. VAPID keys are **DB-authoritative** (public + private must be a matched pair, so env is ignored for them).

---

## 9. Key features & how they work

**Daily log** (`src/components/DailyTracker/`): hours, study sections, energy, emotional chips → `POST /api/logging/log-daily`. Includes an **explicit required "Did you take a mock test today?"** Yes/No. "Yes" sends `'Mock'` in `sections` → `mock_taken=true` → **auto-opens the mock debrief** after logging. If a mock is logged but not debriefed, the debrief **re-opens on every visit until filled** (loud `PendingDebriefCard` fallback).

**Mocks** = primary nav tab (`/student/exams`, "Mock Tests"). Data drives analysis, percentile trajectory, and the buddy's plan.

**Buddy video sessions** (`/api/calendar/schedule-meeting`): buddy schedules → server creates a **Daily.co room** (one API key, **no per-user OAuth/verification**) → link stored on `video_sessions` → student notified in-app. **Jitsi fallback** (`https://meet.jit.si/CareerRai-<uuid>`) if Daily is unconfigured/errors, so scheduling never breaks. Neither students nor buddies connect Google anymore.

**Push notifications** (`web-push` + VAPID, DB-authoritative keys): toggle in student profile with a live step-by-step diagnostic; **mandatory PushGate** after onboarding (students) / on dashboard (buddy & admin). New self-serve signups alert admins (in-app + push).

**PWA install funnel:** prominent Install banner on `/login` and `/start`; **Instagram/Facebook in-app-browser escape** on `/start` (Android intent→Chrome, iOS coached "open in Safari"); proper square + maskable icons; SW v4 (network-only, installable + never stale). WhatsApp install link in the admin's outreach message (opens in the real browser).

**Demo:** `/demo` signs a lead into a read-only demo student (`is_demo=true`, prefers Aarav) — proxy blocks writes. 5 demo students maintained.

**Admin students:** newest-first "New signups" vs "Demo accounts", join date + "New" badge, tap-to-call + WhatsApp buttons.

---

## 10. Integrations

- **Supabase** — DB, auth, RLS. Server routes use a service-role **admin client** for privileged writes; client uses anon + RLS.
- **Daily.co** — video rooms via REST (`src/lib/daily.ts`). Verify: `GET /api/admin/daily-status`.
- **Razorpay** — `src/lib/razorpay.ts` (order create + webhook signature verify). Routes: `/api/payments/create-order`, `/webhook`, `/request-refund`. Verify: `GET /api/admin/payments-status`.
- **Web Push** — `src/lib/push.ts`, VAPID DB-authoritative. Endpoints under `/api/push/*`.
- **Gemini** — prescriptive nudges / insights.

---

## 11. Health-check / debug endpoints

- `GET /api/admin/daily-status` → `{configured, ok, domain}` for Daily.co (no key returned).
- `GET /api/admin/payments-status` → `{paymentsEnabled, hasKeyId, hasKeySecret, hasWebhookSecret, mode(test/live), keysValid, apiStatus}` (no keys returned).
- `GET /api/push/vapid-public-key` → DB public key for client subscribe.
- `POST /api/push/test` → sends a test push to the signed-in user.

---

## 12. Testing notes

- **Fresh student:** delete the profile + `auth.users` row + any `student_allowlist` entry for the number, then log in via **Student** → OTP → tour → onboarding → push gate.
- **Fresh buddy:** add a `student_allowlist` row (`person_type='buddy'`, `status='active'`) for the number, then log in via **Buddy** → OTP → `/buddy/setup`.
- **Unlock buddy on a test student:** set `is_premium=true, subscription_status='active'` on the profile.
- **Delete a day's log:** delete the `daily_reports` row for that `report_date` (+ matching `mock_debriefs.log_date`), optionally reset `streak_data.current_streak`.

---

## 13. Known constraints & gotchas

- **Agent sandbox proxy** blocks many third-party APIs (Daily, Razorpay, FCM, Mozilla/Apple push) — verify those from **production**, not the build sandbox.
- **iOS push/install** only work for an **installed PWA** (Add to Home Screen via Safari); no programmatic install on iOS (WebKit).
- **Instagram/Facebook in-app browsers can't install a PWA** — the escape-to-real-browser step is mandatory for ad traffic.
- **Payments dormant** unless `NEXT_PUBLIC_PAYMENTS_ENABLED=true` in Vercel, even with valid keys.
- **Onboarding "Log Day 1"** screen still uses the older topic chips (incl. "Mock Test") — not yet aligned with the main daily log's explicit mock question.
- **DB type rule — percentiles/scores are decimals.** CAT students enter decimals (76.2, 99.5). Any column a user-facing form writes a percentile/score into MUST be `numeric`, never `smallint`/`integer` (a decimal into an int column 500s with "invalid input syntax for type smallint" — this hard-broke student onboarding on 2026-07-02). All existing percentile/score columns were migrated to `numeric(5,2)` (profiles baseline/target/first-attempt, daily_reports mock scores, test_results). When adding a new numeric column or form input, match the column type to what the input allows, and never swallow the Supabase error — surface `error.message`.
- **Retry-safe writes.** Any client write that can run twice (onboarding steps, log submissions) must be an `upsert` on its natural key, not a bare `insert` — a failed later step + retry otherwise dies on the unique constraint.

---

## 14. Recent changes (this working session)

Push diagnostic + mandatory push gate · admin students reorg (WhatsApp, new-signup alerts, 5 demos) · PWA install funnel (IAB escape, icons, manifest, one-click SW fix) · install banners on login/start · **Google removed from video → Daily.co (Jitsi fallback)** · student & buddy Google-connect UI removed · **daily-log explicit mock question + forced debrief** · **Mocks promoted to primary nav** · Daily.co + payments health-check endpoints · `Bash(git push:*)` pre-authorized in `.claude/settings.local.json`.

_Deep-research reports (install funnel; mock discoverability/habit) were run for strategy grounding._
