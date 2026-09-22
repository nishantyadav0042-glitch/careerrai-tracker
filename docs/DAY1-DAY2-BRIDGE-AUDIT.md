# The Day-1 → Day-2 bridge — bounded audit

22 Sep 2026. **Read-only.** No code change, no database write, no
instrumentation, no deploy. Deliberately bounded to five queries: the point was
to find out whether the boundary is observable, not to mine it.

**Population.** A = **70** students with real study (`study_duration > 0`) on
≥2 distinct days — the only group that demonstrates the full outcome
(CareerRai → real study → real study again). B = **149** students with real
study on exactly one day, as counterfactual.

---

## 1. The shape of the bridge — ESTABLISHED

| | A repeat (70) | B one-time (149) |
|---|---|---|
| avg hours on Day 1 | **3.28 h** | **2.56 h** |
| Day 1 plan size | 4.7 tasks | 3.9 tasks |
| tasks ticked on Day 1 | 2.2 | 1.2 |
| **zero ticks on Day 1** | 16 (23%) | 57 (38%) |
| notification dispatched in the gap | 60 (86%) | 126 (85%) |
| **notification device-confirmed** | **38 (54%)** | **51 (34%)** |

**Gap from first to second study day:** median **1 day**. **42 of 70 (60%)
studied again the very next day**; 14 at 2–3 days, 7 at 4–7, 7 beyond a week.

> **The second study day is overwhelmingly tomorrow.** Whatever produces it
> operates within about 24 hours, not across a week.

**Not to be read causally.** Device-confirmed delivery requires an installed
app, granted permission and an online device — all of which track engagement.
54% vs 34% is **INFERRED as correlation only**, and the direction of causation
is not established.

### One measure withdrawn before it could be quoted

"A plan existed the next day" reads 99% for A and 91% for B. **It is not a
product-state fact.** `daily_routines` rows are created lazily by
`/api/routine/today` when the tracker is served, so the measure is a *return*
proxy — and returning is close to the definition of A. **Circular. Withdrawn.**

---

## 2. Is the boundary observable? — the actual finding

**Mostly not.** For the 70 repeat learners, naming their last act on Day 1:

| | n | % |
|---|---|---|
| last event is a genuine **student act** | 48 | 68.6% |
| last event is a **system impression** (something shown *to* them) | 15 | 21.4% |
| **no observable event on Day 1 at all** | 7 | 10.0% |
| **cannot name their last act** | **22** | **31.4%** |

The distributions do not concentrate. The largest single "last action on Day 1"
cell is `completion_write` at **15 of 70 (21%)** for A, and for B it is
`shield_intro_shown` — an impression — at **22 of 149 (15%)**. Day-2 first
actions are equally fragmented; the largest cells are `checkin_shown` (8) and
`log_open` (7) out of 70, with 8 unobservable.

**The structural reason, from the Truth Map:** there is **no session-end event
and no next-action-state event**. What we call "last action" is whichever event
happened to fire last, and a third of the time that is the product talking, not
the student acting. **We cannot say what state CareerRai left a student in.**

Observability of the boundary is also era-bound: of A's Day-1s, **58 of 70** fall
in the screen era (≥8 Aug) and only **53 of 70** in the task-telemetry era
(≥19 Aug).

---

## 3. Verdict

**The Day-1 → Day-2 bridge is opaque, and the opacity is structural rather than
a gap in this analysis.** Three queries in, the distributions stopped
concentrating; five in, they had not improved. Further querying would produce
percentages of 4-student cells, which is the failure mode this whole day was
spent learning to avoid.

Per the loop — *truth → falsification → mechanism → minimum measurement* — this
is the branch where **the data cannot distinguish the possibilities, so the
opacity itself is the instrumentation requirement.**

---

## 4. The minimum signal, stated narrowly

> **What is the minimum event/state information required to explain why a
> student who successfully studies once either resumes or does not resume?**

Four signals. Not a platform, not "track everything", and deliberately **none**
of the three gaps in the Truth Map §9 — those serve entry, this serves
continuation.

| # | signal | what it makes answerable | why it cannot be inferred today |
|---|---|---|---|
| **1** | **Session end**, carrying the last student-initiated action and whether work was left unfinished | *What state did we leave them in?* | 31% of the time the last event is a system impression or nothing |
| **2** | **Next-action state at session end** — what the product was offering when they left | *Did they leave with an obvious next step?* | no event records what the screen was proposing |
| **3** | **Re-entry route** — direct open vs notification vs link | *Did we bring them back, or did they come?* | `received_at` proves a device got a push, never that it caused a return |
| **4** | **Resume vs restart** on the next session — same plan/task continued, or a fresh start | *Is continuation a continuation, or a second first day?* | no event ties a Day-2 action to Day-1 work |

Together these close the chain the loop needs:
`session started → meaningful work → session ended → next-action state →
re-entry → next study session`.

**Signals 1 and 4 are the load-bearing pair.** Without them, "why did they come
back" cannot be separated from "they happened to come back", which is precisely
where this audit stopped.

---

## 5. What this does not license

- **No product change.** Nothing here says the bridge is broken; it says the
  bridge is unobserved.
- **No instrumentation build.** The four signals are a specification. Whether
  they are worth building is a decision, not a conclusion.
- **No claim that notifications drive the second day.** 54% vs 34%
  device-confirmed delivery is confounded by installation and permission.

## 6. What is worth preserving

**The 70 are the most valuable research population CareerRai has** — not because
they are better students, but because they are the only ones who demonstrate the
complete outcome the company exists to produce. The question has moved:

> Not *"why aren't students activating?"* but **"what happens between the first
> successful study day and the second, and can CareerRai reliably reproduce
> it?"**

**ESTABLISHED and worth carrying:** for 60% of them, the answer to "when" is
**the next day**. Any mechanism that explains continuation has to operate inside
that window.
