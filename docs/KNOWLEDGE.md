# CareerRai — The Knowledge Document

**The single entry point to everything this company knows about itself.**
Written 29 Jul 2026, against the live database and the code at commit `1962f8a`.

**The test this document holds itself to:** if every engineer left tomorrow and
all that remained were the source code and this file, a new team should be able
to understand what CareerRai is, why it is built this way, what is true right
now, and what to do next — without a single conversation.

Rules this file follows:
- **Every load-bearing claim carries evidence** (a file path, table, or query).
- **Claims verified against production are marked ✅; inferences are marked
  with confidence.** Nothing is stated as fact that was not checked.
- **This is a map, not the territory.** Deep detail lives in the linked docs;
  this file tells you which one to open and why it exists.
- **For CODE orientation — where things live, which modules you must not
  bypass, the invariants with guard tests — read `docs/CODEMAP.md` first.**
  This file is the company; that file is the codebase.
- **Dated facts rot.** Every number here is stamped 29 Jul 2026. Re-run the
  query before trusting a number older than a week.

---

## 0. The mission — read `docs/MISSION.md` first

Everything below this line describes what CareerRai **is today**.
`docs/MISSION.md` describes what it is **for**, and it outranks every other
document in this repo including the OS Constitutions.

> Build a free, massively used student platform that continuously learns how
> Indian students actually study, struggle, decide, improve, interact, and
> eventually achieve outcomes — and use small amounts of monetisation only to
> keep that machine running.
> — *founder, 12 Aug 2026*

The four questions every feature must pass, the four student-facing surfaces,
the standing product decisions, and the honest retention gap all live in that
file. Do not design a feature without it.

---

## 1. What CareerRai is

**One sentence:** a daily CAT-prep accountability system — a study plan that
rebuilds itself from what the student actually did each day, backed by a real
IIM-alumni mentor ("buddy") as the paid layer.

**The core loop** (everything else exists to serve this):

```
morning: today's plan (3 blocks, first one marked "Start Here")
   ↓
student studies
   ↓
evening/next morning: "Update topics studied today" — the check-in
   (4 outcomes: Studied / Studied a bit / Didn't study / Rest-away)
   ↓
plan REBUILDS same-day from the answer, with a visible 0→100% animation
   and a because-line ("Percentages first — it didn't get finished yesterday")
   ↓
streak advances → coverage updates → pace recalculates → tomorrow's plan
```

Evidence: `src/lib/check-in.ts`, `src/lib/plan-freshness.ts`,
`src/components/plan-rebuild-payoff.tsx`, `src/app/api/routine/today/route.ts`.

**The business model:** free product is the loop above. Paid (₹999 recorded
price point, Razorpay) unlocks the human: unlimited 1:1 mentor chat, voice
notes, weekly sessions, mock-test debriefs by a real person. The paid pitch is
"a real IIM topper reads your score — not a bot" (`src/app/welcome/page.tsx`).

**Why this shape** (inference, 90%): CAT prep fails on consistency, not
content. Content is commoditised (coaching institutes, YouTube); accountability
is not. Every design decision in `docs/OS/LEARNING-OS.md` treats the daily
check-in as the product and content as the excuse for it.

---

## 1.5 Addendum — what changed 6–7 Aug 2026 (verified in production) ✅

The snapshot below (§2) is stamped 29 Jul. These load-bearing facts changed
since and supersede anything that contradicts them:

- **Daily hours: one number, one owner.** `study_target_hours` is written only
  by `lib/daily-hours.ts setDailyHours()` from a student action. The old
  date→hours rewrite, capacity capping and `volumeFactor` are all REMOVED.
  Falling behind moves the finish date instead — weekly, Sunday 19:00 IST
  (`api/cron/weekly-plan-reconcile`), with the arithmetic shown. All 257
  students carry `study_hours_source` provenance; unconfirmed ones get a
  one-time in-app "is this number yours?" card.
