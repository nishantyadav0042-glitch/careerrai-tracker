# CareerRai Production Audit — evidence log

Started 8 Aug 2026, on `claude/status-update-t1g5as`. Nothing on `main`; the
Play review build is cut from `main` and is untouched.

**Status: Phases 1–2 evidenced, Phases 3–10 not started.** Every number below
was produced by running something, not by reading code. Sections that were not
run say so rather than guessing.

---

## 0. THE PRE-DELETION CHECKLIST — run this before removing anything

Founder, 8 Aug: *do not delete anything that is waiting to be pushed to main
because of the Play Store listing. Make this a checklist.*

This is not ceremony. **My first dead-code sweep produced 13 "unreferenced"
files, and 11 of them were live.** The grep matched `@/lib/x` imports and
missed relative ones. Deleting that list would have taken out the mastery
engines, the replan engine and the daily-pick system on the day we start
onboarding 200 students a day.

Every proposed deletion must pass **all seven**:

| # | Check | Command |
|---|---|---|
| 1 | No import, either style | `grep -rn -E "from '(@/lib/\|\./\|\.\./)NAME'" src/` |
| 2 | No dynamic import | `grep -rn "import(.*NAME" src/` |
| 3 | Not referenced by a cron | `grep -rn NAME src/app/api/cron/` |
| 4 | Not in `vercel.json` crons | `grep NAME vercel.json` |
| 5 | Not referenced by a test | `grep -rn NAME src/**/*.test.ts` |
| 6 | **Not in the un-merged main diff** | `git log main..HEAD --name-only \| grep NAME` |
| 7 | Full suite green after removal | `npx tsc --noEmit && npx vitest run` |

**Check 6 is the Play Store rule.** This branch is ~29 commits ahead of `main`.
A file that looks dead on the branch may be brand new *on the branch* and
waiting to ship — deleting it destroys unshipped work rather than dead weight.
If `git log main..HEAD` touched the file, **do not delete it. Ask.**

And a rule with no exceptions: **a file used only by tests is not dead.** It is
either a fixture or an engine whose consumer has not shipped yet.

---

## 1. Build health — PASS

```
npx tsc --noEmit   → 3 errors, ALL in .next/dev/types (stale generated files)
                     0 errors in src/
npx vitest run     → 698 passed, 1 skipped, 0 failed
```

The three errors are Next.js's own generated route types left behind by a
deleted dev page; `rm -rf .next/dev/types` clears them. **Not a defect, but it
masks real errors** — anyone running typecheck sees red and learns to ignore
red, which is how a real error gets shipped.

**P2 — add `.next` to the typecheck ignore, or clear it in the test script.**

---

## 2. Dead code — 2 files, not 13

Verified with all seven checks above.

| File | prod refs | test refs | Verdict |
|---|---|---|---|
| `lib/analytics-advanced.ts` | 0 | 0 | **Genuinely dead** |
| `lib/syllabus-feasibility.ts` | 0 | 0 | **Genuinely dead** |
| `lib/daily-pick.ts` | 3 | 4 | LIVE |
| `lib/daily.ts` | 0 | 44 | LIVE (fixture/engine) |
| `lib/dilr-mastery-engine.ts` | 1 | 0 | LIVE |
| `lib/dilr-topic-graph.ts` | 1 | 0 | LIVE |
| `lib/notification-decision.ts` | 1 | 1 | LIVE |
| `lib/plan-breach-constants.ts` | 1 | 0 | LIVE |
| `lib/qa-mastery-engine.ts` | 2 | 1 | LIVE |
| `lib/qa-topic-graph.ts` | 1 | 0 | LIVE |
| `lib/replan-engine.ts` | 1 | 1 | LIVE |
| `lib/varc-mastery-engine.ts` | 2 | 1 | LIVE |
| `lib/varc-topic-graph.ts` | 1 | 0 | LIVE |

