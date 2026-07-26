# CareerRai — Engineering Due Diligence Memo

**Prepared for:** investment / technical-direction decision
**Date:** 26 July 2026
**Question posed:** *would you approve ₹50 crore into this engineering team?*
**Method:** whole-system model built before any file was judged. 571 source files,
66 database tables, 89 migrations, 36 scheduled jobs, live schema and query
statistics, 547 commits of history. Every claim below carries evidence, impact,
effort and a confidence level.

---

# PART A — UNDERSTANDING THE SYSTEM

*Written before any judgement. If this section is wrong, everything after it is wrong.*

## A1. What the product actually is

CareerRai is a **longitudinal accountability system** for Indian CAT aspirants,
with a paid human-mentorship layer attached. That framing matters more than the
tech stack, because it dictates the shape of the whole codebase:

- The core asset is **an accurate record over time** — a streak, a coverage
  status, a percentile journey, evidence of practice. Not content. Not matching.
- The product is therefore **write-heavy on small records, read-heavy on
  derived state**, and its correctness is *temporal* (what was true on which
  study-day) rather than transactional.
- The monetisation (₹2,999 mentor subscription) is a **thin commerce layer** on
  top of that record, not the centre of the system.

Almost every architectural strength and every architectural sin below follows
from that one fact.

## A2. Runtime architecture — the actual flow

```
 Android TWA shell ─┐
 PWA / browser ─────┼──▶  src/proxy.ts  (Next middleware, 147 LOC)
                    │      · canonical-domain 308
                    │      · magic-link param interception
                    │      · Supabase session refresh so RSC can read auth
                    │      · role-cookie routing to /student|/buddy|/admin|/sales
                    │      · static assets skip the auth round-trip
                    ▼
        ┌───────────────────────────────┐
        │  Next.js App Router           │
        │  81 pages · 280 components    │
        │  113 server / 167 client      │
        └───────────────┬───────────────┘
             │                       │
   Server Components          Client Components
   read DB directly           117 raw fetch('/api/…')
             │                across 79 files
             ▼                       ▼
        ┌──────────────────────────────────────┐
        │  140 route handlers                  │
        │  auth (4 idioms) → client (3 wrappers│
        │  + 26 hand-rolled) → query → compute │
        └───────────────┬──────────────────────┘
                        │
              ┌─────────┴──────────┐
              ▼                    ▼
     src/lib (136 flat)      Supabase Postgres
     domain + engines        66 tables · RLS on,
     + vendor SDKs           32 with zero policies
              ▲
              │
     36 Vercel cron jobs ──── the batch tier
     (notifications, digests, recycling,
      reconciliation, DNA computation)
```

**The non-obvious structural fact:** the batch tier is not a sidecar. Thirty-six
scheduled jobs generate the product's daily behaviour — the plan, the nudges, the
digests, the peer-content shelf, the payment reconciliation. **The crons are the
product's spine**, and they are implemented as ordinary serverless HTTP handlers
with no queue, no retry semantics, and no resumption checkpoint.

## A3. Auth flow

Phone-OTP primary (MSG91), password fallback, email OTP on a second surface.
`proxy.ts` refreshes the session; `getAuthUser()` reads it inside handlers;
role comes from a `profiles.role` string column and a mirrored `user_role`
cookie used only for routing (the DB is authoritative). Brute-force throttling is
per-credential (5) and per-IP (30) with attempts recorded *before* authentication
— race-free, and better than most production systems I have reviewed.

## A4. State flow

Four state locations, only one of them deliberate:
1. **Server state in Postgres** — canonical.
2. **React Query** — 7 files.
3. **`useState` + `fetch` in components** — 79 files, the de facto standard.
4. **Cookies** — `user_role` for routing.

## A5. Data flow — and the centre of gravity

Everything routes through **one table**. See B1. This is the single most
important structural fact in the repository, and it is invisible from any
individual file.

---

# PART B — ARCHITECTURE FIRST

## B1. What architecture is this?

**Verdict: an accidental Layered Monolith with a God Entity at its centre.**
It is not Feature-Based, not Clean, not DDD, not a Modular Monolith.

