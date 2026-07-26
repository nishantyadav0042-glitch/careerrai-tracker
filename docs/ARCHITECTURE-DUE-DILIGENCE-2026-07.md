# CareerRai — Engineering Due Diligence

**Date:** 26 July 2026
**Scope:** Full repository (`src/`, `supabase/`, `android/`, root), plus live database posture
**Standard applied:** pre-Series A technical diligence — "would a CTO trust this foundation?"
**Method:** static census of all 571 source files, dependency-graph scan (madge), live
Supabase security advisors, and manual inspection of every file named as evidence below.

---

## 0. What was measured

| Metric | Value |
|---|---|
| Source files (`.ts` + `.tsx`) | 571 |
| Lines of source | 65,858 |
| API route handlers | 140 |
| Page routes | 81 |
| Database migrations | 89 |
| Scheduled cron jobs (`vercel.json`) | 36 |
| React components | 97 files |
| `src/lib` modules | 136 files (flat) |
| Custom hooks | **2** |
| Automated tests | **3** (2 Playwright specs, 1 unit) |
| Circular dependencies | **0** |
| Cross-feature page imports | **0** |
| Files importing the service-role DB client | **207** |
| Files importing the RLS-respecting client | 59 |
| Tables with RLS on and zero policies | **32** |

---

## 1. Executive Summary

### Overall repository quality

This is a **coherent, deliberately-built product codebase carrying real
structural debt** — not a prototype, and not a mature engineering organisation's
repository either. It sits in an unusual place: the *reasoning* quality is high
(architecture decision records, an incident memory file, comments that explain
why a line exists and what broke to cause it) while the *structural* quality is
that of a codebase written by one entity moving fast with no second engineer to
disagree with.

The distinguishing feature — and this is genuinely uncommon — is that the code
explains itself. `src/lib/plans.ts` records why "Till CAT" is the hero plan and
who decided it. `src/proxy.ts` documents the loop-safety precondition for the
domain cutover. `src/app/api/admin/kohli-push/route.ts` documents the exact
auth vulnerability that was removed and when. A new engineer reading this
codebase would understand the product faster than in most funded startups.

That strength does not offset the three structural facts below.

### Scores

| Dimension | Score | One-line justification |
|---|---|---|
| **Maintainability** | **5 / 10** | Clean dependency direction and zero cycles, undermined by flat 136-file `lib/` and 70-file `components/` with no feature boundaries |
| **Scalability** | **4 / 10** | Infrastructure scales; the *codebase* does not — 10 engineers would collide constantly, and 36 crons do per-row sequential writes |
| **Engineering discipline** | **6 / 10** | Exceptional decision records and incident memory; near-zero automated testing and no CI quality gate |
| **Technical debt** | **5 / 10** | (10 = pristine) Debt is broad and shallow, not deep — mostly consolidation work, no rewrite required |

### Would I approve this architecture as CTO?

# NO

Not at the bar this question implies — "I would hand this to ten engineers and
sleep at night."

I want to be precise about *why*, because this is a conditional no, not a
condemnation. The architecture is not wrong. The domain modelling is good. The
technology choices are correct for the stage. Three things block approval:

**1. There is effectively no automated test coverage.** Three tests for 65,858
lines, 140 API routes and 36 scheduled jobs that write to production data. Every
correctness guarantee in this system currently lives in one person's head and in
carefully written comments. That is not a criticism of the care taken — the care
is visible — it is a statement that the care is not *transferable*. The moment a
second engineer touches `src/lib/streak-utils.ts` or `src/lib/mastery-state.ts`,
the only thing standing between them and a silent production regression is code
review by the person who wrote it. That does not survive hiring.

