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

## 5. What has NOT been audited

Stated plainly rather than implied:

| Phase | Status |
|---|---|
| 3 — Full journey execution | **Not run.** Needs a live account through signup → plan → OCR → notification |
| 4 — Plan differs by hours (2/3/5/8/10) | **Partially.** 4h and 6h verified today (31/46 vs 46/46 topics). 2, 3, 8, 10 not run |
| 5 — Coaching flow end-to-end | **Not run** against a real upload |
| 6 — OCR accuracy on real files | **Not run.** Only 2 real uploads exist and both are already fixtures |
| 7 — Notifications delivery | **Not run** |
| 8 — Premium purchase | **Not run** |
| 9 — Messaging + file transfer | **Not run** |
| 10 — Security / RLS sweep | **Not run** |

---

## RELEASE DECISION

**🟡 GO WITH RISKS — for 150–200/day. 🔴 NO GO for 10,000/day.**

Justification:

- Nothing found so far blocks tomorrow. Build is green, 698 tests pass, no P0
  defect has been found on the paths that were checked.
- The cron cliff is real and dated: it breaks somewhere between here and
  10,000, and it fails **silently**, which is the worst failure mode.
- Seven of ten phases have not been executed. **A GO on those would be a guess,
  and this audit's own rule is that a finding without evidence is not a
  finding.** I am not going to score phases I did not run.