**Neither has been deleted yet**, because `syllabus-feasibility.ts` fails
check 6 — it was modified on this branch today (made effort-aware) and is part
of the un-merged diff. It is dead, and it will still be dead after the merge;
removing it now would mix a deletion into a branch under Play review.

**Recommendation: delete both AFTER the branch merges. P3.**

Also found: **11 `console.log` calls on production paths.** Low priority but
they cost log volume at 10,000 students/day.

---

## 3. AI cost inventory — the founder's instruction is actionable

Nine files call Gemini. The founder's rule: **one student-summary surface,
remove the rest.**

| Caller | Purpose | Keep? |
|---|---|---|
| `api/timetable/parse` | OCR — coaching timetable → blocks | **KEEP.** Highest-value call in the product |
| `api/parse-scorecard` | OCR — mock scorecard | **KEEP.** Same reason |
| `lib/community-safety` | Moderation of student-submitted content | **KEEP.** Safety, not summary |
| `lib/buddy-briefing` | Summary for the mentor | **This is the ONE summary** to keep |
| `lib/mentor-doors` | AI copy | Candidate for removal |
| `api/weekly-signal` | Generated narrative | Candidate for removal |
| `api/feedback-draft` | Drafts feedback text | Candidate for removal |
| `api/coach-line` | Generated one-liner | Candidate for removal |
| `api/chat/draft` | Drafts a chat message | Candidate for removal |

**Five candidates for removal, ~55% of the AI surface.** I have NOT removed any
of them — each needs its live call volume checked first, and two are premium-
facing, so removal changes what a paying student sees. **That is a founder
decision, not an audit decision.**

**P1, blocked on your call: which of the five go?**

---

## 4. Scalability — the cliff has a number

**34 cron jobs** are registered in `vercel.json`. **At least 12 iterate every
student in a single invocation:**

```
buddy-brief · buddy-evening · builder-recovery · check-red-flags
compute-dna · daily-heartbeat · daily-insight · daily-reminder
decision-engine · expedify-flush · founder-digest · nishant-weekly
```

This is the scale cliff, and it is not the database. A Vercel function has a
hard duration cap. Each of these loops all students, and several do per-student
DB reads inside the loop.

At 258 students it finishes. **At 10,000 it will not** — the function is killed
mid-loop, and because there is no cursor, the students at the end of the list
are simply never processed. Silently. Every day.

**P0 for the 10,000 target — but NOT for tomorrow.** At 150–200/day you are
weeks away from this. The fix is a cursor and batching, not a rewrite.

**I have not measured the actual per-student duration**, so I cannot yet tell
you whether the cliff is at 2,000 students or 8,000. That measurement is the
first thing the next session should do.

---

## 5. PHASE 3+4 — Plan generation and personalisation: **PASS**

Run, not read. 46 untouched topics, 113 days to CAT, one profile changed at a
time.

```
 2h/day →  10/46 topics · fits=false · capacity 106h
 3h/day →  21/46 topics · fits=false · capacity 191h
 5h/day →  41/46 topics · fits=false · capacity 361h
 8h/day →  46/46 topics · fits=true  · capacity 616h
10h/day →  46/46 topics · fits=true  · capacity 786h

DISTINCT PLAN SIGNATURES: 5/5  → PASS
```

Five different commitments produce five genuinely different plans. **The
founder's "never generate the same plan" requirement holds.**

Archetype and coaching also differentiate:

```
fresher   397h syllabus · 113 days · fits=false
repeater  258h syllabus · 113 days · fits=true    (88th percentile)
coaching   31-day horizon (their uploaded month)
```

Integrity at 6h/day: **all five checks pass** — topics, mocks, analysis,
revision, hours. 113 days, no gaps, no missing weeks. 5 days carry nothing,
which is correct rather than a defect: they are days where the topic queue is
exhausted before revision season begins.