**Evidence it is layered, not feature-based:**
`src/components/` (70 flat files), `src/lib/` (136 flat files), `src/hooks/`
(2 files), `src/types/` (1 file). Files are grouped by *what kind of thing they
are*, never by *what part of the business they serve*.

**Evidence of the God Entity:**

| Measure | Value |
|---|---|
| Columns on `public.profiles` | **112** |
| Total columns in the `public` schema | 645 |
| Share of the entire schema in one table | **17%** |
| Next largest table | `daily_reports`, 25 columns |
| Distinct subsystems issuing `profiles.update` | **18** |
| Source files querying `profiles` | 115 |

`profiles` simultaneously holds: identity (`phone`, `email`, `password_set`),
student prep state (`baseline_varc`, `starting_percentile`, `syllabus_target_date`),
mentor credentials (`cat_percentile`, `iim_converted`, `how_i_work`,
`agreed_monthly_payout`), CRM/sales state (`expedify_status`, `call_feedback`,
`lead` fields), notification config (`notif_prefs`, `push_subscription`,
`push_died_at`, `push_verified_at`), commerce (`subscription_status`,
`subscription_plan`, `is_premium`, `premium_extension_days`), growth attribution
(`signup_device`, `signup_browser`, `install_source`, `app_installed_at`),
gamification (`current_streak`, `best_streak`, `section_elo`), and per-section
feature flags (`qa_model_enabled`, `dilr_include_bonus`, …).

**Is the architecture intentional or accidental?**

**Accidental — but the accident is well-understood, which is unusual.** The
evidence for accident is that the boundaries were never drawn: no feature
directories, no bounded contexts, no ownership. The evidence that it is not
*careless* is that `src/lib` contains genuinely extracted domain modules
(`evidence.ts`, `buddy-match.ts`, `prep-model.ts`, `pricing.ts`) that routes
*call* rather than duplicate, plus five written "OS constitutions" in `docs/OS/`
that describe exactly the domain boundaries the code does not have.

That is the defining tension of this repository: **the domain model exists on
paper and in the author's head; it does not exist in the file system or the
schema.**

## B2. The architecture the docs describe vs the one that shipped

`docs/OS/` defines five bounded contexts — Notifications, Growth, Learning,
Trust, Analytics — each with a binding constitution. Not one of them corresponds
to a directory, a module, a schema boundary, or a set of tables. The
Notification OS constitution governs behaviour spread across `lib/push.ts`,
`lib/notifications.ts`, `lib/notification-os.ts`, `lib/mission-queue.ts`, 9 cron
routes, 6 components, and 6 columns on `profiles`.

**This is Architecture Drift in its purest form:** a documented intent that
reality has quietly diverged from, where the document is still treated as true.

---

# PART C — BUSINESS DOMAIN AUDIT

Eleven domains are identifiable. Isolation is assessed by whether the domain
owns its data, its code location, and its vocabulary.

| # | Domain | Owns a directory? | Owns its tables? | Isolation |
|---|---|---|---|---|
| 1 | Identity & Auth | partial (`api/auth/*`) | ❌ shares `profiles` | **Leaky** |
| 2 | Learning / Study Plan | ❌ scattered in `lib/` | ✅ mostly | **Leaky** |
| 3 | Evidence & Readiness | ❌ | ✅ `topic_coverage`, `topic_evidence` | **Good** |
| 4 | Mentorship | ❌ | ✅ mostly | **Leaky** |
| 5 | Payments & Subscriptions | partial (`api/payments/*`) | ❌ state on `profiles` | **Leaky** |
| 6 | Notifications | ❌ spread across 20+ files | ❌ 6 columns on `profiles` | **Severely leaky** |
| 7 | Growth & Onboarding | ❌ | ❌ 8 columns on `profiles` | **Leaky** |
| 8 | Analytics & Telemetry | ❌ | ✅ | **Good** |
| 9 | Sales / CRM | `app/sales/*` ✅ | ❌ `expedify_status` on `profiles` | **Leaky** |
| 10 | Peer Learning | ✅ cohesive | ✅ | **Good — the best in the repo** |
| 11 | AI | ❌ two vendors | n/a | **Leaky** |