- **Coaching timetable is a PREMIUM feature, curated with the buddy.** Upload
  accepts Excel (.xlsx/.xlsm/.csv) natively — daily + weekly sheets merge;
  plans >30 days are windowed to 3 weeks in code. Buddies edit their
  student's timetable (`api/buddy/student-timetable`); both writers share
  `lib/timetable-apply.ts`. Today's classes lead today's plan (45-pt selector
  bonus); a horizon cron reminds students to upload the next sheet. Free
  students see a locked card with "Unlock with a mentor".
- **Chat attachments** now include spreadsheets, with byte-verification that
  parses zip structure (generator-agnostic). One save path; rejected uploads
  auto re-upload. The bucket allowlist and app allowlist are guard-tested to
  match.
- **Sessions run on pasted meeting links as the primary path** (proven live —
  Vedashri↔Shreya, 6 Aug). Google OAuth remains unconnected
  (`google_oauth_tokens` = 0 rows) pending founder credential setup; every
  connect failure now renders a named banner instead of silence.
- **Mission queue** rotates alternate-day pools with a 14-day cooldown;
  messages carry computed exam countdowns and the app link.
- The founder tests as a student from +91 8233454449 (premium, Test Buddy);
  test accounts are IN experience crons, OUT of metrics/CRM/outreach.

## 2. The state of the company — 29 Jul 2026 snapshot ✅

All verified against production Postgres this day. Re-query before reuse.

| Fact | Value | Source |
|---|---|---|
| Real students (not test/demo) | **247** | `profiles` role=student |
| Buddies (mentors) | **7** | `profiles` role=buddy |
| **Paying students** | **0** | `is_premium` excl. test accounts |
| Recorded payments, ever | 1 × ₹999 — on a test account | `student_payments` |
| Total daily logs ever | 140 | `daily_reports` |
| Sales-ready, uncalled leads | 186 | `student_engagement` |
| Students who explicitly want a mentor | see `getWantsBuddy` | `lib/admin-filters.ts` |
| Signup AI-calls placed (Expedify) | 135 sent | `profiles.expedify_status` |
| Follow-up AI-calls dispatched | 38 (two batches of 19, 29 Jul) | `profiles.expedify_followup_at` |
| Expedify outcomes received back | **0 — return webhook never configured** | `expedify_events` |
| Daily Pick stock (never-featured) | 49 questions / 37 tips vs 30-day target | `student_submissions` |
| Postgres tables | 73 | `information_schema` |

**The single most important line in this table:** 247 students, 0 paying.
CareerRai today is a pre-revenue product with real engagement (140 logs, live
streaks, votes) and an unproven paid conversion. Every "growth" system in this
codebase (sales queue, Expedify calls, mentor doors, buddy showcase) is an
attempt to cross that line. Nothing has crossed it yet.

---

## 3. How to think about this codebase — the Five Operating Systems

The repo is governed by five "OS" constitutions plus an engineering playbook.
These are **binding**: a change that violates one is wrong even if it works.
(`AGENTS.md` is the enforcement hook — every AI/engineer session loads it.)

| OS | Domain | The one rule that matters most | File |
|---|---|---|---|
| **Learning** | plans, schedules, revision | The plan must adapt to the student, never the reverse | `docs/OS/LEARNING-OS.md` |
| **Trust** | mentors, payments, testimonials | **"No invented testimonials or stats. Ever."** Empty is fine, fake is not | `docs/OS/TRUST-OS.md` |
| **Notifications** | push, reminders, delivery | Every notification must be decidable + auditable (decision engine, not ad-hoc sends) | `docs/NOTIFICATION-OS.md` |
| **Growth** | acquisition, install, funnels | Attribution before spend; the funnel is instrumented end-to-end | `docs/OS/GROWTH-OS.md` |
| **Analytics** | events, KPIs | One event registry (`EventName` union in `lib/journey.ts`) — a typo fails the build | `docs/OS/ANALYTICS-OS.md` |

**Institutional memory with teeth:** `docs/ENGINEERING-MEMORY.md` — 11 logged
incidents, each ending in a *prevention encoded in code*, not a lesson in
prose. Read it before touching any subsystem it names. The standing rule: an
incident is only closed when repeating it has been made impossible.

