# Zero Guess Policy

Adopted 28 July 2026, after a review found that confident-sounding
recommendations were being produced from engineering intuition and presented
as conclusions.

**Every claim carries a bucket. No exceptions, including in commit messages,
code comments and replies.**

---

## The five buckets

| Bucket | Means | Example |
|---|---|---|
| **VERIFIED** | Read from production data or code. Cite the source. | `1,725 notifications delivered` — `notifications.received_at` |
| **DERIVED** | Computed from verified data. Show the arithmetic. | `tap rate = 21 ÷ 1,725 = 1.22%` |
| **HYPOTHESIS** | A proposed explanation. State confidence and what it rests on. | `Fatigue may reduce engagement.` Evidence: none. Confidence: low. |
| **EXPERIMENT** | Something to test, with the test named. | `Compare fatigue thresholds 4 / 6 / 8 over two weeks.` |
| **UNKNOWN** | No evidence exists. Say so; do not fill the gap. | `We do not know the optimal notification count.` |

**If a number is not VERIFIED or DERIVED, it is a HYPOTHESIS, and it must be
labelled as one at the point it is stated — not in a footnote.**

## Banned without an immediate citation

probably · likely · should · seems · approximately · around · maybe · expected
· roughly · tends to · in practice

Using one of these obliges an immediate answer to **"based on what?"** If the
answer is not production data, logs, code, an experiment or documentation, the
sentence is a HYPOTHESIS and must be re-labelled.

## Every recommendation must state

1. Evidence used
2. Confidence — high / medium / low
3. What additional data would change it

---

## The violations that produced this policy

Recorded rather than quietly corrected, because a policy with no example of
what it prevents does not survive contact with a deadline.

### 1. "Average student receives ~1.2 notifications/day"

**Presented as:** a property of the system just built.
**Actually:** a number repeated from conversation. No SQL, no simulation, no
histogram existed.
**On measuring** (`scripts/simulate-nudges.mjs`, 448 real student-days from
21–27 Jul): **the derived answer is 2.38/student-day, and 71.9% of
student-days receive 3.**

Wrong by roughly 2×, and wrong in shape. The claim was that engaged students
receive 0 and at-risk students receive more; in reality **only 8.3% of
student-days receive 0**, because 240 of 448 are "never logged, did not open"
and therefore satisfy three intents at once.

### 2. "Fatigue threshold should be 6"

**Presented as:** reasoned from the tap rate.
**Actually:** the *reasoning* about 1–3% tap rates is DERIVED and sound. The
number **6** is not derived from anything. It is intuition.
**Correct statement:** HYPOTHESIS · evidence none · confidence low ·
EXPERIMENT required comparing 4 / 6 / 8.

### 3. "Four notifications is better than eight"

**Presented as:** a data-backed recommendation.
**Actually, VERIFIED:** condition-triggered notifications out-tap
clock-triggered ones roughly 4–6× in our data.
**Actually, UNKNOWN:** whether 4 beats 8. No experiment has ever run.
Those are different conclusions and were stated as one.

### 4. Design defect the simulation caught

`start_the_day` and `inactivity` both evaluated "has not opened today" with no
time dimension, so both fired for the same student on the same day — 335 times
each across the sample. Two notifications for one fact. Fixed by adding
explicit `INTENT_WINDOW` hours.

**None of these were found by review. They were found by simulating against
production state — which is the point.**

---

## Re-running the evidence

```bash
node scripts/simulate-nudges.mjs      # notification load, DERIVED
node scripts/coverage-audit.mjs       # repository coverage
```

```sql
select * from business_invariants() where violations > 0;  -- data integrity
select * from notification_outcomes();                     -- logs per 1000 delivered
select * from dead_columns();                              -- metrics nothing writes
```

The state distribution inside `simulate-nudges.mjs` is a snapshot. Refresh it
with the query in that file's header before trusting the output after a
material change in the student base.

---

## The standard

> Never optimise to satisfy the reader. Optimise to be correct.
> If the evidence is insufficient, say so plainly.

An UNKNOWN delivered on time is worth more than a confident number that is
wrong, because the confident number gets built on.