### The three leakages that matter

**L1 — Sales/CRM state lives on the student identity record.**
`expedify_status`, `expedify_synced_at`, `call_feedback` are columns on
`profiles`, written by `api/expedify/outcome` (an inbound webhook from a
third-party calling service).
*Why dangerous:* an external vendor's webhook writes to the same row that
authenticates a student. A bug or a bad payload in a CRM integration can corrupt
identity data. There is no schema-level separation preventing it.
*Should evolve to:* a `student_crm` table keyed by student, owned by the sales
domain, joined when needed.

**L2 — Notification delivery state lives on the identity record.**
`push_subscription`, `push_died_at`, `push_resubscribed_at`, `push_verified_at`,
`push_context`, `notif_prefs` — six columns, written by push routes, healers,
and crons.
*Why dangerous:* the notification subsystem is already this product's most
incident-prone area (per `docs/ENGINEERING-MEMORY.md`). Every push write
contends on the same row as every profile read. At scale this is also a
**write-amplification** problem: updating a push subscription rewrites a 112-column
row.
*Should evolve to:* `push_subscriptions` as its own table (it is naturally
one-to-many anyway — a student has multiple devices, which the current schema
cannot even represent).

**L3 — The exam is not modelled; it is hardcoded.** See E2. This is the
leakage with the largest strategic cost.

---

# PART D — ARCHITECTURAL SMELL DETECTION

Each smell reported separately, with the specific evidence that establishes it.

### D1. God Module / God Entity — **CONFIRMED, severe**
`profiles`: 112 columns, 17% of the schema, written by 18 subsystems, read by
115 files. Every domain's state is a column on the identity table.
**Confidence: 99%.**

### D2. Shared Database Syndrome — **CONFIRMED**
No domain owns its tables. 32 tables have RLS enabled with zero policies,
meaning the database expresses no opinion about who may touch what; 207 files
hold a service-role client that bypasses RLS entirely. The database is a shared
mutable global.
**Confidence: 95%.**

### D3. Architecture Drift — **CONFIRMED**
Three abstractions were introduced and never finished:
- `@tanstack/react-query` — a production dependency, used in **7 of 79** fetching files.
- `src/lib/api-error.ts` — exists, imported by **11 of 140** routes.
- `requireAdmin` — exists, used by 9 files, while 13 others inline the same check
  and others use two further helpers.

A half-adopted abstraction is worse than none: a new engineer cannot tell which
pattern is correct, so they copy whichever file they opened first — which is how
drift compounds.
**Confidence: 95%.**

### D4. Leaky Abstraction — **CONFIRMED**
`src/lib` mixes three incompatible kinds of module with no marking: pure domain
logic (`evidence.ts`, `buddy-match.ts`), stateful engines with DB side-effects
(`mastery-state.ts`, `routine-engine.ts`), and vendor SDK wrappers
(`razorpay.ts`, `whatsapp.ts`, `expedify.ts`). An engineer importing from `lib`
cannot know from the import whether they just took a dependency on a pure
function or on Razorpay.
**Confidence: 90%.**

### D5. Feature Entanglement — **PARTIAL, better than expected**
At the *route* level, entanglement is **zero**: no imports between
`app/student`, `app/buddy`, `app/admin`, `app/sales`. At the *component* and
*data* level it is total: all four personas share `src/components/` and all four
write `profiles`.
**Confidence: 95%.**

### D6. Hidden Dependencies — **CONFIRMED**
Behaviour is coupled through the database rather than through imports. Example:
setting `first_attempt_percentile` on a mentor silently changes ranking, because
`buddy-match.ts:54` infers "is a repeater" from that column being non-null. No
import expresses that. I found this by changing data, not by reading code.
Similar implicit coupling exists between `profiles.notif_prefs` and 9 cron jobs.
**Confidence: 85%.**

### D7. Cyclic Feature Dependencies — **ABSENT**
0 circular dependencies across 572 modules (madge). 1 direction violation total
(`src/lib/chat.ts:2` importing a component type). This is genuinely rare and is
the most valuable structural asset in the repository.
**Confidence: 99%.**

