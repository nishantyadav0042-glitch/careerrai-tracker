# CODEMAP — read this in your first hour

Stamped **7 Aug 2026**. This is the code-orientation half of the knowledge
system: `docs/KNOWLEDGE.md` tells you what the company is and what is true in
production; **this file tells you where everything lives and which rules have
teeth**. If the two ever disagree, run the code and fix the doc.

The test this file holds itself to: a developer (human or AI) who has never
seen this repo should, after one read, know where to make any given change,
which modules they must not bypass, and how to prove their change works.

---

## 1. The stack in one paragraph

Next.js 15 App Router on Vercel (project **careerrai-daily** — careerrai.in;
the `careerrai-tracker` Vercel project is dead, ignore it). Supabase for
Postgres + auth + storage; RLS everywhere, but all writes that matter go
through API routes using the service role. AI = Gemini (`gemini-2.5-flash-lite`)
via plain fetch in `src/lib/gemini.ts` — no SDK, key in Vercel env with a
`server_config` table fallback. Tests: vitest, ~560 and growing, colocated as
`src/lib/*.test.ts`. No googleapis SDK, no ORM, no state library — plain
fetch, plain SQL via supabase-js, React server components.

---

## 2. Directory anatomy

```
src/
  app/                    Route tree. Three worlds, one login:
    student/…               the student PWA (tracker = Home, blueprint, buddy, community)
    buddy/(dashboard)/…     the mentor dashboard (home triage, students/[id], schedule)
    admin/…                 founder-only surfaces (require-admin.ts gates them)
    api/…                   159 route handlers — thin; logic lives in lib/
    api/cron/…              32 scheduled jobs; schedules in vercel.json; all check cron-auth.ts
    start/, welcome/, …     the acquisition funnel and static/legal pages
  lib/                    163 modules. THE PRODUCT LIVES HERE. Routes orchestrate;
                          lib decides. Anything worth testing is a pure function here.
  components/             ~90 client components; subfolders per domain
                          (home/, buddy/, chat/, student/, DailyTracker/, ui/)
  lib/__fixtures__/       real files that broke in production, kept as regression tests
supabase/migrations/      every schema change, in order, with WHY comments
docs/                     KNOWLEDGE.md (company), CODEMAP.md (this), OS/ (constitutions),
                          ENGINEERING-MEMORY.md (incidents — read before touching a subsystem)
scripts/                  one-off operational scripts (not imported by the app)
```

The pattern to internalise: **route = wiring, lib = rules**. When a route
contains an `if` about the product, that `if` is in the wrong file.

---

## 3. The load-bearing modules (where to make which change)

### The planner — ONE authority, three views (Incident #26)
```
                    THE AUTHORITY
  lib/topic-selector.ts  chooseSectionDay — WHICH topics (syllabus clock + memory clock)
  lib/routine-engine.ts  dayShape         — HOW the day splits (sections, minutes, blocks)

                    THE VIEWS
  lib/day-topics.ts       today's picks, for both of today's callers
    ├─ app/api/routine/today/route.ts  ← the app's hot path (student opens tracker)
    └─ lib/routine-plan.ts             ← the 6am notification cron (runs FIRST — it wins mornings)
  lib/plan-projection.ts  the same authority walked forward, day by day
    ├─ lib/full-plan.ts        Whole Plan (today → CAT day) + the exam calendar's items
    └─ lib/study-forecast.ts   the Blueprint's 7-day strip
  lib/exam-calendar.ts    THE EXAM CALENDAR — mock days, their analysis, phases.
                          Both full-plan AND generateRoutine reserve from this
                          one claim, so Home == whole-plan day 0 on mock days
                          too (the gap PR #88 shipped with, closed 12 Aug).

profiles.study_target_hours ──▶ lib/daily-hours.ts ──▶ routine profile
Staleness (may today's plan rebuild?): lib/plan-freshness.ts — ONLY on the
student changing their own hours, or a check-in arriving after the build.
```

**Do not add a fourth planner.** `planner-unification.test.ts` greps the tree:
any file outside the authority that calls `chooseSectionDay` /
`chooseTopicForSection`, or reintroduces a second day-shape model, fails CI. It
also asserts Home's today equals the Whole Plan's day 0 — topics, sections and
block count — and that a future date does not drift between reads.