**Decision log:** `docs/DECISIONS.md`. **Why-the-architecture:**
`docs/ARCHITECTURE-DUE-DILIGENCE-2026-07.md` and
`docs/CTO-DUE-DILIGENCE-MEMO-2026-07.md`.

---

## 4. Architecture — one diagram's worth of truth

```
Students/Buddies/Admin (browser, PWA, Android TWA, iOS WKWebView wrapper)
        │
        ▼
Next.js 15 App Router on Vercel (region sin1, deploys ONLY from main)
  ├─ src/proxy.ts ── middleware: canonical-host 308s, Supabase session
  │                  refresh, cr_store cookie (store-build flag), auth gates
  ├─ ~85 pages (student/, buddy/, admin/, sales/, public)
  ├─ 146 API routes (src/app/api/**)
  └─ 32 Vercel crons (vercel.json) — every scheduled behaviour in the product
        │
        ▼
Supabase (ap-southeast-1): Postgres 17 (73 tables, RLS on), Auth, Storage
        │
External: Razorpay (payments) · Expedify (AI sales calls) · web-push (VAPID)
          · Resend (email) · MSG91 (OTP) · Gemini/Anthropic (AI features)
```

Load-bearing facts a newcomer must know **before** their first change:

1. **All student traffic goes through API routes using the service-role
   client** (`lib/supabase/admin.ts`). RLS exists as defence-in-depth, not as
   the primary authorisation layer. Authorisation lives in the routes.
2. **`src/proxy.ts` is the middleware** (Next 15 renamed it). It sets the
   `cr_store` cookie from `?source=twa|ios` — the flag that makes store builds
   behave (hide install banners, escape payments to browser). Losing that flag
   silently breaks App Store compliance. One accepted-values list:
   `normalizeStoreSource` in `lib/store-build.ts`.
3. **Vercel builds only `main`** (`vercel.json` ignoreCommand). Pushing any
   other branch deploys nothing — a fix is invisible until it's on main.
4. **The web IS the mobile apps.** Android (TWA) and iOS (wrapper) render
   careerrai.in. Web deploys reach app users instantly, no store review.
   Native rebuilds are needed only for shell changes (icon, start URL, SDK).
5. **This is NOT the Next.js in the training data.** Read
   `node_modules/next/dist/docs/` before writing framework code (`AGENTS.md`).
6. **IST is the product's clock.** Day boundaries use `Asia/Kolkata`
   (`getLogDateString` in `lib/streak-utils.ts`); crons in vercel.json are UTC.
   Mixing these has caused bugs before; it is why the helpers exist.

**Dependency spine** (what breaks what):

```
topics-constants.ts (the syllabus graph)
  → blueprint-builder.ts (the plan)  → routine-engine.ts (today's 3 blocks)
  → coverage-status.ts (covered/left) → mastery engines (QA/VARC/DILR)
check-in.ts → plan-freshness.ts → /api/routine/today (same-day rebuild)
streak-utils.ts → everything that says "streak" (admin filters, nudges, UI)
lib/journey.ts (EventName union) → every track() call in the product
lib/admin-filters.ts → dashboard counts AND sales queue AND Expedify dispatch
                       (deliberately ONE definition — see §8, incident class)
```

---

## 5. The domain systems, and why each exists

### 5.1 Plan & Learning engine
`plan-day.ts` (**start here** — the ONE day-builder both writers call),
`routine-engine.ts`, `topic-selector.ts`, `day-topics.ts`, `focus-sections.ts`,
`revision-due.ts`, `timetable-day.ts`, `blueprint-builder.ts`, `study-pace.ts`.