### D8. Big Ball of Mud — **NOT PRESENT**
Rejected on evidence: acyclic graph, extracted domain layer, no cross-persona
imports, no naming debris (zero `*V2`/`*-copy`/`*-final` in 571 files).
This is a *tidy* monolith with missing boundaries — a materially different and
much cheaper problem.
**Confidence: 90%.**

### D9. Premature Abstraction / Over-Generalisation — **NOT PRESENT**
Notably absent. Dormant subsystems (`mentor-doors`, the section mastery engines)
are gated behind explicit flags and documented as dormant rather than
speculatively generalised.
**Confidence: 85%.**

### D10. Accidental Complexity — **PRESENT, moderate**
Two LLM vendors for one product (`@anthropic-ai/sdk` in 1 file, Gemini
elsewhere). Three Supabase client wrappers plus 26 routes hand-rolling a fourth.
Two cron authorization schemes because two jobs live under `/api/admin/` instead
of `/api/cron/`.
**Confidence: 90%.**

### D11. Distributed Monolith — **NOT APPLICABLE**
Single deployable. No premature service extraction. Correct choice for the stage.

---

# PART E — THE FUTURE FEATURE TEST

*The most decision-relevant section. Each answer is a structural claim with evidence.*

| Feature | Verdict | Why |
|---|---|---|
| **Paid subscriptions / new tiers** | ✅ **Natural** | `src/lib/plans.ts` is a clean const map; `pricing.ts` has pure discount functions. Adding a tier is one object entry. |
| **Referral system** | ✅ **Natural** | New table, new routes, touches nothing existing. |
| **Multiple mentor types** | ✅ **Mostly natural** | `role` is a string column and mentor attributes already live on `profiles`. Cost is that mentor attributes are 20 more columns on an already-112-column table. **Do the profiles split first or this makes it worse.** |
| **Teams & Institutions** | ⚠️ **Moderate rewrite** | Requires an org entity above the user. Every one of 140 routes currently scopes by `user.id` with no tenant concept. Retrofitting multi-tenancy without RLS means auditing 140 handlers by hand. |
| **Enterprise dashboard** | ⚠️ **Moderate** | Blocked behind Teams. Also blocked by aggregation: `admin/launch-metrics` already issues 9 unbounded full-table reads. |
| **AI voice coaching** | ⚠️ **Moderate** | Voice capture exists (`voice-note-recorder.tsx`, 501 LOC). But there is no AI service boundary — two vendors, no abstraction, no token/cost accounting, no eval harness. |
| **Offline mode** | ⚠️ **Moderate–hard** | `public/sw.js` exists for push, not for data. All state is server-authoritative with **117 direct fetch calls** and no client cache layer. Offline requires a sync/conflict model *and* funnelling all 117 call sites through it first. |
| **International students** | ❌ **Major** | `normalizeIndianPhone()` enforces `^[6-9]\d{9}$` and is the identity primitive across auth, allowlist, CRM and OTP. Phone *is* identity here. Plus INR-only pricing and IST-hardcoded study-day logic. |
| **Regional languages** | ❌ **Major** | **Zero i18n infrastructure** — no `next-intl`, no `react-intl`, no translation layer of any kind. Every user-facing string is an English literal inside JSX across 280 component files. |
| **Multiple exams besides CAT** | ❌ **Rewrite of the core** | See below. |

### E2. Multi-exam is not a feature — it is a rewrite. This is the finding.

**Evidence:**
- **45 source files** contain the hardcoded literal `'VARC'`. The three CAT
  sections are a union type (`type Section = 'VARC' | 'DILR' | 'QA'` in
  `prep-model.ts:28`) redeclared in at least 8 places.
- **19 columns on `profiles` are CAT-specific by name**: `baseline_varc`,
  `baseline_dilr`, `baseline_qa`, `varc_model_enabled`, `dilr_include_bonus`,
  `qa_model_enabled`, `cat_percentile`, `cat_year`, `first_attempt_percentile`,
  `target_percentile`, `starting_percentile`, `last_year_percentile`,
  `baseline_mocks_taken`, `syllabus_target_date`, `coaching_enrolled`, …
