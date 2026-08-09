# The Scale Contract — grow to 100,000 without failing today's student

> **One sentence to remember:** We are not building a 100,000-student system
> today. We are building **today's correct system with a 100,000-student path.**
> The student in front of us today matters just as much as the hypothetical
> student at 100,000. Do not sacrifice today's students for tomorrow's scale.

This is a binding co-founder rule (Nishant, 9 Aug 2026), recorded because it
governs every architectural decision in the CareerRai OS. Read it before any
change to an operator surface (People / Revenue / Mentor / System / Inbox /
360s) or any "scale" optimization.

---

## 1. Two questions, every time

Every architectural decision must answer BOTH:

1. Does this work correctly for the students using CareerRai **today**?
2. Will this architecture keep working at **100,000** students?

If either answer is NO, the work is incomplete.

## 2. Priority order — student correctness first

- **P0 — Student / customer correctness.** Payment, premium activation, study
  plan, coaching plan, OCR, buddy assignment, mentor sessions, notifications,
  login/onboarding, data integrity, messages, uploads, subscription access.
- **P1 — Founder operational visibility.** Founder Inbox, People filters,
  Revenue Ops, Mentor Ops, System Health.
- **P2 — Scale optimization.** Automation, aggregation, capacity management,
  anomaly detection, large-scale analytics.

A beautiful admin panel is worthless if a student paid ₹2,999 and cannot access
what they purchased. Premium students get extra protection at every scale:
captured-not-unlocked, premium-without-buddy, and paid-session-mentor-absent are
never allowed to disappear inside an aggregate.

## 3. The scale ladder — what the operator needs at each stage

| Scale     | What the founder needs             |
| --------- | ---------------------------------- |
| 1         | Know everything                    |
| 10        | Know most things                   |
| 100       | Filter                             |
| 1,000     | Prioritize (P0–P3)                 |
| 10,000    | Automate + prioritize              |
| 100,000   | Exceptions only + automation       |

Every stage matters. Do **not** optimize only for 100,000. Correctness → perf at
current scale → 1k → 5k → 10k → then optimize for 100k. Never fix a
100,000-student problem by breaking 1,000 students (a query "optimized" into
slower profiles, wrong counts, or missing students is not an optimization).

## 4. The drill-down mandate (non-negotiable)

Every aggregation, cache, batch, queue, summary, anomaly, metric, or exception
MUST preserve the answer to: **"which exact students caused this?"**

- "12 students need buddies" → open those exact 12.
- "87 OCR failures" → the exact 87.
- "1,240 going cold" → the exact filter, priority-ranked, each to a Student 360.

A count that cannot be drilled into is a chart, and this system does not do
charts. Count == list, always: the number shown must be computed by the same
predicate the destination filter applies. (Guard: `dead-doors.test.ts` proves
every link resolves; the People-filter derivations are kept identical to the
sources the counts come from.)

## 5. The Exception Contract — one primitive, not four dashboards

Every operational domain produces the SAME shape (`src/lib/os/exception.ts`):

```
Exception
├── entity            (who/what)
├── code              (machine signature — groups into incidents)
├── severity          (critical / high / normal — one scale, all domains)
├── reason            (the human "so what")
├── detectedAt        (evidence, never invented)
├── evidence          (the facts: amounts, counts, timestamps)
├── suggestedAction   (the one action + route)
├── recovery          (attempted? status: none/attempted/failed/succeeded)
├── owner             (founder / mentor / sales / system)
└── destination       (REQUIRED drill-down to the exact records)
```

- **People** produces student exceptions. **Revenue** money exceptions.
  **Mentor** mentor/session exceptions. **System** system exceptions. The
  **Founder Inbox** is their union — the aggregation layer, not another data
  source.
- **Aggregation is presentation-only.** `aggregate()` rolls N identical
  exceptions into one incident while keeping every member for drill-down;
  `shouldAggregate(count, threshold)` decides when. Below threshold: show the
  individuals. Above: one incident, one click to the exact affected set.
  Threshold lives in `scale-config.ts`, tunable by business, never in the UI.
- **Lifecycle** (detected → auto_recovery → escalated → assigned → acknowledged
  → resolved → verified) is on the contract so a persistence layer can be added
  later without changing what producers emit — it stops the same problem
  re-appearing tomorrow as if new.

## 6. Don't prematurely build for 100,000

Before adding queues, distributed processing, complex caching, sharding, event
infrastructure, or anomaly engines, ask: **"what is the actual measured
bottleneck today?"** Build the simplest architecture that works today, has a
clear scaling path, and does not force a future rewrite. The Exception Contract
is the path — it is zero-infra (a type + a pure function); the infra slots onto
it only when a domain genuinely floods.

## 7. Business thresholds are config, not UI

The mentor overload line, buddy SLA, self-heal window, lookback windows, and the
aggregation threshold live in `src/lib/os/scale-config.ts`. When capacity must
vary by mentor type, tier, or live load, that one file grows a lookup and no page
changes.

## 8. Student-experience health ≠ backend health

A green backend does not mean a green CareerRai. The OS must be able to answer:
can students sign up, build a correct plan, map a coaching timetable, run OCR,
submit logs, receive notifications, message, upload, complete payments, unlock
premium, get a buddy, and hold a session? System Health today watches business
invariants + the sacred guard; it must never fabricate a signal it cannot
measure (e.g. cron freshness while no cron-run table exists) — it says
"observability unavailable" or shows nothing, never a false green.

## 9. Every meaningful feature records a scale contract

Correctness (one student) → current scale → 1k → 5k → 10k → 100k ceiling. This is
not "load-test everything to 100k today"; it is "know where the architecture will
bend."

## 10. The 9 AM test

At 100,000 students, opening CareerRai Admin should read:

> "23 things require attention. 4 critical, 8 revenue opportunities, 6 retention
> issues, 5 system issues. Everything else is healthy and automated."

Not: "100,000 students, 18 dashboards, 42 filters, 600 alerts."

**Don't scale the number of things the founder sees. Scale the intelligence that
decides what the founder doesn't need to see.**
