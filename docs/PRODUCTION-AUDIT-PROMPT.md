# CareerRai — Production Readiness Audit

**Paste everything below the line into a fresh Claude Code session.**

The prompt is written for *this* repository, not a generic app. A generic audit
prompt sends a session hunting for Firebase Functions, Storage Rules and a React
Native bundle that do not exist here, and it burns a day proving absences. What
follows names the real stack, the real numbers, the real landmines, and the real
files — so the session spends its time finding defects instead of finding the
codebase.

---

## THE PROMPT

You are the CTO, Principal Engineer, QA Lead, Performance Engineer and Security
Engineer for CareerRai — a CAT-preparation app with 258 live students.

**From tomorrow, 150–200 students register per day, and the platform must be
able to reach 10,000 onboardings a day without failing.** The Android build is
currently under Google Play review.

Your objective is one sentence: **a student must get from A to Z without hitting
a single blocker.** A is tapping "Build my CAT plan". Z is holding a plan that
runs to CAT day with every topic on it. A second journey starts when they pay.

### Absolute constraints — violating any of these is a failed audit

1. **Never merge to `main`. Never push to `main`.** The Play review build is
   cut from it. Work only on the current feature branch.
2. **Do not change any production API's request or response shape.** Installed
   PWAs and the Play wrapper are running older bundles against it.
3. **Do not run destructive SQL.** No `DROP TABLE`, no `DELETE` without a
   `WHERE` you have first counted with a `SELECT`. 258 real students.
4. **Do not disable or weaken RLS.**
5. **Read `AGENTS.md` and `docs/ENGINEERING-MEMORY.md` before your first
   change.** The memory file is a list of incidents that already cost us; do
   not re-create one.
6. Every change ships with a test. `npx tsc --noEmit` and `npx vitest run` must
   both pass before every commit.

### The stack, so you do not go looking for the wrong things

| Layer | What it actually is |
|---|---|
| App | Next.js 16 App Router, TypeScript, Tailwind. A PWA, plus a TWA wrapper for Play. **No React Native.** |
| Hosting | Vercel project `careerrai-daily` → careerrai.in. `careerrai-tracker` is DEAD, ignore it. |
| DB / Auth / Storage | Supabase (Postgres). Server routes use the service role; the browser uses anon + RLS. |
| Background jobs | **Vercel cron only** (see `vercel.json`). No queues, no workers, no Lambda. |
| AI | Google Gemini `gemini-2.5-flash-lite` via plain `fetch` in `lib/gemini.ts`. **No SDK.** |
| Payments | Razorpay, webhook-confirmed. |
| Tests | Vitest, colocated `*.test.ts`. ~698 passing. Several are **guard tests that grep the source tree** — if one fails, it is telling you a rule was broken, not that it is flaky. |

### Start by reading the branch, not `main`

The feature branch is roughly 28 commits ahead of `main` and contains most of
what you are being asked to audit: the month-anchored coaching plan, the
effort multiplier, the busy-day shift, the full plan to CAT day, the plan
integrity checker, and the positioning screens. **Auditing `main` would audit
code that has already been replaced.** Run `git log --oneline main..HEAD` first
and read that list.

### Ground truth you do not need to rediscover

- 258 real students. 82 coaching-enrolled (15 of them repeaters), 176 self-prep.
- Only **2** coaching timetables have ever been uploaded. Both were malformed in
  ways now handled — read `docs/COACHING-CYCLE-RESEARCH-2026-08.md` before
  touching the timetable pipeline.
- **96 students installed the app and never logged once.** That is the single
  biggest hole in the funnel.
- CAT 2026 is Sunday 29 November. Today's runway is ~113 days.
- The syllabus model is 46 topics / 397 hours (`TOPIC_METADATA`).

### Known landmines — verify each one is still handled

- **`gemini-2.5-flash-lite` retires 16 Oct 2026.** Confirm there is a fallback
  path and that a model 404 degrades instead of throwing.
- **Two-hours-models trap.** `lib/prep-model.ts` is the only hours model.
  Anything that sums hours independently is a bug — there are guard tests.
- **Phantom columns.** A route selecting a column that does not exist fails
  silently at runtime. `src/lib/__fixtures__/profiles-columns.json` must match
  the live `profiles` table exactly; there is a schema-guard test.
- **Mirror drift.** `api/routine/today/route.ts` and `lib/routine-plan.ts`
  deliberately mirror each other so the 6am notification names the same plan
  the student later opens. Any change to one needs the same change in the other.
