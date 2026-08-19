# G9 — A1 mechanism audit

**Mode:** read-only. No application code, schema, migration, test, contract or production data changed.
**Question:** why does credited study evidence exist without the completion rows that justify it?
**Date:** 19 Aug 2026.

---

## VERDICT

**One sub-mechanism is confirmed. The dominant one is not determinable from stored data, and
I am stopping rather than guessing.**

- **Confirmed (3 of 33):** the day's routine was created *after* the log was written, so
  `complete-task` returned **404 "No routine generated for today yet"** for every task.
- **Undetermined (30 of 33):** the routine existed, the client's payload construction is sound,
  and the requests were almost certainly sent — but **no stored artifact records what response
  they received**, because nothing is written on failure.

**`.catch(() => {})` is not the causal mechanism. It is what makes the mechanism invisible** —
and it is doing more damage than it appears, because there is **no `.ok` check either**, so an
HTTP 400/404/500 resolves normally and is discarded exactly like a network error.

**Recommendation: G10 must not begin with a fix. It should begin with the smallest possible
instrumentation, proposed below and deliberately not implemented.**

---

## The traced path

| Step | Finding |
|---|---|
| 1. Submit handler | `LoggingModal.handleSubmit` → `onSubmit` = `DailyTrackerApp.handleLogSubmit` |
| 2. Credit | `creditedHours()` computed **client-side** from `taskChoice` |
| 3. `daily_reports` write | `await submitLog(...)` → `/api/logging/log-daily` → `upsert_log_and_streak`. **Durable before any completion is attempted.** |
| 4. Payload construction | `completionRequestFor(id, prior, choice)` per plan task. **Sound** — a fresh mark (`prior === null`) always yields a request. An empty payload requires pre-existing completions, which by definition these rows do not have. |
| 5. Fan-out | `Promise.all(... fetch('/api/routine/complete-task') ... .catch(() => {}))` |
| 6. Concurrency | All tasks fire in parallel; each is independent |
| 7. Error handling | **`.catch` swallows network errors; no `.ok` check, so HTTP errors are swallowed too.** Nothing is recorded either way. |
| 8. Dedup / rate limit | `complete-task` treats 23505 as convergence (correct). No rate limit on this route. |
| 9. Auth | Route 401s without a user. Plausible if the session died mid-submission — and G8 established one student whose storage is wiped repeatedly. |
| 10. RLS / RPC | Route uses the **admin** client; RLS is not in the path. Not a candidate. |
| 11. Browser lifecycle | `handleLogSubmit` **awaits** the fan-out, and the modal awaits `onSubmit` before `onClose()`. **No unmount race from the modal itself.** A page navigation or tab kill mid-flight remains possible but is unevidenced. |
| 12. Fan-out assumptions | `complete-task` resolves the routine by `getLogDateString()` **independently** of the date the log used, and rejects any task not in *that* routine (400). Two dates, two lookups, no shared key. |

---

## Answers to the ten questions

**A. Why can credit persist with zero completions?** Because they are two independent writes and
the first one is durable before the second is attempted. Nothing links them.

**B. One failure mode or several?** **At least two.** The confirmed 404 case is structurally
different from the remaining 30, which occurred with a routine already present.

**C. Why do 25 of 29 affected students have *no* completion history at all?** **Unresolved, and
it is the most important open question.** It argues against random in-flight loss and for a path
that consistently produces nothing for those students. Note the corroborating skew below.

**D. Are requests actually sent?** **Almost certainly yes.** Step 4 is deterministic: marked
tasks with no prior completion always produce requests, and the credited hours confirm marks
existed (mean credited 2.71h against mean generated 5.71h — a coverage fraction of ~0.47, i.e.
roughly 1.7 of 3.5 tasks marked).

**E. What response do they receive?** **UNKNOWN. This is the gap.** No log, event or row is
written on failure.

**F. Racing navigation/unmount?** Not from the modal — the await chain is intact. External
navigation cannot be ruled out but has no supporting evidence.