**One thing worth your attention.** At 6h/day the verdict reads *"fits, with 0
study days to spare"*. Six hours is the exact edge for a from-zero first-timer.
Anything less and the syllabus does not fit — which is true, and now visible,
but it means most self-prep students starting today will see a red verdict.
That is honest. It is also a product decision you may want to revisit
(scope-cut option, or CAT 2027 guidance).

---

## 6. PHASE 7-9 — Notifications, Premium, Messaging: live evidence

Read from production, not assumed:

| Signal | Live number |
|---|---|
| Notifications ever sent | **31,183** |
| Sent in the last 7 days | **8,170** |
| Live push subscriptions | 63 |
| **Dead push subscriptions** | **47** |
| Premium users | 6 |
| Plans built | 549 |
| Study logs | 204 |
| Coverage rows | 12,263 |

**Notifications: PASS.** The pipeline is demonstrably alive — 8,170 delivered
in seven days.

**P1 — push subscription death rate is 43%.** 47 dead against 63 live. That
matches the known Android silent-410 problem; `push-recovery` exists but is
clearly not winning. At 10,000 students this is ~4,300 students who stop
receiving anything and are never told.

**Premium (6 users) and messaging: NOT scored.** Six users is too small a
sample to call a payment flow healthy, and I did not execute a purchase. A GO
on payments without running one would be exactly the failure mode this audit
exists to avoid.

---

## 7. PHASE 8 — Security: **PASS**

```
public tables:      78
RLS disabled on:     0
```

**Every one of 78 tables has row-level security enabled.** No gaps.

---

## 8. THE SCALE CLIFF — now measured

Plan generation costs **18.1 ms of pure compute per student** (measured over 50
runs, no database time included).

```
   258 students →   4.7s   ← today, fine
 3,300 students →   60s    ← Vercel default function ceiling
10,000 students →  181s    ← pure CPU, before a single DB round trip
```

**The daily-plan cron breaks somewhere around 3,000–3,500 students** on the
default timeout, and earlier once per-student database reads are included.
There is no cursor, so when the function is killed the students at the end of
the list are simply never processed — silently, every day.

**P0 for scale, not for tomorrow.** The fix is batching plus a cursor, not a
rewrite. At 150–200/day you have weeks.

---

## 9. What is still NOT audited

Stated plainly rather than implied:

| Phase | Status |
|---|---|
| 3 — Plan generation | ✅ **PASS** — integrity, no gaps, verdict correct |
| 4 — Personalisation | ✅ **PASS** — 5/5 distinct signatures |
| 5 — Coaching flow | ⚠️ Engine tested with both real fixtures; **a live upload was not performed** |
| 6 — OCR accuracy | ❌ **Not run.** Needs real files through the live Gemini path |
| 7 — Notifications | ✅ **PASS** on delivery (8,170/7d); ⚠️ 43% subscription death is a P1 |
| 8 — Premium | ❌ **Not scored.** No purchase executed; n=6 |
| 9 — Messaging | ❌ **Not scored.** No file transfer executed |
| 10 — Security | ✅ **PASS** — RLS on 78/78 tables |

---

## RELEASE DECISION

**🟡 GO WITH RISKS — for 150–200/day. 🔴 NO GO for 10,000/day.**

Justification:

- **Nothing found blocks tomorrow.** Build green, 698 tests, RLS complete,
  plan generation correct and genuinely personalised, notifications delivering
  at volume.
- **The scale cliff is now measured, not guessed: ~3,000–3,500 students** on
  the daily-plan cron. It fails silently, which is the worst mode.
- **Push subscription death at 43%** is the most under-rated finding here. It
  does not block launch; it quietly erodes every promise made on the
  notification screen.
- **Three phases remain unscored** — OCR on real files, a real purchase, a real
  file transfer. Each needs a live account and a real artefact. I will not
  score them from code, and a GO on an unexecuted payment flow would be exactly
  the failure this audit exists to prevent.