- Whole modules are exam-shaped: `cat-percentile-data.ts`, `qa-topic-graph.ts`,
  `varc-topic-graph.ts`, `qa-mastery-engine.ts`, `varc-mastery-engine.ts`,
  `topics-constants.ts`.
- An `exam_target` column exists on `profiles` — the *intent* to support more
  than one exam was there — but nothing downstream reads it as a discriminator.

**Business impact:** if the company's next growth move is XAT/SNAP/GMAT/CUET or
any adjacent exam — the obvious move for a CAT-prep company with seasonal
demand — the current design charges a **rewrite of the learning core** for it. I
would estimate 8–12 engineer-weeks *before* any new exam content exists, and it
touches the modules with zero test coverage.

**Recommended direction:** introduce an `Exam` aggregate — `exams`,
`exam_sections`, `exam_topics` tables; replace the `Section` union with a
runtime-resolved section id; move the 19 CAT columns off `profiles` into
`student_exam_profile` keyed by (student, exam). **Do this before the second exam
is sold, not after.**

**Effort:** 8–12 engineer-weeks. **Confidence: 90%** that multi-exam is a
core-rewrite as designed; **60% on the week estimate — needs further
investigation** against a concrete target exam.

---

# PART F — SCALABILITY THOUGHT EXPERIMENT

*50 engineers · 250 PRs/week · 2 deploys/day · 500k DAU. Software architecture only.*

## F1. Where engineering velocity collapses — first, second, third

**First: the merge surface.** With no feature directories, 50 engineers land in
the same four folders. Git history shows `src/app/student/tracker/page.tsx`
modified **21 times in the last 200 commits** — 10% of all commits touch one
496-line file. `src/lib/routine-engine.ts` and `src/components/unlock-buddy-sheet.tsx`
are similar. At 250 PRs/week those become permanently-conflicted files.

*Honest caveat:* all 547 commits have a single author, so there is **no
observed** conflict history. This is a structural projection, not a measurement.
**Confidence: 80% on direction, 50% on magnitude — needs further investigation.**

**Second: the `profiles` table becomes the organisational bottleneck.** Eighteen
subsystems write it. At 50 engineers that means every team's migrations queue
behind one table. Adding a column becomes a cross-team negotiation; a lock on
`profiles` during a migration stalls every feature simultaneously. This is where
technical debt compounds *exponentially* rather than linearly, because each new
domain adds columns, and each added column raises the cost of ever splitting it.

**Third: review quality collapses before code quality does.** With 3 tests, every
PR must be verified by reading. A reviewer cannot ask "do the tests pass?" — they
must ask "is this logic right?", for streak maths, IST boundaries and coverage
derivation. At 250 PRs/week that is not a staffing problem, it is an impossibility.
**This is the single highest-leverage constraint in the entire report:** without
an executable specification, engineering throughput is capped by the review
bandwidth of whoever understands the domain.

## F2. Where technical debt compounds exponentially

1. **Every new column on `profiles`** raises the cost of the eventual split.
2. **Every new `fetch` call** (currently 117) raises the cost of introducing
   caching, retries, tracing or offline.
3. **Every new route with a hand-rolled auth check** raises the cost of adding a
   role or an audit trail.
4. **Every new cron doing per-row writes** raises the cost of moving to a queue.

All four are *linear to add and superlinear to undo.* That is the definition of
compounding architectural debt, and all four are still actively growing.

## F3. What does NOT break

Worth stating, because it is the reason this is fixable: the acyclic dependency
graph and the extracted domain layer mean **the refactor is mechanical, not
conceptual**. Index hygiene is currently sound — the hot tables show
`idx_scan` overwhelmingly dominating `seq_scan` (`notifications` 56,883 vs 890;
`student_events` 46,431 vs 17). *I have not run `EXPLAIN` on the specific
dashboard aggregations — **needs further investigation** before any 500k claim
about query performance.*

---

# PART G — DEVELOPER EXPERIENCE