- **`lib/daily-hours.ts`** — THE student's daily hours. One number, one owner,
  one writer (`setDailyHours`). A guard test greps the whole tree for any other
  writer. Do not add one. (Incident #22.)
- **`lib/routine-engine.ts`** — pure plan generator. Same inputs → same day,
  deterministic; the behavioural `volumeFactor` was removed on founder order.
- **`lib/topic-selector.ts`** — the scored choice. Bonus ladder
  (postponed 50 > today's-class 45 > priority 25 > focus 22 > self-report 12);
  the ordering is a product decision — a promise beats a schedule.
  `chooseSectionDay` splits the day's blocks between the SYLLABUS clock (first
  contact, ≥1 block a day while anything is unopened — this is what makes 46/46
  structural rather than weight-dependent) and the MEMORY clock (revision).
- **`lib/plan-projection.ts`** — the one forward planner. Pure and
  deterministic: same state in, same plan out, so a future date is a promise
  rather than a re-roll. Advances exactly what the live engine advances.
- **`lib/syllabus-pace.ts`** — "at this rate, do we finish?" Shapes ordering
  WITHIN each clock; it no longer gates novelty.
- **`lib/plan-extension.ts` + `api/cron/weekly-plan-reconcile`** — falling
  behind moves the FINISH DATE, weekly, with arithmetic. Hours never move.
- **`lib/study-pace.ts`** — remaining-hours model + `computeRequiredPace`. It
  informs warnings and reschedule pricing; it must NEVER write hours.

### The coaching timetable (premium, buddy-curated)
```
upload (photo/PDF/xlsx) ─▶ api/timetable/parse ─▶ lib/workbook-text.ts (xlsx→text)
                                             ─▶ lib/timetable-extract.ts (prompts + JSON salvage)
                                             ─▶ lib/timetable.ts (sanitizers — the hard gate)
confirm ─▶ lib/timetable-apply.ts  ◀─ ALSO the buddy editor (api/buddy/student-timetable)
           one save path: persist, align coverage, rebuild today, plan_source
alignment reads ─▶ lib/timetable-align.ts (today's topics, implied hours, horizon)
```
Premium-gated server-side in both parse and save. The live-fire harness
`lib/timetable-live-fire.test.ts` replays the real failing file against the
real Gemini API (set `GEMINI_LIVE_KEY`; skipped otherwise).

### Chat + attachments
- **`lib/chat-attachments.ts`** — allowlist + byte sniffing (zip first-entry
  parsing for OOXML). The SAME list must exist in the storage bucket's
  `allowed_mime_types` — a guard test ties them together. (See §5, rule 2.)
- **`lib/chat-attachment-verify.ts`** — post-upload verification, the boundary
  the client cannot lie to. On failure the object is DISCARDED and the client
  is told `attachmentGone` so it re-uploads instead of resending a dead path.
- **`lib/chat-deliver.ts`** — the ONE way a message enters `chat_messages`:
  block check, insert, push to the other side, and the stamp that marks a
  mentor check-in as answered. Both `api/chat/send` and `api/buddy/checkin`
  go through it, so a check-in is byte-for-byte a normal message.
- `components/chat/` — thread, composer, upload hook.

### Sessions + Google
- **`lib/buddy-room.ts`** — one permanent room per buddy; compare-and-swap
  minting; `buddyBookingReadiness` is the ONE answer to "can they book".
- **`lib/google-meet.ts` / `lib/google-oauth.ts`** — calendar calls with a
  failure taxonomy; 401 tears down state once. Pasted links (`lib/meeting-room-link.ts`)
  are the PRIMARY path; Google is the convenience layer.
- Booking constraints live in **Postgres** (exclusion constraints), translated
  by `lib/booking-constraints.ts`. The DB is the referee, not the UI.

### Notifications
- **`lib/notifications.ts`** (dispatch, budget, dedupe) ← everything sends
  through this. `lib/push.ts` + `push-client.ts` for web push mechanics.
- `api/cron/study-companion` — one route, four scheduled slots (08:00 kickoff,
  11:00 spark, 20:30 progress, 21:30 log IST). Four because `BUDGET_ACTIVE = 4`.
  Five more slots keep their copy but are retired (`RETIRED_COMPANION_SLOTS`)
  and refused by the route. vercel.json is the canonical schedule and
  `companion-schedule.guard.test.ts` holds the two in agreement. The state
  ladders (activation / reactivation / active) live in `lib/companion.ts`.
- **`lib/os/buddy-checkin.ts`** — the mentor check-in: when a PAYING student
  goes two days without any log, the cron DRAFTS a message from that student's
  real data and the mentor sends it with one tap from their own id. Pure logic
  (trigger, cooldown, unanswered-stop, wording); the cron writes rows,
  `api/buddy/checkin` sends. It never auto-sends — a message from a mentor's id
  that the mentor has not seen means the student replies into silence.
  **Premium only**, gated twice (cron + send-time re-check) and guarded by
  `buddy-checkin-premium.guard.test.ts`. This is the paid side of "the machine
  is free, the human is paid": `buddy_id` alone is NOT proof of paying.

### Install (getting the app onto the phone)
- **`lib/install/capabilities.ts`** — `resolveStrategy()` turns a detected
  environment into exactly ONE strategy. Read the rule order before changing
  it: iPhone/iPad returns `ios-app-store` BEFORE the in-app-browser escape, and
  that ordering is what makes Instagram/WhatsApp traffic a one-tap install.
- **`lib/install/store-links.ts`** — `APP_STORE_URL`, the one place the listing
  lives. `apps.apple.com` over https is deliberate: that is what makes iOS treat
  it as a universal link and hand off to the App Store app.
- `components/install/app-store-card.tsx` — the iPhone surface (black button,
  inline Apple glyph, quiet A2HS fallback). `InstallButton` swaps to it for
  every variant on iOS, so there is only ever one control per action.
- Add-to-Home-Screen still exists but is no longer resolved automatically on
  iOS — it is reachable only via `addToHomeScreenInstead()`, offered under the
  card for anyone the App Store fails.

### Money
- `lib/razorpay.ts` + `api/webhooks` — **the webhook is the source of truth**
  for `is_premium`. UI never flips it.
- `lib/plans.ts` — **THE pricing authority.** Three products, `offerPaise` is
  charged and `listPaise` is display-only. Nothing else may state a price;
  `price-authority.guard.test.ts` rejects both display strings and bare rupee
  integers outside it.
- `lib/activate-payment.ts` — `activatePaidOrder()` on the way in,
  `settleRefund()` on the way out. A refund writes `status='refunded'` +
  `refunded_at` AND withdraws the incentive; before 28 Aug it did neither
  (Incident #40).

### Counsellor pay + follow-up (the sales OS's money half)
```
payment realised ─▶ recordConversion()  ── freezes lead_outreach.owner_id ──▶ sales_conversions
refund processed ─▶ settleRefund()      ── stamps refunded_at ─────────────▶ sales_conversions
                                                                                  │
                        lib/sales-earnings.ts  computePayslip()  ◀────────────────┘
                          ├─ /sales/earnings          the counsellor's own statement
                          └─ /admin/sales/payroll     what the founder owes, with every row
```
- **`lib/sales-earnings.ts`** — the ONLY place a person's pay is computed.
  Fixed fee + percent of realised, rounded per line to whole rupees so the
  payslip reproduces the table printed in the engagement letters. Terms are
  read from `sales_rep_config`; **absent terms return UNKNOWN, never ₹0**
  (Law L1). `sales-earnings.guard.test.ts` sweeps for a second definition.
- **`sales_conversions`** — the incentive ledger. `payment_id` is the primary
  key (a redelivered webhook cannot double-pay) and `rep_id` is a **snapshot**,
  deliberately not kept in step with `lead_outreach.owner_id`, which is mutable.
  Never pay from `owner_id`.
- **`lib/sales-sla.ts`** — first contact measured in the rep's own WORKING
  minutes (`work_days` + hours), never wall clock: a lead handed over at 21:30
  is due next working evening. `assigned_at` / `first_contact_at` on
  `lead_outreach` are the two clocks; **NULL means unknown, never "on time"**.
- **`lib/sales-board.ts`** — one counsellor's day: open promises bucketed
  overdue/today/upcoming (from `sales_followup`) plus who is still waiting for a
  first call. `promises: null` survives to the renderer — a failed read must
  never render as "nothing due".
- Part-time seats must STATE their terms, pay included
  (`PART_TIME_REQUIRED_FIELDS`). There are no part-time defaults, and 0% is a
  valid answer where silence is not.

### Observability (use these before guessing)
- **`integration_audit_log`** table + `lib/integration-audit.ts` — every
  sensitive action, with a CHECK constraint that rejects secrets in details.
- **`student_events`** — client taps (`lib/journey.ts` `track()`).
- **`security_events`** — server errors worth SELECTing (plan engine catches).
- Vercel runtime logs/errors via MCP; `docs/ENGINEERING-MEMORY.md` for what
  has already gone wrong and why.

---

## 4. The crons (vercel.json is the schedule of record)

42 declared crons (38 routes; study-companion is declared once per slot).
The ones that shape a student's day: `study-companion` (4 scheduled slots),
`weekly-plan-reconcile` (Sunday
19:00 IST — the ONLY thing that moves a finish date), `daily-insight` (5pm),
`daily-heartbeat` (9pm guarantee push), `timetable-horizon` (9am — "upload
your next sheet"). All POST, all `authorizedCron`, all idempotent per day —
a cron that cannot be safely re-run is a bug.

Test accounts (`is_test_account`) are INCLUDED in student-experience crons and
EXCLUDED from metrics/CRM/outreach — the founder tests as a student; the
dashboards must not count him.

`buddy-checkin` (04:00 UTC, 30 min after `buddy-brief`) is on the OUTREACH side
of that line even though it looks like a student-experience cron: its output is
a card on a real mentor's home screen. Two of the five assigned students on
10 Aug were test accounts, so including them would have made the mentor's first
experience of the feature entirely fake students.

The two "you didn't log" jobs are sequenced, not duplicated:
`log-yesterday-reminder` (08:00 IST) fires on ONE missed day, from the app, only
to students who opened it. `buddy-checkin` drafts on TWO consecutive missed
days, from a human. The app asks first; the mentor follows only when the app
failed. Nobody gets both for the same miss.

---

## 5. Invariants — the rules with teeth

These are not conventions; each one was paid for with a production incident
and most have a guard test that fails the build if violated.

1. **One number, one owner.** `study_target_hours` is written only by
   `setDailyHours()`, only from a student action. Nothing derives hours from
   dates, behaviour, or capacity. Falling behind moves the DATE, weekly.
   *Guard: `daily-hours.test.ts` greps the tree.* (Incident #22)
2. **A rule lives in ONE place.** The chat body-check, the attachment
   allowlist, and the byte sniffer each briefly had two copies that drifted —
   three user-facing failures in one day. If a rule must exist in code AND
   config (DB constraint, bucket allowlist), a test must tie them together.
   *Guards: `chat-attachments.test.ts` bucket-sync test; `timetable-apply.ts`
   as the single save path.* (Incident #23)
3. **A model's promise is not a bound.** Instructed to emit 21 days, Gemini
   emitted 117 and truncated its own JSON. Limits are enforced on DATA in
   code (`windowDatedSheets`), with `salvageTruncatedJson` as the net.
4. **Completed work is never wiped.** Any plan rebuild (hours change,
   timetable save, check-in) is gated on zero ticked tasks today.
5. **The client is never the authority.** Everything re-validated server-side;
   uploads verified by bytes after landing; premium gates live in routes, not
   UI; the Razorpay webhook owns `is_premium`.
6. **Every failure says something true.** No silent bounces (the Google
   ?google= params), no generic 500s for business rules
   (`booking-constraints.ts`), no "try a clearer photo" for a quota error.
   The error string should name whose problem it is.
7. **AI summarises; it never decides.** `GOVERNING_RULE` in `lib/gemini.ts`.
   Extract-only prompts; deterministic sanitizers between model and DB;
   topics must match `ALLOWED_TOPICS` character-for-character or become null.
8. **Never blame a student for time before they joined** (`reconcileWeek`
   joinedOn), never claim the app did something it didn't
   (`plan-reason.ts` refuses untrue because-lines).
9. **We link to content; we never host it, and never require it.** External
   resources (`lib/topic-resources.ts` → `routine-engine.resourceForTask` →
   `components/task-resource.tsx`) are one anchor to the original watch page,
   opened outside the app, marked optional, with the channel and the
   platform-read runtime shown before the tap. No iframe, no `/embed`, no
   proxy — an embed makes us the publisher. Attaching a resource must never
   change a task's `target`, and opening one must never tick a task.
   *Guards: `task-resource-surface.guard.test.ts` (the surface),
   `topic-resources.guard.test.ts` (the data — nine researched videos did not
   exist, twenty-two runtimes were wrong, three channels were misattributed).*

---

## 6. How to work here

```bash
npm run dev                     # local, against production Supabase (careful)
npx tsc --noEmit && npx vitest run && npm run lint    # the gate — ALWAYS &&-chained
```
- **Ship path:** feature branch → `npx tsc --noEmit && npx vitest run && npm run lint`
  → merge to `main` → Vercel auto-deploys careerrai.in (~60s). Verify READY.
- **Schema changes:** apply via Supabase MCP / dashboard AND write the same SQL
  to `supabase/migrations/` with a comment saying why. Both, always.
- **Debugging production:** audit log → student_events → Vercel runtime
  logs/errors → and for AI features, the live-fire pattern: reproduce with the
  real file against the real API before theorising.
- **Before touching a subsystem:** read its constitution (`docs/OS/`) and its
  incidents (`docs/ENGINEERING-MEMORY.md`). If a change would violate a
  constitution, the change is wrong — escalate, don't ship.
- **Secrets:** this repo is PUBLIC. Nothing sensitive in code, commits, or
  comments — ever. Keys live in Vercel env / `server_config`.

## 7. Vocabulary

| Term | Meaning |
|---|---|
| buddy | IIM-alumni mentor; the paid human layer |
| check-in | the evening "what did you study" flow that feeds tomorrow's plan |
| coverage / topic_coverage | the student's declared per-topic status matrix (46 topics) |
| plan_source | `coaching` (follow the uploaded timetable) vs `careerrai` (our engine) |
| shield | streak protection earned by consistency (`momentum.ts`) |
| Mentor Doors | free-tier surfaces that open toward buddy conversion |
| LIS | Learning Intelligence System — the layered engines in lib (capacity, adaptation, constraints, decision) |
| the ring | Home's syllabus-% circle (`pace-card.tsx`) |
```

---

## 8. Where the structure is heading (owner's standing plan)

`src/lib` is 163 flat files. It works because names are prefix-namespaced
(`plan-*`, `chat-*`, `timetable-*`) and this map exists — but it is past the
size where flat scales. The planned target, to be executed as ONE mechanical,
gate-verified change in a quiet window (never mid-incident, never while the
founder is live-testing):

```
lib/
  core/        auth, supabase/, utils, site, api-error, cron-auth, require-admin,
               server-config, security-log, feature-flags, integration-audit, idempotency
  plan/        routine-engine, routine-plan, topic-selector, topics-constants,
               daily-hours, plan-*, study-*, capacity/adaptation engines,
               coverage-*, prep-*, mastery engines + topic graphs, check-in, replan-engine
  timetable/   timetable*, workbook-text, coaching-progress, coaching-vocab, __fixtures__/
  chat/        chat*, attachments + verification
  sessions/    buddy-room, google-*, meeting-room-link, booking-constraints,
               session-window, call-*, daily (video)
  buddy/       buddy-match, buddy-banner, buddy-briefing, buddy-sla, weekly-diagnosis
  intel/       intelligence, constraint/coach/decision/performance/signal engines,
               lis-health, student-360/dna/brief, momentum, streak-*, mission-*, next-action
  notify/      notifications, notification-*, push*, companion, daily-insight,
               email, whatsapp, wa-messages, alerting, mission-queue, expedify
  growth/      funnel*, journey, track, autocapture, analytics*, community-*,
               challenge*, daily-pick*, sales-*, lead-intel, social-proof, channels
  money/       razorpay*, pricing, plans, premium, activate-payment
```

Execution recipe (so anyone can do it): (1) rewrite relative imports inside
lib to `@/lib/...` absolute; (2) `git mv` per the mapping; (3) global rewrite
of `@/lib/<name>` specifiers; (4) fix CWD-relative fixture paths in tests;
(5) `npx tsc --noEmit && npx vitest run && npm run lint` — the diff is done
when the gate is green and `grep -r "@/lib/" src` shows no stale specifier.