**2. Authorization is enforced 140 times in application code and zero times in
the database.** 207 files import the service-role Supabase client, which bypasses
Row Level Security entirely. 32 tables have RLS enabled with no policies at all —
meaning the database's answer to "who may read this?" is "nobody, ask the app."
The app then answers that question in at least four different idioms (see
Critical Issue #2). I verified every route: **no unauthenticated data-exposure
hole exists today.** The risk is not a current breach, it is that the 141st route
is one forgotten line away from being one, and nothing in the system would catch it.

**3. The codebase has no feature boundaries.** `src/components/` is a flat
directory of ~70 files mixing student, mentor, admin, sales, growth and
notification concerns. `src/lib/` is a flat directory of 136 modules mixing pure
domain logic, third-party integrations, and one-off helpers. There is no unit of
ownership. You cannot assign "the mentor experience" to an engineer, because it
does not exist as a place in the repository.

**What would change my answer:** all three are fixable in roughly six focused
weeks without a rewrite, and the roadmap in §11 sequences them. The foundation is
sound enough to build on. It is not yet sound enough to *staff*.

---

## 2. Critical Issues — must fix before scaling

### C1. Test coverage is effectively zero

**Evidence:** `e2e/` contains `smoke.spec.ts` and `onboarding.spec.ts`. One unit
test exists in `src/`. That is 3 tests for 65,858 lines.

**Why this is critical, specifically here:** this product's core value is
*correctness of a longitudinal record*. A streak, a coverage status, a study-day
boundary, a percentile journey — these are not cosmetic. The repository's own
`docs/ENGINEERING-MEMORY.md` documents incidents where exactly this class of
logic broke silently: a UTC-vs-IST day boundary that made an acknowledgement
target excluded rows, an `exam_ready` status that leaked past validation into 10
rows across 6 students over 8 days. **Both were caught by a human reading code,
not by a test.** The next one will not be.

The highest-value targets are pure and trivially testable — they take no database
and no network:

- `src/lib/study-day.ts` — the 3am IST rollover
- `src/lib/streak-utils.ts` (389 lines)
- `src/lib/evidence.ts` (361 lines) — particularly `mergeStatus`, which is the
  forward-only guard preventing a mass status demotion
- `src/lib/prep-model.ts` — the drift guard
- `src/lib/buddy-match.ts` — ranking and match reasons
- `src/lib/pricing.ts` — `priceWithScholarship` / `priceWithCoupon` are pure
  functions that decide what a student is charged and have **no test**

**Cost of not fixing:** every future engineer is a coin flip. Onboarding time
doubles. The first silent regression in money or streak logic costs more trust
than the tests cost to write.

### C2. Four competing admin-authorization idioms

**Evidence:** the same question — "is this caller an admin?" — is answered four
different ways:

| Idiom | Files | Example |
|---|---|---|
| `requireAdmin(...)` | 9 | various |
| `requireAdminCtx()` | recent | `src/app/api/admin/launch-metrics/route.ts` |
| `isRequestAdmin()` | several | `src/app/api/admin/dna/route.ts`, `admin/daily-status`, `admin/kohli-push` |
| Inline `getAuthUser()` + `profiles.role` lookup | **13** | `src/app/api/admin/leads-export/route.ts:14-18`, `admin/video-health/route.ts:15-19`, `admin/expedify-test/route.ts:19-22` |

The inline form appears 13 times as the byte-similar sequence
`from('profiles').select('role').eq('id', user.id).single()` followed by a
`role !== 'admin'` check.

**Why critical:** this is textbook **Shotgun Surgery**. Adding a role
(`support`, `content_reviewer`), adding audit logging to privileged reads, or
changing the admin model requires finding and editing 4 patterns across 20+
files. Miss one and you have a privilege bug in the one route nobody remembered.
`admin/leads-export` returns **every student's name, phone and email as CSV** —
that is the route you cannot afford to get wrong twice.

**Note on rigour:** a naive grep for auth helpers over-reports this problem
badly. I opened each flagged route individually. The honest finding is *idiom
sprawl*, **not** missing gates.

### C3. The database enforces nothing

**Evidence:** live Supabase security advisors report **32 tables with RLS
enabled and zero policies**, including `student_dna`, `student_events`,
`security_events`, `coupons`, `scholarships`, `mentor_grants`,
`login_attempts`, `client_errors`. 207 source files import
`@/lib/supabase/admin` (service role, bypasses RLS); only 59 import the
RLS-respecting server client.

**The nuance that matters:** this is *deny-by-default* and therefore **safe
today** — with no policies, anon and authenticated roles can read nothing. It is
not a leak. It is a *design choice with a consequence*: the database is a dumb
store and 100% of the security model is TypeScript. There is no defence in depth.
A single route that forgets to filter by `user.id` returns another student's data,
and Postgres will happily serve it.

**Also flagged live:** `pg_net` installed in the `public` schema; public buckets
`avatars` and `buddy-intros` carry broad SELECT policies allowing enumeration of
all files; leaked-password protection off (**Pro-plan only — not actionable on
the current plan**).

### C4. No structured logging or error taxonomy

**Evidence:** 212 raw `console.*` calls across `src/`. Only 55 of 140 route
handlers contain a `try`/`catch`. `src/lib/api-error.ts` exists (17 lines) and is
imported by **11 of 140 routes**.

**Why critical:** at 244 students, the founder reads Vercel logs. At 100,000, an
unstructured `console.error` is indistinguishable from noise. There is no request
ID, no user ID correlation, no severity taxonomy, no sampling. The recently-added
`client_errors` table and `/admin/launch` dashboard are a good instinct applied
to the *client* half; the server half has no equivalent.

---

## 3. High Priority Issues

### H1. No client-side data layer — 117 hand-rolled fetches

**Evidence:** 117 `fetch('/api/…')` calls across **79 component files**.
`@tanstack/react-query` is a production dependency but appears in only **7
files** (`providers.tsx`, `DailyTrackerApp.tsx`, `coach-line.tsx`,
`useLogging.ts`, and 3 pages).

Each of the other 110 call sites re-implements: loading state, error state,
success parsing, and (usually) no retry, no timeout, no cancellation. There are
**2 custom hooks in the entire repository** — meaning this logic is inlined in
JSX components rather than extracted anywhere.

This is a half-adopted abstraction, which is worse than either alternative:
engineers cannot tell which pattern is correct, so they copy whichever file they
opened first.

### H2. Flat directories with no feature ownership

`src/components/` — ~70 files at the top level spanning every persona:
`sales-deck.tsx`, `buddy-panel-tabs.tsx`, `community-vote-card.tsx`,
`push-healer.tsx`, `admin`-adjacent widgets, growth components — all siblings.

`src/lib/` — 136 flat modules mixing four different kinds of thing: pure domain
logic (`evidence.ts`, `buddy-match.ts`), stateful engines (`routine-engine.ts`,
`mastery-engine.ts`), third-party integrations (`razorpay.ts`, `whatsapp.ts`,
`gemini.ts`, `expedify.ts`, `resend`/`email.ts`), and genuine utilities
(`utils.ts`, `phone.ts`).

**Consequence at 10 engineers:** two people adding unrelated features both touch
`src/components/`, both touch `src/lib/`, and `git` cannot tell them apart. There
is no CODEOWNERS boundary that could exist, because there is no boundary.

### H3. Sequential writes inside loops in scheduled jobs

**Evidence** (awaits inside `for…of` loops):

| Route | Awaits in loop |
|---|---|
| `api/admin/bulk-import` | 10 |
| `api/admin/challenges` | 9 |
| `api/admin/streak-restore-broadcast` | 7 |
| `api/cron/check-red-flags` | 5 |
| `api/cron/buddy-brief` | 4 |
| `api/cron/reconcile-payments` | 3 |

`api/cron/buddy-evening` issues one insert plus one push plus one update **per
student**, serially. At 244 students this is fine. At 50,000 it exceeds any
serverless execution limit long before it finishes, and it will fail *partially* —
some students notified, some not, with no resumption checkpoint.

`src/lib/community-recycle.ts` has the same shape (one `UPDATE` per row) — I know,
because I wrote it. It is correct and it will not scale past a few thousand rows.

### H4. Single source of truth violated on price

**Evidence:** `src/lib/plans.ts` defines `tillcat.display = '₹2,999'` and is
correctly imported by `src/components/unlock-buddy-sheet.tsx`. That same file then
hardcodes the string `₹2,999` at lines **188, 214 and 310**.

A price change updates the SSOT and three JSX literals in the same file disagree
with it. This is the exact failure mode the repository's own
`ENGINEERING_PLAYBOOK.md` SSOT gate exists to prevent.

### H5. Committed operational junk, including a plaintext-password CSV

**Tracked in git:**

- `import-all-users.csv` — 7 rows, columns `…,username,password`, containing
  plaintext passwords (`CareerRai2026!`). The data is sample/test data, not real
  students — **but the pattern is the finding.** The day someone runs a real
  import, they will produce the real file the same way and commit it the same way.
  A correct template already exists at `scripts/data-import-template.csv`.
- `dev-server.log` (108 KB) and `dev-output.log` — scanned, **no secrets found**.
- `SUPABASE_FIX_ALL.sql` (211 lines) — an ad-hoc fix script outside the 89-file
  migration history.
- `spec_temp/` — an unzipped Microsoft Word document (`[Content_Types].xml`,
  `word/document.xml`, …) committed as loose XML.

`.gitignore` covers `node_modules`, `.next` and debug logs but not `*.log` at
root, not `*.csv`, not `test-results/`.

---

## 4. Medium Priority Issues

- **M1 — Type escape hatches:** 168 `any` occurrences across 36 files, every one
  of which carries an `eslint-disable no-explicit-any`. The disables are
  deliberate rather than accidental (Supabase client typing is the usual cause),
  but 36 files is a large surface with no compile-time guarantee.
- **M2 — Types are scattered, `src/types/` is vestigial:** 150 interface
  declarations in `.tsx` files and 217 in `src/lib`, against a `src/types/`
  directory containing exactly one file. Co-location is a defensible choice; a
  near-empty `types/` directory alongside it is not a choice, it is a leftover.
- **M3 — Documentation split brain:** 33 markdown files at repo root plus a
  curated `docs/`. Root contains `CODEBASE_ANALYSIS.md`, `CODEBASE_REVIEW.md`,
  `CAREERRAI_TECHNICAL_REVIEW.md`, `DESIGN_AUDIT.md`, `IA_AUDIT.md`,
  `REBUILD_NOTES.md`, `UPGRADE_STATUS.md`, `IMPLEMENTATION_STATUS.txt`,
  `fix-summary.txt` — overlapping, undated, and of unknown currency. A new
  engineer cannot tell which document is true.
- **M4 — `README.md` is stale and actively misleading.** It describes Admin as
  "(Phase 2)". Admin currently has **27 API routes and 28 pages**. The README is
  the first file anyone opens.
- **M5 — Cron endpoints living in the admin namespace:** `vercel.json` schedules
  `/api/admin/cleanup-voice-notes` and `/api/admin/security-monitor`. Every other
  scheduled job lives under `/api/cron/`. Two jobs are authorized by a different
  mechanism than their 34 siblings purely because of where they sit.
- **M6 — Under-used dependencies:** `@anthropic-ai/sdk` is imported by exactly
  one file (`api/weekly-signal/route.ts`) alongside a separate Gemini
  integration — two LLM vendors for one product. `framer-motion` appears in one
  file. Both ship to users in the bundle graph.
- **M7 — God files.** Largest: `api/routine/today/route.ts` (584),
  `buddy/(dashboard)/students/[id]/page.tsx` (562),
  `buddy/setup/setup-form-client.tsx` (560),
  `components/DailyTracker/TodaysRoutineCard.tsx` (524, 7 fetch calls in one
  component), `student/onboarding/screens/screen-topic-coverage.tsx` (519),
  `components/post-signup-sequence.tsx` (514). A 584-line route handler is doing
  data access, domain computation and response shaping in one function.
- **M8 — No error boundaries below route level.** Three `error.tsx` files
  (`app/`, `student/`, `buddy/`) and **zero** React error boundary components. One
  throwing widget blanks an entire route.

---

## 5. Low Priority Issues

- **L1** — Casing inconsistency: 5 PascalCase filenames, all inside
  `src/components/DailyTracker/`, against 566 kebab-case files elsewhere. This is
  the *only* naming inconsistency in the repository.
- **L2** — Opaque route names: `/app`, `/go`, `/debug` are single-page routes
  whose purpose is not inferable from the path.
- **L3** — `src/lib/chat.ts:2` imports a type from `@/components/chat/types` —
  the single dependency-direction violation in 571 files.
- **L4** — `src/lib/utils.ts` is a generic-named catch-all.
- **L5** — 17 loose files in `scripts/` (`.js`, `.mjs`, `.ts`, `.sql`, `.json`)
  with no README and no indication which are current.

---

## 6. Architecture Diagram (plain English)

**How a request flows today:**

1. A request hits **`src/proxy.ts`** (147 lines, Next's middleware hook). It
   canonicalises the domain, intercepts Supabase magic-link params, refreshes the
   auth session so Server Components can read it, and routes an authenticated
   user at `/` to a role-appropriate home using a `user_role` cookie. Static
   assets skip the auth handshake entirely. **This file is well-designed** — one
   responsibility, correct ordering (cookies survive redirects issued after
   `getUser()`), and it documents its own loop-safety precondition.

2. **Server Components** (113 of 280 `.tsx` files) read data directly, usually via
   the service-role client, and render.

3. **Client Components** (167 of 280) call **`fetch('/api/…')`** directly from
   inside JSX — 117 such calls across 79 files, mostly with no shared error or
   retry handling.

4. **Route handlers** (140) each: authenticate (in one of ~4 idioms), instantiate
   a Supabase client (via one of three wrappers, or by hand-rolling
   `createServerClient` from `@supabase/ssr` — **26 route files do this**, duplicating
   cookie boilerplate), query, compute, respond.

5. **Domain logic** lives in `src/lib` (136 flat modules) and is genuinely
   imported by routes rather than duplicated into them. **This is the strongest
   part of the architecture.**

6. **36 cron jobs** invoke route handlers on schedule, sharing the same helpers.

### Where responsibility flows incorrectly

- **UI → network.** Components own data fetching. There is no service layer
  between JSX and HTTP. `TodaysRoutineCard.tsx` alone makes 7 fetch calls.
- **Route handler → everything.** The 584-line `routine/today` handler performs
  data access, domain computation and presentation shaping in one function. Route
  handlers should orchestrate, not compute.
- **Application → database, one-directionally.** The DB has no opinion about
  authorization. All trust flows outward from TypeScript, never checked again.
- **Correctly directed, and worth stating:** `lib` never imports `app`
  (1 exception, L3). `components` never imports from `app/`. Student, buddy,
  admin and sales page trees have **zero** imports between them. Feature
  isolation at the *route* level is genuinely clean.

---

## 7. Folder Organization Review

Current shape is **layer-first** (`components/`, `lib/`, `hooks/`, `types/`),
which is the shape that stops working at exactly this size.

**Recommended target — feature-first with a shared core:**

```
src/
  features/
    study-plan/      { components/ server/ domain/ types.ts }
    tracking/        streaks, logging, daily report
    evidence/        coverage, topic evidence, readiness
    mentorship/      buddy matching, sessions, chat, briefings
    peer-learning/   community pipeline, daily pick, moderation
    growth/          onboarding, install, funnel, attribution
    notifications/   push, in-app, delivery, health
    payments/        razorpay, plans, pricing, coupons
    admin/           dashboards, ops tooling
  core/
    auth/            ONE authorization module (see C2)
    db/              the three Supabase clients, nothing else
    http/            one API client + one error taxonomy (see C4, H1)
    ui/              design-system primitives only
  app/               routing only — thin handlers that call features
```

Two rules make this durable, and both are mechanically enforceable in CI:

1. `features/*` may import from `core/*` — **never** from another `features/*`.
   Cross-feature needs go through an explicit exported contract.
2. `app/*` may import from `features/*` — never the reverse.

Because dependency direction is *already* clean and there are zero cycles, this
is mostly a **file-move exercise**, not a redesign. That is a meaningful and
somewhat lucky asset.

---

## 8. Dependency Graph Review

**Verified strengths:**

- **0 circular dependencies** across 572 files (madge, 5.6s scan).
- **0 cross-feature page imports** — student/buddy/admin/sales are independent.
- **1** dependency-direction violation total (`src/lib/chat.ts:2`).

**Tight coupling that does exist:**

| Coupling | Evidence | Consequence |
|---|---|---|
| Everything → `createAdminClient` | 207 files | Cannot introduce RLS, connection pooling, read replicas or query auditing without touching 207 files |
| Everything → raw `fetch` | 117 sites / 79 files | Cannot add retries, timeouts, tracing or offline queueing centrally |
| Admin auth → 4 idioms | 20+ files | Cannot add a role or audit privileged reads in one place |
| 26 routes → `@supabase/ssr` directly | bypasses `lib/supabase/server` | Cookie-handling boilerplate duplicated 26× |

**Can features be removed independently?** At the route level, yes — deleting
`src/app/sales/` would not break the student experience. At the component and lib
level, no: the flat directories mean deletion requires a global grep, and the
"is this still used?" question has no structural answer.

---

## 9. Engineering Principles Violated

| Principle | Violation | Concrete evidence |
|---|---|---|
| **DRY** | Admin authorization written 4 ways | 13 inline copies of `from('profiles').select('role').eq('id', user.id).single()` |
| **DRY / SSOT** | Price duplicated beside its own SSOT | `unlock-buddy-sheet.tsx:188,214,310` hardcode `₹2,999` while importing `plans.ts` |
| **DRY** | Supabase cookie boilerplate | 26 route files re-implement `createServerClient` instead of using `lib/supabase/server` |
| **SRP** | Route handlers do data + domain + presentation | `api/routine/today/route.ts` (584 lines) |
| **SRP** | Components own network I/O | `TodaysRoutineCard.tsx` — 524 lines, 7 fetch calls |
| **Dependency Inversion** | UI depends on concrete HTTP, not an abstraction | 117 raw `fetch('/api/…')` calls |
| **Clean Architecture** | No boundary between domain and delivery | `src/lib` mixes pure domain (`evidence.ts`) with vendor SDKs (`razorpay.ts`, `whatsapp.ts`) |
| **DDD — bounded contexts** | No context boundaries exist | Flat `components/` and `lib/`; no feature module owns a concept |
| **KISS** | Two LLM vendors for one product | `@anthropic-ai/sdk` (1 file) alongside Gemini |
| **YAGNI** | *Not violated* — worth stating | Dormant code (`mentor-doors`, section engines) is gated deliberately and documented, not speculative |

---

## 10. What Is Genuinely Well-Designed

Stated explicitly, because a diligence document that only lists faults is not
diligence.

1. **Zero circular dependencies and clean dependency direction** across 571
   files. Most codebases this size have dozens of cycles. This one has none. It is
   the single biggest reason the §7 refactor is a file-move rather than a rewrite.

2. **`src/proxy.ts`** — one responsibility, correct ordering, documents its own
   preconditions, and deliberately skips the auth round-trip on static assets.

3. **Domain logic is genuinely extracted.** `evidence.ts`, `buddy-match.ts`,
   `prep-model.ts`, `community-pipeline.ts`, `pricing.ts` are real modules that
   routes call — not logic copy-pasted into handlers. Many teams at this stage
   have no `lib` worth the name.

4. **Safety invariants are encoded, not assumed.** `mergeStatus` in `evidence.ts`
   is forward-only so a derived status can never mass-demote students.
   `prep-model.ts` carries an explicit `MAX_MODEL_DRIFT` guard that *blocks*
   engines when models disagree. `community-pipeline.ts` states its thresholds as
   named constants. Someone thought about failure modes before they happened.

5. **Decision records and incident memory.** `docs/DECISIONS.md` (ADR-001…008),
   `docs/ENGINEERING-MEMORY.md`, `ENGINEERING_PLAYBOOK.md`, and five OS
   constitutions in `docs/OS/`. This is the artefact most startups at Series A
   cannot produce.

6. **No file-naming debris.** Zero instances of `*V2`, `*-new`, `*-final`,
   `*-copy`, `*-old` in 571 files. Given how fast this was built, that is
   discipline, not luck.

7. **Deny-by-default database posture.** 32 tables with RLS on and no policies is
   listed above as a risk, and it is — but it is the *safe* failure direction. The
   alternative mistake (RLS off entirely) is the one that leaks data.

8. **Security headers configured with stated reasoning** in `next.config.ts`,
   including an explicit note on why CSP is *not* enforced (Razorpay iframe,
   microphone). Knowing what you chose not to do, and why, is senior behaviour.

---

## 11. Refactoring Roadmap

### Phase 1 — Safe (1 week) · Risk: **very low** · No behaviour change

| Task | Effort |
|---|---|
| Delete/ignore committed junk: `import-all-users.csv`, `dev-*.log`, `spec_temp/`, `test-results/`; extend `.gitignore` | 1h |
| Rewrite `README.md` to current reality; move the 33 root markdown files into `docs/archive/` with dates | 3h |
| Add unit tests for the 6 pure modules in C1 (`study-day`, `streak-utils`, `evidence`, `prep-model`, `buddy-match`, `pricing`) | 2–3 days |
| Add CI: typecheck + lint + tests must pass before merge | 3h |
| Fix H4 (three hardcoded `₹2,999`) and L3 (`lib/chat.ts` import) | 30m |
| Move the 2 cron endpoints out of `/api/admin/` into `/api/cron/` (M5) | 1h |

**Deliverable: a CI gate exists.** Nothing after this point can silently regress
the six modules that hold the product's core invariants.

### Phase 2 — Moderate (2 weeks) · Risk: **low–medium** · Behaviour preserved

| Task | Effort |
|---|---|
| Collapse 4 admin-auth idioms into one `core/auth` module; migrate all 20+ call sites | 3 days |
| Migrate the 26 hand-rolled `createServerClient` routes onto `lib/supabase/server` | 2 days |
| Build one API client (`core/http`) with timeout, retry, error taxonomy; migrate the 20 highest-traffic of 117 fetch sites | 4 days |
| Adopt `src/lib/api-error.ts` across all 140 routes; add structured logging with request + user correlation | 3 days |

**Risk control:** each is mechanical and independently revertible. Do the auth
consolidation first and alone — it touches the routes that must never break.

### Phase 3 — Major (3 weeks) · Risk: **medium** · Structural

| Task | Effort |
|---|---|
| Move to the feature-first layout in §7 — mostly `git mv` plus import rewrites | 1.5 weeks |
| Add lint rules enforcing the two boundary rules (`eslint-plugin-boundaries`) | 2 days |
| Split the 6 god files (M7) — extract domain computation out of route handlers | 1 week |
| Batch the sequential loops in H3; add checkpointing so a partial cron run resumes | 3 days |

**Do this only after Phase 1.** Moving 571 files without a test suite is how a
refactor becomes an outage.

### Phase 4 — Long-term (ongoing) · Risk: **medium–high**

| Task | Why |
|---|---|
| Introduce RLS policies on the 20 highest-value tables; migrate the corresponding reads off the service-role client | Defence in depth — removes "one forgotten filter = data leak" |
| Move the 36 crons to a queue with retries and dead-letter handling | Serverless cron cannot survive 100k-row jobs |
| Extract notifications into a service with a real delivery ledger | Already the most incident-prone subsystem |
| Add read replicas / caching for dashboard aggregations | `launch-metrics` already runs 9 parallel full-table reads |

---

## 12. Production Readiness by Scale

| Scale | Verdict | Binding constraint |
|---|---|---|
| **100 users** | ✅ Comfortable | Current state. 244 students, no reported crashes. |
| **10,000** | ✅ Holds | Vercel + Supabase absorb this. Cron loops slow but complete. `/admin/launch` aggregations start to hurt. |
| **100,000** | ⚠️ Breaks in three specific places | (1) Per-row cron loops exceed execution limits and fail partially with no resumption. (2) Dashboard routes doing 9 unbounded full-table reads. (3) `console.*` logging becomes unusable for diagnosis. |
| **1,000,000** | ❌ Not without Phase 4 | Needs a job queue, RLS or a data-access layer, connection pooling, caching, and real observability. Serverless-per-request against a single Postgres will not hold. |
| **10,000,000** | ❌ Different architecture | Read replicas, event streaming, regional distribution. Not a criticism — no pre-Series-A codebase is built for this. |

**The honest headline:** infrastructure is not the near-term bottleneck.
**Engineering throughput is.** This codebase can serve 100,000 students far more
easily than it can absorb 10 engineers.

---

## 13. Closing Position

If this repository arrived on my desk during diligence, I would write:

> *"Strong product engineering, genuine architectural instincts, and the best
> decision documentation I have seen at this stage. Blocked on three things: no
> test coverage, authorization scattered across four idioms with no database
> backstop, and no feature boundaries to assign ownership against. None require a
> rewrite — the dependency graph is clean and acyclic, which is the expensive
> property to fix and is already correct. Six weeks of focused consolidation makes
> this fundable engineering. I would fund the team and hold the hiring plan until
> Phase 1 ships."*

The strongest signal in this repository is not any single module. It is that the
code records **why** decisions were made, and that previous mistakes were written
down rather than quietly fixed. That habit is worth more than any refactor,
because it is the one thing you cannot retrofit.

The weakest signal is that none of that knowledge is executable. Comments do not
fail a build. Tests do.