*As a senior engineer joining on Monday.*

**Weeks until productive: 3–4 for a feature; 8–10 to be trusted near the core.**
Faster than average for a 65k-LOC codebase, entirely because of the comments and
`docs/DECISIONS.md`. Slower than it should be, because nothing is executable.

**What would confuse me in week one:**
- Which Supabase client to use — there are four ways in, and 207 files use the
  one that bypasses all security.
- Whether to use React Query or `fetch` — the codebase votes 7 to 79 for `fetch`,
  but the dependency says otherwise.
- Where a feature lives. "Where is the mentor code?" has no answer.
- Which of 33 root markdown files is true. `README.md` still calls Admin
  *"(Phase 2)"*; Admin has 27 routes and 28 pages.

**Where I would accidentally create bugs:**
- `profiles` — 112 columns, no ownership, and implicit behavioural coupling
  (setting `first_attempt_percentile` silently changes mentor ranking).
- Anything time-related. The study-day boundary is 3am IST, not midnight, not
  UTC. `src/lib/study-day.ts` is correct and canonical — but `mission-queue`
  still uses a UTC key, so both conventions exist.
- The notification budget/cap logic, where the documented cap is only partially
  enforced (6 of 16 send paths stamp `pushed_at`).

**Dangerous to modify:** `streak-utils.ts`, `mastery-state.ts`,
`routine-engine.ts`, `evidence.ts` — high blast radius, zero tests.

**Features lacking ownership:** notifications (spread across 20+ files and 6
`profiles` columns), growth/onboarding, and AI. Peer-learning is the one
subsystem a new engineer could own on day one, because it is the only one whose
files, tables and vocabulary line up.

**Would code review be difficult?** Yes — reviewers must simulate the domain
mentally. That is the tax that tests remove.

---

# PART H — THE TEN DECISIONS THAT MATTER

*Ranked by leverage, not severity. Everything cosmetic is deliberately omitted.*

| # | Decision | Impact | Effort | Confidence |
|---|---|---|---|---|
| **1** | **Make the domain executable — test the 6 core invariant modules and gate CI on them** | Removes the cap on review throughput; makes every later item safe | 1 week | 95% |
| **2** | **Split `profiles` (112 cols) into identity + per-domain tables** | Unblocks domain ownership, multi-tenancy, multi-exam, write contention | 3–4 weeks | 90% |
| **3** | **Model the exam instead of hardcoding it** (45 files, 19 columns) | Decides whether exam #2 is a quarter or a year | 8–12 weeks | 90% / 60% on estimate |
| **4** | **One authorization module + RLS on the top 20 tables** | Removes "one forgotten filter = data leak"; prerequisite for Teams | 2–3 weeks | 95% |
| **5** | **Feature-first directories with lint-enforced boundaries** | Creates the unit of ownership; mechanical because the graph is acyclic | 2 weeks | 90% |
| **6** | **Finish or delete the three half-adopted abstractions** (react-query, api-error, requireAdmin) | Stops drift compounding; unambiguous answer for new engineers | 1–2 weeks | 95% |
| **7** | **Move the 36 crons to a queue with retries and checkpoints** | The batch tier is the product's spine and currently fails partially and silently | 3 weeks | 85% |
| **8** | **One API client for the 117 fetch sites** | Prerequisite for offline, tracing, retries | 1–2 weeks | 90% |
| **9** | **Structured logging with request + user correlation** (212 `console.*`) | Diagnosis becomes possible above ~10k users | 1 week | 90% |
| **10** | **Extract notifications into a service with a delivery ledger** | Most incident-prone subsystem, currently has no owner and no boundary | 3 weeks | 80% |

**Sequencing is not negotiable: #1 before everything.** Moving 571 files or
splitting a 112-column table without an executable specification is how a
refactor becomes an outage.

---

# PART I — CTO VERDICT

## Would I approve ₹50 crore into this engineering team?

# YES — WITH CONDITIONS

I want to be exact about what I am approving and what I am not.

**I am not approving the codebase as a scalable foundation.** It is not one yet.
Three of the ten decisions above are prerequisites, not improvements.

