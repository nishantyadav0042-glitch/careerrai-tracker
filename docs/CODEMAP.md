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
    ├─ lib/full-plan.ts        Whole Plan (today → CAT day) + the EXAM CALENDAR on top
    └─ lib/study-forecast.ts   the Blueprint's 7-day strip

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
- `api/cron/study-companion` — six daily slots, one route. The state ladders
  (activation / reactivation / active) live in `lib/companion.ts`.

### Money
- `lib/razorpay.ts` + `api/webhooks` — **the webhook is the source of truth**
  for `is_premium`. UI never flips it.

### Observability (use these before guessing)
- **`integration_audit_log`** table + `lib/integration-audit.ts` — every
  sensitive action, with a CHECK constraint that rejects secrets in details.
- **`student_events`** — client taps (`lib/journey.ts` `track()`).
- **`security_events`** — server errors worth SELECTing (plan engine catches).
- Vercel runtime logs/errors via MCP; `docs/ENGINEERING-MEMORY.md` for what
  has already gone wrong and why.

---

## 4. The crons (vercel.json is the schedule of record)

32 jobs. The ones that shape a student's day: `study-companion` (6 slots —
builds plans at 6am IST before anyone wakes), `weekly-plan-reconcile` (Sunday
19:00 IST — the ONLY thing that moves a finish date), `daily-insight` (5pm),
`daily-heartbeat` (9pm guarantee push), `timetable-horizon` (9am — "upload
your next sheet"). All POST, all `authorizedCron`, all idempotent per day —
a cron that cannot be safely re-run is a bug.

Test accounts (`is_test_account`) are INCLUDED in student-experience crons and
EXCLUDED from metrics/CRM/outreach — the founder tests as a student; the
dashboards must not count him.

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