*Updated 14 Aug.* This list used to name `syllabus-feasibility.ts`, the
per-section mastery engines and the three topic graphs. **All of those are
gone** — the mastery engines and `/api/mastery` in the study-plan audit, the
graphs and `syllabus-feasibility.ts` in the dead-code sweep that followed. They
had no callers, and the per-section graphs carried a *contradictory* weightage
table (Para Jumbles 5 there, 3 in `TOPIC_METADATA`) that would have started
disagreeing with the planner the moment anyone wired them back up.
`topics-constants.TOPIC_METADATA` is the single topic authority; feasibility
now lives in `date-feasibility.ts`.
The student sets the finish date; the system computes feasible pace and builds
backwards. Same-day regeneration (founder-approved 29 Jul): a check-in stamps
`daily_reports.updated_at`; if it postdates the routine's `created_at`, the
plan rebuilds (`plan-freshness.ts` — note `created_at` is stamped explicitly on
upsert, because the UPDATE path preserving old timestamps caused an infinite
regeneration bug; regression test exists).

### 5.2 Check-in (the product's heartbeat)
Vocabulary is founder-chosen and fixed: the surface says **"Update topics
studied today"** — never "log" (unfamiliar to CAT aspirants). BUT the data
contract keeps legacy names: `submitLog`, `useLogging`, `LoggingModal`,
`/api/logging/log-daily`, `log_date`. **Renaming UI copy is free; renaming
contract identifiers is forbidden** — they're load-bearing across analytics.
The four outcomes live in ONE place: `OUTCOME_OPTIONS` in `lib/check-in.ts`
(a drifted duplicate once produced two different sets of options on two
screens — Incident class, see §8).

### 5.3 Streaks & momentum
`streak-utils.ts`. Two notions, deliberately distinct: **live streak** (logged
today) vs **momentum streak** (shields/grace). Admin surfaces use
`momentumStreak`; anything that says "streak is alive" must go through these
helpers, never raw `current_streak`.