**I am approving the team's demonstrated engineering judgement**, because the
evidence for it is unusually strong and it is the thing that cannot be bought
later.

### The five reasons I would fund this

1. **The dependency graph is acyclic and correctly directed.** Zero cycles across
   572 modules; one direction violation total; zero cross-persona imports. This is
   the expensive property, it is already correct, and it converts every structural
   fix below from a redesign into a file-move. Most codebases at this stage fail
   here and never recover.

2. **The domain layer genuinely exists.** `evidence.ts`, `buddy-match.ts`,
   `prep-model.ts`, `pricing.ts`, `community-pipeline.ts` are real modules that
   routes call rather than logic pasted into handlers. The hard intellectual work
   — modelling the domain — is done. What is missing is where to put it.

3. **Safety invariants are encoded, not assumed.** `mergeStatus` is forward-only
   so derived state can never mass-demote students. `prep-model.ts` carries a
   `MAX_MODEL_DRIFT` guard that *blocks* engines when models disagree rather than
   silently picking one. A database trigger rejects `exam_ready` with no evidence.
   Someone reasoned about failure modes before they occurred.

4. **Mistakes are written down rather than quietly fixed.** `docs/DECISIONS.md`
   (8 ADRs), `docs/ENGINEERING-MEMORY.md`, `ENGINEERING_PLAYBOOK.md`, five OS
   constitutions. This is the artefact most Series-A companies cannot produce, and
   it is the highest-signal predictor of whether a team compounds or thrashes.

5. **Restraint is visible.** No premature microservices. No speculative
   generalisation. No `*V2`/`*-copy`/`*-final` files in 571. Dormant features are
   gated and documented rather than half-shipped. The team ships and then stops.

### The five conditions I would attach to the money

1. **CI gate with tests on the six invariant modules within 30 days.** No new
   feature merges until it exists. This is not a code-quality condition; it is the
   condition that makes hiring possible.
2. **A decision on multi-exam before the Series A narrative is written.** If the
   pitch says "expand beyond CAT", the `Exam` aggregate must be funded in the same
   breath — 45 files and 19 columns say otherwise today.
3. **`profiles` split scheduled before the first 10 hires**, because every new
   engineer adds columns and raises the cost of ever doing it.
4. **One authorization module plus RLS on the top 20 tables before any
   B2B/Teams contract is signed.** Multi-tenancy on top of 140 hand-written
   `user.id` filters is a breach waiting for a customer.
5. **A second engineer with commit rights within 60 days.** 547 of 547 commits
   have a single author. That is the largest single-point-of-failure in this
   diligence, and it is an organisational risk, not a technical one.

### The honest summary for the investment committee

> *This is a well-reasoned system with undrawn boundaries. The team has done the
> expensive intellectual work — modelling a genuinely hard longitudinal domain,
> encoding safety invariants, recording decisions — and skipped the cheap
> structural work of putting it in the right places. That is the correct order to
> get things wrong in, and it is recoverable in roughly one quarter of focused
> effort. The risk is not that this codebase collapses. It is that it silently
> hardens: every month, more columns on `profiles`, more hardcoded `'VARC'`, more
> hand-rolled auth — each cheap to add and superlinear to undo. Fund it, and spend
> the first quarter drawing the boundaries the documentation already describes.*

---

## Confidence register

| Claim | Confidence | Basis |
|---|---|---|
| `profiles` God Table, 18 writers | 99% | Live schema + code census |
| 0 circular dependencies | 99% | madge, full scan |
| Multi-exam requires core rewrite | 90% | 45 files, 19 columns, 6 exam-shaped modules |
| Multi-exam effort = 8–12 weeks | **60% — needs further investigation** | No concrete target exam scoped |
| Velocity collapse at 50 engineers | 80% direction / **50% magnitude — needs further investigation** | Single-author history; structural projection only |
| Query performance at 500k DAU | **Needs further investigation** | No `EXPLAIN` run on dashboard aggregations |
| Bundle size / client performance | **Not measured — no claim made** | Out of scope this pass |
| No unauthenticated data-exposure hole | 90% | All 140 routes opened individually |