**G. Could the server reject valid requests?** **Yes, two ways**, both returning non-2xx and both
invisible: `404` when no routine exists for `getLogDateString()`, and `400 "Unknown task for
today's routine"` when the task id is absent from that routine — reachable if the plan is
**regenerated** between the modal's fetch and the fan-out, since `daily_routines` is
`UNIQUE (student_id, routine_date)` and is overwritten in place.

**H. Any path where the client believes tasks were marked but never sends them?** **Not found.**
Traced and ruled out at step 4.

**I. Is `.catch(() => {})` the mechanism?** **No — it is the concealment.** The missing `.ok`
check compounds it: HTTP failures are indistinguishable from success at the call site.

**J. Minimum safe fix architecture?** See below.

---

## The one discriminating signal found

Flagged logs cluster tightly around plan generation; healthy ones do not:

| | flagged (no completions) | healthy (has completions) |
|---|---|---|
| Rows | 33 | 99 |
| **Median minutes between routine creation and log** | **4.4** | **135.2** |
| Routine created *after* the log | 3 | 1 |
| Routine more than an hour before | 33% | 56% |

**INTERPRETATION:** failures concentrate in the *first session of the day*, when the plan has
just been generated — the window in which a regeneration or a not-yet-committed routine is most
likely. **CONFIDENCE: Medium.** It is a strong association on 33 rows, not a demonstrated cause.

---

## Confidence summary

| Conclusion | Confidence |
|---|---|
| Credit is durable before evidence is attempted | **High** — read from code |
| `.catch` + missing `.ok` hides every failure | **High** — read from code |
| Client payload construction is sound | **High** — traced |
| 3 rows failed via 404 (routine created after log) | **High** — timestamps |
| Requests are sent | **Medium-High** — inferred from credit arithmetic |
| Failures concentrate near plan generation | **Medium** — association |
| Plan regeneration causes the 400 | **Low** — plausible, unproven |
| Session loss causes some 401s | **Low** — plausible (G8 shows one such student), unproven |

---

## What I would need, and am not building

**The minimum necessary instrumentation — PROPOSED, NOT IMPLEMENTED:**

Record the outcome of each `complete-task` call at the call site — status code and task id — via
the existing `track()` event pipeline. No new table, no schema change, no behaviour change. One
event per failed call would answer question E within days, and questions C and G with it.

This is the smallest thing that converts a 30-row mystery into a named defect. **It requires a
founder ruling** because the instruction was to propose rather than add telemetry.

---

## Recommended G10 remedy

**Do NOT simply move the credit write after the fan-out.** That inverts the inconsistency —
evidence without credit — and is strictly worse, because credit drives the streak and the
student-visible payoff.

**Is a transaction required? YES — or an equivalent single-writer path.**

The defensible architecture, in preference order:

1. **One server-side write.** The log submission already sends `sections` derived from the marked
   tasks. Send the *completions* too, and let the server write `daily_reports` and
   `routine_task_completions` inside the transaction `upsert_log_and_streak` already owns. Credit
   and evidence then cannot diverge, and the client stops being responsible for a two-phase write
   it cannot make atomic.
2. **Fail loudly if 1 is too large.** Keep the fan-out, check `.ok`, and surface a truthful
   partial state to the student — the `dayClosed` / `coverageAdvanceFailed` precedent this route
   already established in G3. This does not fix the inconsistency; it stops it being silent.

**Ordering/atomicity recommendation:** evidence and credit must land in one transaction, with the
evidence as the authority and credit derived from it. Until that holds, any ordering choice is
picking which of two false states to prefer.

**Founder ruling required before G10: YES** — (a) may instrumentation be added first; (b) option
1 or option 2.

---

## Method

Traced from the submit handler outward through the repository, then tested each candidate against
production. Alternatives were ruled out explicitly rather than assumed: empty payloads (ruled out
at step 4), routines without tasks (0 of 33), backdating (1 of 34), the off-plan feature (0), RLS
(admin client). Where stored data cannot answer — the HTTP responses — that is stated as unknown
rather than filled with the most plausible story.