- **`is_test_account` vs `is_demo`.** Test accounts stay IN the experience
  crons and OUT of every dashboard, the CRM sync and the AI caller. Do not
  "simplify" this.

---

## What to audit, in priority order

Work top-down. Do not start at Phase 8 because it looks interesting.

### P0 — The A-to-Z journey must not break

**1. Signup → profile.** `/start` funnel (9 screens) →
`api/auth/verify-phone-otp`. Every answer collected must land in a column and
be read by something. Prove it, do not assume it — an audit on 8 Aug found
`coaching_enrolled` being passed into the routine engine and never read, and
`last_year_percentile` collected since 23 July and used nowhere.

**2. Study-plan generation.** `lib/full-plan.ts` + `lib/routine-engine.ts`.
Verify against `lib/plan-integrity.ts`, which already encodes the rules:

- all 46 topics scheduled, or the unscheduled ones **named** to the student
- a mock every week, 2/week in October and November
- a mock-analysis block the day after every mock
- revision present; **no new topics after 1 November**
- no day demanding more hours than the student agreed to

**3. The plan must genuinely differ by input.** Generate plans at 2, 3, 5, 8
and 10 hours a day and diff them. They must differ in topics-per-day, in
feasibility verdict, and in whether all 46 fit. Do the same for
repeater-vs-fresher (`studentEffortMultiplier` — a repeater at 88th percentile
faces 258h, not 397h) and for coaching-vs-self-prep. **If two different inputs
produce the same plan, that is a P0 bug.**

**4. Coaching month plan.** `lib/timetable-month.ts`. Upload → parse → anchor
to 31 real dates → the daily plan leads with what class teaches that day.
Verify with both real fixtures already in the tests (a syllabus list flattened
onto Monday, and a student's own gym/sleep routine).

**5. Notifications.** Permission → subscription → delivery → tap. Push
subscriptions die silently on Android; check `push-recovery` and
`notification-health`. Verify the 6am cron and the tracker name the same plan.

### P1 — Cost, scale and the things that break at 10,000/day

**6. Gemini usage — cut it back.** Founder's instruction: **keep exactly ONE
student-summary surface. Remove every other AI-generated summary and every AI
call that does not earn its cost.** Inventory every `callGemini` caller first,
report the list with a per-call cost estimate, then remove. OCR extraction
stays — it is the highest-value call in the product.

**7. Scale maths, done honestly.** At 10,000 onboardings/day, compute and
report actual numbers for: Supabase connection ceiling and whether any route
holds a connection while awaiting Gemini; Gemini requests/minute against the
published rate limit; Vercel cron duration limits — `study-companion` iterates
all students in one invocation, so state at what student count it exceeds the
limit; and the daily-plan generation path, which runs per student per day.
**Name the first thing that breaks and at what number.**

**8. Query and index audit.** Any query without an index on its filter column,
any N+1 in a loop, any `select('*')` on a hot path. `student/tracker/page.tsx`
scans full routine history — check it on `/admin/perf`.

### P2 — Cleanliness

**9. Dead code.** Unused files, components, routes, exports, dependencies,
feature flags, `console.log`, commented-out blocks, abandoned experiments.
**Delete only what you can prove is unreferenced** — grep for the symbol across
the whole tree first, and say so in the report. A file that "looks unused" but
is imported by a cron is a production outage.

**10. Security.** RLS on every table holding student data. No secret in the
repo (it is a **public** repository). Every admin route checking
`role === 'admin'` server-side. Input validation on every POST body.

---

## How to report

Do not say "everything works". A finding with no evidence is not a finding.

For each issue:

```
[P0/P1/P2/P3] Title
  File:        path:line
  Root cause:  what is actually wrong, in one sentence
  Evidence:    the query output, the failing assertion, the measured number
  Impact:      what a student experiences, and how many students
  Fix:         what you changed, or what you propose
  Effort:      S / M / L
```

Then the summary sections: Critical / High / Medium / Low bugs · Dead code
removed · Performance · Backend · AI cost · OCR · Study plan · Reminders ·
Notifications · Security · Scalability risks · **Production readiness
checklist with a go/no-go per phase**.

**Verify by running things, not by reading them.** The tools are here: `npm run
dev` plus Playwright at `/opt/pw-browsers` for real browser checks, Vitest for
the engines, and the Supabase MCP for live reads. Two of today's worst bugs — a
plan that silently dropped 18 topics, and a verdict that said "0 days short" on
a 54-hour shortfall — were invisible in code review and obvious the moment
something was actually run.

**When you are unsure what the founder wants, ask. Do not guess and build.**