### 5.4 Daily Pick (community)
"Students create. Students vote. The system ranks." Two content kinds (tip
≤`MAX_TIP_CHARS`, question). Pipeline: safety gate (`community-safety.ts`) →
72h voting → featured/archived → **recycling** (`community-recycle.ts` — the
shelf can never be empty; lazily self-heals if the cron dies). Daily Top Pick:
max votes wins the slot for exactly one day; no votes → queue advances
(`daily-pick.ts` + `daily-pick-runner.ts`, idempotent, IST day boundary).
**Attribution is a Trust-OS matter:** curated rows carry `curated = true` and
render "— Curated by CareerRai", never a student byline
(migration `20260729_daily_pick_curated_flag.sql`, Incident #11). Seed stock +
quality bar (named trap in every explanation, no RC, phone-length cap) is
enforced by `src/lib/daily-pick-seed.test.ts`; content in
`scripts/daily-pick-seed.json`, loader `scripts/seed-daily-pick.mjs`.

### 5.5 Buddy (mentor) system — the paid product
Pairing via `profiles.buddy_id`; free users see the showcase + paywall
(`LockedBuddyHub`). **Mentor Doors** (`lib/mentor-doors.ts`): a dormant-by-flag
free-taste system — 3 free messages to a matched mentor through the same chat
pipe. Chat: `chat_messages`, send route enforces pairing, message caps, and —
since 29 Jul — **bidirectional blocks** (`chat_blocks`, `lib/chat-safety.ts`;
App Store 1.2 / Play UGC). Report+block UI lives in the thread header
(`components/chat/report-conversation.tsx`). Voice notes: Supabase Storage +
signed URLs + cleanup cron.

### 5.6 Payments
Razorpay only. `student_payments` stores order/payment ids, amount, plan —
**card data never touches our servers** (relevant to both stores' data forms).
Store-build rule (`lib/store-build.ts`): inside TWA/iOS wrapper, checkout
escapes to the real browser via one-time logged-in handoff `/go`
(Apple 3.1.1 / Play Billing posture: live 1:1 human mentorship = real-world
service exemption. This is a *reviewer judgement*, flagged as the #1 store
risk in both upload guides). Refunds: `refund_requests` + admin surface.

### 5.7 Sales & Expedify (AI calling)
The founder's conversion machine for the 0→1 paying problem:
- `student_engagement.sales_ready` flags hot free users;
  `getSalesReadyToCall` (`lib/admin-filters.ts`) is THE ranking — dashboard,
  `/admin/sales-queue`, and the dialler all share it by design.
- **Outbound:** signup hand-off (`lib/expedify.ts`, flush cron) sends a full
  `student-brief.ts` so the AI agent calls knowing the student. Batch
  follow-ups: `/api/admin/expedify-followups` (admin-only, dry-run default,
  14-day cooldown stamped in `profiles.expedify_followup_at`, skips the #1
  lead for a personal call).
- **Inbound:** `/api/expedify/outcome` (audit table `expedify_events`,
  dedupe, phone-variant matching) → `call_feedback` via ONE merge
  (`lib/call-feedback.ts`) → lead card + Excel export.
  **Status 29 Jul: outbound works (173 calls dispatched); inbound has never
  fired — Expedify's side isn't pointed at our webhook. Until that's fixed the
  loop is write-only.** ✅

### 5.8 Notifications
Web push (VAPID) with delegation into the TWA. The design centre is
`notification-decision.ts`/`notification-engine.ts`: sends are *decided*
centrally and audited, not sprinkled through the codebase. Health surfaces:
`/admin/notification-health`, push forensics doc (`docs/PUSH-FORENSIC-AUDIT.md`).
The service worker (`public/sw.js`) **must never answer navigations** — v6's
`respondWith(fetch().catch(() => Response.error()))` turned any transient
failure into a permanent blank screen inside WKWebView (0 bytes, "offline"
icon, Safari unaffected). v7 lets navigations pass to the browser stack.
This one line cost a day of iOS debugging; do not reintroduce it.

### 5.9 Analytics & Journey
`lib/journey.ts`: batched, beacon-flushed client events; **closed `EventName`
union** — new events are added to the type first, so typos fail the build
instead of minting phantom metrics (58 free-form names had accumulated before).
Context on every event: display-mode, browser, platform — the fields that
answered "was push granted in the app or a tab?" Admin reading surfaces:
`/admin/analytics`, `/admin/launch`, `metric-registry.ts` (one definition per
metric, same reason as admin-filters).

---

## 6. Distribution — where the app stands in each channel (29 Jul 2026)

| Channel | State | The next action | Guide |
|---|---|---|---|
| **Web / PWA** | Live at careerrai.in, canonical host enforced | — | — |
| **iOS App Store** | **Build 1.0 (3) uploaded; resubmission ready; Resolution Center reply posted.** Prior rejection (2.1 unreachable login, 2.3.10 foreign status bar, 2.3.3 stale screenshots) fully remediated; iPhone-only; review account seeded (21-day streak, coverage, mentor+chat, 2 debriefs) | Founder clicks **Resubmit to App Review** | `docs/APP-STORE-SUBMISSION.md`, `docs/XCODE-RESUBMIT-GUIDE.md` |
| **Google Play** | Package built 29 Jul (`CareerRai.aab`, new keystore; both fingerprints live in `assetlinks.json` — a third arrives after Play re-signs). Uploading via a friend's developer account (**option A: he owns the listing — an app-transfer conversation is owed**) | Sumukh uploads; send back App-signing SHA-256 | `docs/PLAY-STORE-UPLOAD-GUIDE.md`, `docs/ANDROID-BUILD-HANDOVER.md` |

**iOS wrapper post-mortem in one line each** (all three were real, only one
was the final cause): app-bound domains list was case-mismatched then deleted
(red herring — flag already `false` in code); service worker could fabricate
network errors (real latent bug, fixed, not the cause); **the start URL was
`https://https//careerrai.in/...` — a doubled scheme, DNS failure, blank
screen** (the cause; found via Safari Web Inspector in one look).
Lesson, encoded in the Xcode guide: attach the inspector *first*, theorise second.

**Account ownership caveat (both stores):** the Apple team is "Shlok Yadav";
the Play account will be Sumukh's. Neither store identity belongs to the
company. Not urgent; must not be forgotten. (Play package name
`com.careerrai.app` is permanently bound to whichever account uploads first.)

**Review credentials:** `appreview@careerrai.in` — the password is **never in
this repo** (public!). It lives in App Store Connect / Play Console / chat.
Rotation SQL: `DEMO_ACCESS.md`. The account is `is_demo + is_test_account` and
premium-on so reviewers see the paid surface without touching payments.

---

## 7. Operations

- **Deploys:** push to `main` → Vercel builds → live in minutes. No staging.
  Mitigation: `npm run verify` (typecheck + lint + 226 tests) is the gate —
  run it before every push, no exceptions (`ENGINEERING_PLAYBOOK.md`).
- **Crons (32):** the product's autonomic nervous system — reminders, decision
  engine, buddy briefs, Expedify flush, community recycle, integrity checks,
  metric snapshots (all in `vercel.json`). **Pattern to preserve:** anything
  user-visible that a cron produces must ALSO lazily self-heal on the request
  path (Daily Pick recycle + promote both do this) — a silently dead cron must
  never leave a student staring at an empty screen.
- **Env/secrets:** all in Vercel. Notables: Supabase keys, `EXPEDIFY_WEBHOOK_URL`
  + `EXPEDIFY_API_KEY` + `EXPEDIFY_INBOUND_SECRET`, Razorpay, VAPID pair,
  MSG91, Resend. **The repo is public — no secret is ever committed**, and
  `.gitignore` blocks keystores and signed bundles.
- **Migrations:** applied to prod via Supabase MCP/dashboard AND committed to
  `supabase/migrations/` so the repo stays the source of truth.
- **Admin:** `/admin` (role-gated) — 30+ surfaces; the daily drivers are
  `/admin/leads`, `/admin/sales-queue`, `/admin/launch-metrics`,
  `/admin/notification-health`, `/admin/daily-pick-stats`.
- **Incidents:** severity ladder + rollback in `ENGINEERING_PLAYBOOK.md`;
  every incident gets an ENGINEERING-MEMORY entry with prevention-in-code.

---

## 8. The failure patterns this codebase has already paid for

These are the recurring *classes* behind the logged incidents — the things a new
engineer will otherwise re-discover expensively. Full entries:
`docs/ENGINEERING-MEMORY.md`.

1. **Two implementations of one concept WILL diverge.** Store-source lists,
   outcome options, tip length limits, metric definitions, call-feedback
   shapes — every one drifted and every fix was "one exported constant/helper,
   all consumers import it." Before adding logic, search for where it already
   exists.
2. **A field serving two meanings eventually renders a lie.** `display_name`
   as "anonymised student" AND "author" produced fabricated bylines
   (Incident #11 — the `curated` flag is the fix). If a row can be ours *or* a
   student's, the row must say which.
3. **Untestable query expressions are not allowed on critical paths.** Nested
   PostgREST `or(and(...))` filters cannot be exercised in CI; the codebase
   convention is plain `.in()` reads + JS predicates wherever the answer
   gates money, messages, or student-visible surfaces.
4. **Client sanitisation must match server acceptance.** The digit-stripping
   login input silently locked out every email user — including Apple's
   reviewer (Incident #10, the rejection).
5. **Fixing one gate exposes the next.** Making login work made the UGC chat
   reviewer-reachable — which made the missing report/block (Guideline 1.2) a
   live rejection risk. After any fix that widens access, re-audit what is now
   reachable.
6. **Compliance is a property of what's true, not what's claimed.** The
   2.3.10 rejection was a real WhatsApp screenshot in the repo; the fix was
   deleting it and encoding "quote the student, never photograph their
   messaging app" as a rule.
7. **Intercepting the platform's own machinery (service worker answering
   navigations, wrappers gating loads on reachability checks) converts
   transient failures into permanent ones.** Let the platform fail; it does it
   better.
8. **A read that "worked" can still be a sample.** PostgREST caps every
   response at 1,000 rows and returns the first thousand of an unbounded
   select with no error and no warning; `.limit(20000)` does not lift it.
   The student tile sat at 1000 for three days while 1,036 students existed,
   and the events, notifications and coverage tables had been reporting a
   thousand-row sample for weeks (Incident #65). A population is read only
   through `fetchAll` / `readAllRows`; `population-cap.guard.test.ts` refuses
   a new unbounded read.

---

## 9. Current risks, honestly ranked

1. **Zero paying students** (✅ verified). Everything else is secondary. The
   conversion machine (186-lead queue, Expedify calls, buddy showcase, mentor
   doors) is built but the loop is unproven end-to-end.
2. **Expedify return webhook not configured on their side** (✅ `expedify_events`
   = 0 rows after 173 dispatched calls). Calls are spending money and
   producing no data in our CRM. One config task on the vendor's side.
3. **Store-account ownership** — both store listings on personal third-party
   accounts (§6). Cheap to fix now, expensive later.
4. **Play Billing / Apple 3.1.1 posture** — "real-world service" exemption is
   a reviewer judgement call. The likeliest source of store friction; the
   mitigation (browser escape + no in-app card sheet in wrappers) is live.
5. **Single-founder ops.** 32 crons, 146 routes, one person approving
   everything. The self-healing patterns (§7) and this document are the
   current mitigations; a second operator is the real one.
6. **`docs/PROFILES-SPLIT-PLAN.md`** — `profiles` is a god-table (auth, role,
   onboarding, premium, CRM, Expedify state, call feedback…). Split planned,
   not executed. Migrations touching it deserve extra review.

---

## 10. If a new CTO started tomorrow — first five priorities

1. **Close the revenue loop, not the feature loop.** Pick the 20 hottest leads
   (the queue is already ranked), get the Expedify→webhook return pipe live,
   drive 5 paid conversions by hand, and write down what actually converted.
2. **Ship both store approvals** (iOS is one click away; Play is one upload
   away) — then move install traffic to the stores (`§Part 9` of the Play
   guide: `prefer_related_applications`).
3. **Regularise ownership:** store accounts, keystore custody (backed up
   29 Jul — verify), domain/Vercel/Supabase billing under the company.
4. **Protect the check-in loop above all.** It is the product. Any change
   touching `check-in.ts`, `plan-freshness.ts`, `/api/routine/today`,
   `streak-utils.ts` gets tests + the full verify gate. (Already the norm —
   keep it the norm.)
5. **Execute the profiles split** before the next ten features land on the
   god-table, and add a staging environment before headcount does.

---

## 11. Map of the deeper documents

| Question | Open |
|---|---|
| How do we build/ship/test anything? | `ENGINEERING_PLAYBOOK.md` |
| What went wrong before and what prevents it? | `docs/ENGINEERING-MEMORY.md` |
| Why is the architecture like this? | `docs/ARCHITECTURE-DUE-DILIGENCE-2026-07.md`, `docs/CTO-DUE-DILIGENCE-MEMO-2026-07.md` |
| What are the binding product rules? | `docs/OS/*.md`, `docs/NOTIFICATION-OS.md` |
| What decisions were made and why? | `docs/DECISIONS.md` |
| How do I resubmit to the App Store? | `docs/APP-STORE-SUBMISSION.md` + `docs/XCODE-RESUBMIT-GUIDE.md` |
| How do I ship to Google Play? | `docs/PLAY-STORE-UPLOAD-GUIDE.md` (founder) + `docs/ANDROID-BUILD-HANDOVER.md` (developer) |
| How does review access work, safely? | `DEMO_ACCESS.md` |
| How does the plan engine compute? | `docs/plan-engine-formulas.md`, `docs/OS/LEARNING-INTELLIGENCE-SYSTEM.md` |
| What's the business capability inventory? | `docs/BUSINESS-CAPABILITIES.md` |
| What's the long-term product thesis? | `docs/product-vision-notes.md`, `CAREERRAI_PRODUCT_DOCUMENT.md` |

**Maintenance rule:** when a fact in §2 or §6 changes (a paying student, a
store approval, a new channel), update it *in this file* the same day, stamped.
A knowledge document that is three weeks stale is a liability wearing the
costume of an asset.
