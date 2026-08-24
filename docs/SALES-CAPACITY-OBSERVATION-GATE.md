# Production Capacity Observation Gate

**24 Aug 2026 · READ ONLY. No ownership, assignment, or configuration was
written.** Run against real production data using the **canonical**
`classifyLane` and `classifyWorkItem` — no lane logic was re-implemented for
this analysis.

---

## 0. The gate could not run as specified — and why that matters

The founder's instruction was: *"For the configured reps, show the actual
students counted as ACTIVE, DORMANT, and URGENT REACTIVATION."*

**FACT (production, verified):** `sales_rep_config` = 0 rows,
`lead_outreach` = **0 rows ever created**, `sales_activity` = **0 rows ever
recorded**. No rep is configured, no lead has ever been claimed, and no sales
call has ever been logged in this system. There are no owned students to
classify, so the gate as written has an empty input.

Rather than report an empty table, I ran the **business question underneath
it** — *does ACTIVE correspond to work a rep can realistically handle?* —
against the 466 real students who are eligible to become leads
(`sales_ready`, free, not test, with a callable phone).

---

## 1. What the model says about 466 real students

**Lane distribution today:**

| Lane | Students | Share |
|---|---|---|
| fresh | 307 | 65.9% |
| conversion (buddy intent) | 97 | 20.8% |
| new, never logged | 56 | 12.0% |
| broken streak | 5 | 1.1% |
| going cold | 1 | 0.2% |

**Scenario A — day one** (every assigned student is `not_contacted`):
**466 ACTIVE, 100%.** A1 fires for everyone; nobody is dormant yet. Dormancy
is *earned* by being worked, not a starting state.

**Scenario B — steady state** (each student contacted once, nothing due, no
overdue promise — the only thing that can make them active is a genuine
retention need):

| | Students | Share |
|---|---|---|
| **ACTIVE** (all via retention lane) | **62** | **13.3%** |
| **DORMANT** (owned, free capacity) | **404** | **86.7%** |

**The working-set model does what it was designed to do.** 86.7% of a worked
book consumes no capacity. The Phase 2A failure mode — a rep locked out by
their own success — does not occur.

## 2. Manual inspection: does every ACTIVE student genuinely need attention?

Every one of the 62 was sampled by category. Representative cases, verbatim
from the classifier:

- **27-day streak ended yesterday** (signed up 30d ago, logged days 1–8 of the
  window, 2 buddy taps) → *"The habit is still warm — this is the win-back
  window."* Unambiguously needs a call today.
- **6-day streak ended 2 days ago** (signed up 7d ago) → same.
- **Studied 5 of the previous 7 days → 0 in the last 3** (signed up 43d ago,
  last study 3 days ago) → the founder's own worked example, occurring in real
  data.
- **Joined 5 days ago, no first study log** → the activation call.

**Verdict: yes.** No student consuming capacity is doing so spuriously.

And the reverse check — students correctly **not** consuming capacity: a
student who signed up 34 days ago, logged once 10 days ago, tapped buddy once
→ **dormant**. Real but non-urgent; correctly not occupying a slot.

---

## 3. Three findings that change how capacity should be read

### F1 — The retention lanes barely fire. The real problem is ACTIVATION, not retention.

**Only 6 of 466 students (1.3%)** are in a retention lane (going cold +
broken streak). **65.9% are `fresh`** — they logged once or twice, long ago,
and never built a rhythm.

The going-cold lane detects *"had a habit and lost it."* At CareerRai's
current activation rate, almost nobody has a habit to lose. **The dominant
population is students who never got going at all**, and the lane system
correctly declines to call them a retention case — but that means the
retention-first queue is optimised for a problem the data says is currently
small.

This does **not** invalidate the design (the 6 students it finds are exactly
the right 6, and the number will grow as activation improves). It does mean
the founder should expect the queue to be dominated by activation and
first-contact work for the foreseeable future.

### F2 — In steady state, capacity will be driven by rep-scheduled follow-ups, not by the system.

Since A4 (system-detected retention) fires for ~1% of students, almost all
recurring work in a worked book will come from **A2/A3 — the rep's own
callbacks and follow-up promises**.

**So `max_capacity_units` in practice means: "how many open follow-ups and
uncontacted leads can this rep carry at once."** That is a far more concrete
thing to set a number for than "active students", and the founder should
choose the numbers with that meaning in mind.

### F3 — The pool is 6.7× the entire team's capacity, and grows faster than two reps can absorb it.

466 eligible students today. At illustrative ceilings (FT 50 + PT 20 = **70
active units**), **396 eligible students cannot be assigned at all** on day
one — and roughly **49 new students sign up per day**.

**INFERENCE, stated plainly:** with two reps, most students will never be
contacted by a human, ever. That is not a flaw in the capacity model — the
model is *correctly reporting a real constraint*. But it means capacity
tuning is not the lever the founder thinks it is: **the binding constraint is
headcount versus inflow, and the important decision is which students the two
reps spend their limited attention on.** The lane ordering already answers
that, which is the strongest argument for keeping retention-first ordering
even while retention cases are rare — it is what decides who wins the scarce
slots.

---

## 4. One open question for the founder (a genuine design decision, not a bug)

A student who is contacted once, never logs, and passes day 7 leaves the
`new_never_logged` lane, becomes `fresh`, and — once their follow-up cadence
is discharged — goes **dormant permanently**. No lane will ever resurface
them.

That is **404 students** in steady state. Two readings, both defensible:

- **Correct:** we contacted them, they did not engage; calling repeatedly is
  pressure, and MISSION.md forbids a fear/urgency machine.
- **A gap:** the single largest population silently leaves the operating
  picture, and Job #1 is getting students to use CareerRai.

**Recommendation:** leave it as-is for now (do not add a lane), and revisit
after the reps have real contact history. Adding a "contacted but still never
activated" lane before we know whether the first contact works would be
building on an assumption. **Founder decision, not an engineering one.**

---

## 5. Verdict on the model

| Question | Answer |
|---|---|
| Does ACTIVE correspond to genuine work? | **Yes** — every one of the 62 inspected needs attention |
| Do healthy students free capacity? | **Yes** — 86.7% dormant in steady state |
| Do cumulative flags eat capacity forever? | **No** — conversion-lane students correctly go dormant |
| Is the model ready for automation? | **The model is. The evidence is not** — see §6 |

## 6. My recommendation on 2B-2

**Do not approve automatic assignment yet — but not because of the model.**

The model behaves correctly. What is missing is that **no rep has ever used
this system**: zero leads, zero calls, zero dispositions. Every number in §1
is a *simulation over real students*, not observed operator behaviour. In
particular, F2 says steady-state capacity will be dominated by rep-scheduled
follow-ups — and we have **no evidence at all** about how many follow-ups a
CareerRai rep actually schedules or completes per day, because no rep has ever
scheduled one.

**Setting `max_capacity_units` today is a guess.** It should be, initially —
but the guess should be *observed and corrected* before a machine starts
distributing students against it.

**The sequence I would follow:**
1. Configure both reps with conservative numbers.
2. Let them work the shared pool manually for **one to two weeks**.
3. Re-run this gate against *real* owned leads and *real* activity.
4. Compare: is `active_now` tracking what they can actually handle in a day?
5. Then approve 2B-2 with numbers grounded in evidence rather than intuition.

That costs one to two weeks and removes the largest remaining unknown in the
entire design.

**Status: gate complete. No writes performed. 2B-2 not recommended until real
operator data exists.**
