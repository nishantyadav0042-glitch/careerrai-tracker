# The Canonical Error System — architecture

**Status:** ARCHITECTURE ONLY. No implementation, no schema created, nothing
deployed. 23 Aug 2026 · `main` @ `a6cb0d7`.

> **⚠ SUPERSEDED IN PART.** Sections C and G below describe an `after()`-based
> alert path. **That design was wrong and is replaced by the RED TEAM / SCALE
> REVIEW at the end of this document.** `after()` is an execution opportunity,
> not a durable queue: DB write succeeds → process dies → alert never happens.
> The original text is left in place so the correction is legible rather than
> quietly rewritten.

It answers one question:

> If any student experiences any error anywhere in CareerRai, how does that
> error become **one** canonical, auditable event and reach the founder within
> **5 seconds**, without contradictory states, duplicate alerts, or exposing
> sensitive data?

---

# A. CURRENT STATE

## A.1 — Six competing error systems

| # | System | File | Adoption | Reaches founder? |
|---|---|---|---|---|
| 1 | API error responder | `src/lib/api-error.ts` | **15** call sites | no |
| 2 | Handled-client reporter | `src/lib/report-error.ts` | **1** call site | no |
| 3 | Uncaught-client reporter | `crash-reporter.tsx` → `/api/client-error` → `client_errors` | global | **no — nothing alerts on this table** |
| 4 | Server exception hook | `src/instrumentation.ts` → `security_events` | global for *thrown* errors | only via hourly cron, threshold ≥25 |
| 5 | Security audit log | `src/lib/security-log.ts` | 8 call sites | same hourly cron |
| 6 | Raw `console.error` | everywhere | **235** call sites | **no** |

Plus **three unrelated founder paths**: `sendSecurityAlert` (webhook, 4 sites),
`sendAdminAlert` (Resend email, 7 sites, all digests), and the hourly
`/api/admin/security-monitor`.

## A.2 — Four error shapes

`{ error }` ×670 · `{ ok }` ×163 · `{ message }` ×11 · `{ success }` ×9

`api-error.ts` exists to unify these and is used **15 times against 670**.

## A.3 — Severity is contradictory *in type*, not merely in usage

`security-log.ts` declares:

```ts
export type SecuritySeverity = 'info' | 'warning' | 'critical';
```

The codebase uses **six** values. `'error'` (`api/routine/today`) and
`'high'`/`'normal'` (`lib/os/founder-inbox.ts`) are **not members of that
union** — they belong to a second, undeclared severity vocabulary on a
different surface. So there is no single severity scale, and one of the two is
not typed at all.

## A.4 — The five-second requirement today

| Path | Latency | One student? |
|---|---|---|
| Server *thrown* → `security_events` → hourly monitor (`0 * * * *`), fires at ≥25/hr | **≤3,600 s** | **never** |
| Server *handled* (`{ error }` returned) | **never captured** | never |
| Client uncaught → `client_errors` | **never alerted** | never |
| Client handled → `report-error.ts` | 1 call site | never |

**No path today can alert on a single student's failure at all.**

---

# B. DUPLICATE / CONFLICTING SYSTEMS — the drift mechanism

The systems are not redundant; they are *disjoint*. Each covers a slice no
other covers, and none covers handled server errors — which is the largest
class, because 670 routes return `{ error }` rather than throwing.

**A thrown error is observed. A returned error is invisible.** That inversion
is the single biggest gap: the better-behaved the route, the less we see.

---

# C. CANONICAL TARGET ARCHITECTURE

```
     any failure, anywhere
              │
              ▼
      captureError(ctx)          ← THE ONLY primitive
              │
   ┌──────────┼───────────────────────────┐
   │ 1 classify → code + severity          │
   │ 2 attach correlation (request_id …)   │
   │ 3 split user_safe / internal message  │
   │ 4 compute incident_key                │
   └──────────┬───────────────────────────┘
              │
              ▼
   T1  durable INSERT  (BEFORE the response is sent)
              │
              ▼
        after()  ← already used in src/lib/auth.ts:2
              │
              ▼
   T2  dispatcher: first event for this incident_key?
              │            yes → alert        no → increment, stay silent
              ▼
        webhook (alerting.ts) → fallback: Resend (email.ts)
              │
              ▼
   T3  founder notified
```

**One primitive. One event. One incident. One alert.**

Application code never decides severity, shape, alert-worthiness, or whether to
swallow. It supplies *context*; the system decides everything else.

---

# D. ERROR TAXONOMY

**Severity — four values, replacing the current six-plus-untyped:**

| | Meaning | Alerts immediately? |
|---|---|---|
| `P0` | student blocked · money · security · data integrity | **yes** |
| `P1` | major student-facing failure, workaround exists | **yes** |
| `P2` | degraded, non-blocking | aggregated |
| `P3` | diagnostic | stored only |

**Category** — derived from the *actual* surfaces in this app, not a generic
list: `AUTH`, `OTP`, `ONBOARDING`, `PROFILE`, `TIMETABLE`, `PLAN`, `DAILY_LOG`,
`BUDDY`, `MENTOR_SESSION`, `CHAT`, `PAYMENT`, `SUBSCRIPTION`, `WEBHOOK`,
`NOTIFICATION`, `EMAIL`, `WHATSAPP`, `DATABASE`, `EXTERNAL_API`, `CRON`,
`CLIENT`, `SERVER`.

`SIGNUP` and `LOGIN` are **not** separate categories — both are `AUTH` with a
distinct `operation`. Splitting them would create two places to ask one
question, which is the failure this document exists to end.

---

# E. EVENT CONTRACT

Every field earns its place; nothing speculative.

| Field | Why it exists |
|---|---|
| `event_id` | idempotency key — retries cannot duplicate |
| `incident_key` | `hash(category, error_code, route, deploy_id)` — groups 500 events into 1 alert |
| `occurred_at` / `ingested_at` | the two halves of the SLA; both stored so latency is measured, not assumed |
| `severity`, `category`, `error_code` | canonical classification |
| `operation` | e.g. `create_checkout` — what the student was trying to do |
| `route` | where it failed |
| `student_id` | who — **UUID only, never a name** |
| `request_id` / `correlation_id` | ties client report to server error to DB row |
| `deploy_id` | which build (already extractable — `client-error-meta.ts`) |
| `user_safe_message` | what the student sees |
| `internal_message` + `stack` | what the founder sees. **Separate fields, never the same string** |
| `retryable` | can the student just try again? |
| `student_impact` | `blocked` / `degraded` / `none` |
| `mutation_attempted` | was student state changed before the failure? |
| `money_involved` | gates the P0 rule |

**Deliberately excluded:** raw request bodies, tokens, payment credentials,
names, emails, phone numbers. The repo is public and the alert channel is not.

## HTTP mapping — one table, no per-route invention

| Severity / kind | Status |
|---|---|
| validation | 400 |
| auth required / failed | 401 / 403 |
| not found | 404 |
| rate limited | 429 |
| **source unavailable** | **503** (matches the 9 migrated crons) |
| internal | 500 |

Response shape, one only:

```
{ ok: false, error: { code, message, request_id, retryable } }
```

`message` is always `user_safe_message`. The internal message never crosses
this boundary.

---

# F. FOUNDER ALERT PIPELINE

Primary: webhook (`alerting.ts` pattern). Fallback: Resend (`email.ts`).
Both already exist; **no new provider is introduced.**

One formatter. No cron-specific formats.

---

# G. THE 5-SECOND LATENCY MODEL — and where it breaks

| Segment | Budget | Basis |
|---|---|---|
| classify + build event | ~5 ms | pure |
| **T1** durable INSERT | 30–80 ms | measured shape of existing inserts |
| **T2** dispatch decision | ~10 ms | one indexed lookup |
| **T3** webhook POST | 150–400 ms | `sendSecurityAlert` today |
| cold start (worst case) | +200–900 ms | Vercel |
| **Total** | **0.3 – 1.5 s** | |

**Comfortably inside 5 s — for server-originated errors.**

## The hard limitations, stated rather than hidden

1. **A browser on a bad network cannot be made to meet 5 s.** If a student in
   a low-signal area takes 9 s to POST `/api/client-error`, no architecture
   fixes that. **Both timings are stored** (`occurred_at` from the browser,
   `ingested_at` server-side) so the network-bound portion is visible rather
   than absorbed into a passing number.
2. **`after()` runs post-response but inside the invocation.** If the platform
   kills the container early, the *alert* is lost — which is why the **durable
   INSERT happens before the response**, never in `after()`. A lost alert is
   recoverable from the table; a lost event is not.
3. **`SECURITY_ALERT_WEBHOOK_URL` is unset in some environments.**
   `sendSecurityAlert` then no-ops to `console.warn`. **If it is unset in
   production, this entire pipeline has no destination.** No code fixes that —
   it is a configuration fact and it is ruling #1.
4. **Vercel cron cannot participate.** Floor is 1 minute; the current monitor
   is hourly. The design uses it only as a **sweeper** for events whose alert
   never dispatched — a safety net, never the path.

---

# H. DEDUPLICATION

```
ErrorEvent (many) ──group by incident_key──► Incident (one)
```

Alert on the **first** P0/P1 event per `incident_key`; later events increment
`event_count` and `affected_students` without a second alert. 500 students, one
provider timeout ⇒ **1 alert, 500 preserved events**.

`event_id` is the idempotency key: a retried capture is a no-op.

**Client + server double-capture** of one failure is correlated by
`correlation_id` and collapses into one incident.

---

# I. WHEN THE ERROR SYSTEM ITSELF FAILS

The reliability hierarchy, honestly graded:

| Failure | Behaviour | Guarantee |
|---|---|---|
| Supabase unavailable | INSERT fails → alert attempted **anyway**, carrying "event not persisted" | **best-effort** |
| INSERT fails | never blocks the student's request | **guaranteed** |
| Webhook fails | retry ×2 (backoff) → Resend fallback | **best-effort** |
| Email also fails | event stays in the table, marked `alert_failed`; sweeper retries | **guaranteed durable, not guaranteed timely** |
| `after()` never runs | event persisted; sweeper catches it | **guaranteed eventually** |
| Duplicate event | `event_id` idempotency | **guaranteed** |
| Alerting itself throws | wrapped; can never break the request | **guaranteed** |

**What is genuinely guaranteed:** a student-facing failure is *durably
recorded* and *never silently lost*.
**What is not:** delivery inside 5 s when both channels are down, or when the
student's network is the bottleneck.

**"At any cost" is therefore delivered as: no silent loss, strongest achievable
timeliness — not as a mathematical 5-second guarantee, which this
infrastructure cannot make.** Saying otherwise would be the same class of
falsehood this whole workstream exists to remove.

---

# J. MIGRATION PLAN

| Phase | Content | Risk |
|---|---|---|
| 2 | Contract + code registry + severity enum — **pure, no I/O** | none |
| 3 | `captureError()` + durable ingestion | needs DDL ruling |
| 4 | Dispatcher + dedup + retry + fallback | none |
| 5 | AUTH / OTP / ONBOARDING | behaviour-preserving |
| 6 | PAYMENT / WEBHOOK | highest care |
| 7 | Student product flows | |
| 8 | Crons — **including the 4 frozen B3b paths** | |
| 9 | Client global capture | latency measurement |
| 10 | Static guards + failure matrix | |

**Phase 2 is implementable today with no DDL and no behaviour change.**
Phase 3 stops at the schema ruling.

---

# K. TESTS REQUIRED

All 15 of your listed proofs, plus the guard: **CI fails if a new competing
error shape or a bypass of `captureError` appears in a student-facing or
mutation-capable path.** Modelled on `population-read.guard.test.ts` — pins the
*idea* (a route that can fail must route through the primitive), with a
shrinking allowlist, not a naive grep.

---

# L. THE FOUR FROZEN B3b PATHS — classified

| Path | Class | Reason |
|---|---|---|
| `expire-subscriptions` | **C — payment/CRM semantics** | Expiry is a *money state transition*. A failed read must not expire anyone; but neither should a 503 leave a paid student expired. Needs its own gate |
| `sales-ready` | **A — canonical, unchanged** | Writes CRM state only. No student-facing side effect |
| `founder-alerts` | **D — needs a ruling** | It **is** a founder-alert path. Once the canonical dispatcher exists, this job either becomes a consumer of it or is retired. Migrating it before the dispatcher exists would entrench a second alert system |
| `expedify-followups` | **A — canonical, unchanged** | Outbound follow-ups, CRM-scoped |

`founder-alerts` is the reason freezing them was right: it would have been
migrated into the very duplication this architecture removes.

---

# M. REQUIRED RULINGS

1. **`SECURITY_ALERT_WEBHOOK_URL` in production** — set or unset? If unset, the
   5-second path has no destination and Phases 3–10 build a pipeline into
   `console.warn`.
2. **DDL authorisation.** Phase 3 needs `error_events` + `incidents`. Existing
   tables cannot carry it: `client_errors` is client-scoped by name and
   consumers, `security_events` has a 3-value severity type and no incident
   grouping. **Exact schema, indexes, retention and rollback will be presented
   as a separate document before anything is created.**
3. **P0 at 03:00 IST** — wake you, or hold to the digest?
4. **Client T0.** Report browser-origin latency separately (recommended) or
   define the SLA from ingestion only?
5. **`founder-alerts`** — becomes a consumer of the canonical dispatcher, or is
   retired?

---

# SUMMARY

| | Now | Target |
|---|---|---|
| Competing error systems | **6** | 1 |
| Error response shapes | **4** | 1 |
| Founder-alert paths | **3** | 1 |
| Severity vocabularies | **2** (3-value type + undeclared 6) | 1 (4 values) |
| Error code registry | **0** | 1 |
| Single-student P0 alert | **impossible** | ≤1.5 s server-side |
| Handled server errors captured | **0 of ~670** | all |

---
---

# RED TEAM / SCALE REVIEW

**Added 23 Aug 2026 after founder review. This section supersedes C and G.**

## 0. The flaw in my own architecture

I built the alert path on `after()`. That is wrong, and the founder named it
before I did.

```
DB INSERT succeeds  →  process dies  →  after() never runs  →  alert lost
```

`after()` is an **execution opportunity**, not durable messaging. Vercel makes
no guarantee it runs — not on container kill, not on OOM, not on deploy
rollover. A design whose alert delivery depends on it has a silent-loss path,
which is the exact defect this whole workstream exists to remove. I reproduced
the bug I was hired to fix, one layer up.

**The correction is a hard separation:**

> **Event durability ≠ alert delivery.**

```
Student failure
   → Canonical Error Event
   → DURABLE EVENT            (committed, synchronously, before the response)
   → INCIDENT FINGERPRINT     (atomic upsert; decides "is this new?")
   → ALERT DELIVERY STATE     (a state machine in the database)
   → Founder
```

`after()` survives only as the **fast path** that attempts delivery
immediately. It is never the thing that *guarantees* delivery. The guarantee
comes from the delivery state machine plus a sweeper.

## A. EVENT VOLUME — modelled, with assumptions stated

Assumptions: 30% DAU, ~20 requests per active student per day, 0.5% baseline
error rate. These are estimates, not measurements — the real numbers arrive
once ingestion is live, and this model should be re-run then.

| Students | Requests/day | Baseline events/day | Broken-deploy storm (10 min) | Full-day outage |
|---|---|---|---|---|
| 740 | ~4,400 | ~22 | ~30 | ~4,400 |
| 10,000 | ~60,000 | ~300 | ~420 | ~60,000 |
| 100,000 | ~600,000 | ~3,000 | ~4,200 | ~600,000 |
| 1M events/day | — | — | — | the stated ceiling |

**One root cause ≠ one event.** A broken `/api/plan/full` at 100k students is
one incident and up to 600,000 observations. The three objects are distinct and
must never be conflated:

| Object | Cardinality | Retention | Purpose |
|---|---|---|---|
| **error_event** | up to 10⁶/day | short | forensic detail, affected-student counting |
| **incident** | 10¹–10²/day | long | the operational object a human reasons about |
| **alert_delivery** | ≤ a handful per incident | medium | proof the founder was actually told |

**The storage insight that makes 100M rows survivable:** the stack trace and
the internal message live on the **incident**, as one exemplar — not on every
event. 600,000 events referencing one incident cost ~120 bytes each, not ~2 KB.
That is the difference between 1.2 GB/day and 20 GB/day.

**Sampling.** P0/P1 events are stored in full, always — they are rare by
definition. P2/P3 events above a per-incident threshold (proposal: 1,000/hour)
are **counted but not individually stored**. The count stays exact; the rows do
not. Without this, a single P3 loop can fill the database, and a full disk is
itself a P0.

## B. INCIDENT FINGERPRINT

```
incident_key = sha256(environment, category, error_code, route_pattern, deploy_id)
```

| Dimension | In? | Why |
|---|---|---|
| `environment` | ✅ | preview noise must never page |
| `category` + `error_code` | ✅ | the canonical identity of the failure |
| `route_pattern` | ✅ | `/student/[id]/plan`, **never** the raw URL — raw paths make cardinality unbounded |
| `deploy_id` | ✅ | founder ruling: "same error tomorrow after a deployment = potentially a NEW incident". It also answers "did this start after deploy X?" without a query |
| **stack signature** | ❌ | line numbers change on every build; cardinality explodes and the same bug fragments into hundreds of incidents |
| `student_id` | ❌ | that is what makes 10,000 alerts |

**Named trade-off:** including `deploy_id` means a rolling deploy *during* an
incident splits it into two. I accept that — a version boundary is exactly
where a human wants the split — but it is a real cost and is stated, not hidden.

## C. THREE LEVELS OF DEDUPLICATION — none in memory

| Level | Mechanism | Scope |
|---|---|---|
| 1 · event idempotency | `UNIQUE (event_id)`; client generates a UUID per capture | retries, double-submit |
| 2 · incident grouping | `UNIQUE (incident_key)` + atomic upsert | 600k events → 1 incident |
| 3 · alert suppression | delivery state machine + cooldown, in the DB | 1 incident → controlled alerts |

**No in-memory Sets anywhere.** They vanish on cold start and differ per
instance, so they cannot deduplicate across a serverless fleet. (`report-error.ts`
uses one today for client-side throttling — acceptable there because it is
per-browser-session and best-effort, but it must not be the model for this.)

**Client + server correlation.** One request carries one `request_id`
(generated server-side, returned in the error envelope, echoed by the browser
reporter). Two observations sharing a `request_id` are **one root cause**: the
server event owns the incident, the client event attaches to it. Without this,
every failed request that also renders an error box becomes two incidents.

## D. ALERT POLICY — what actually reaches the founder

| Trigger | Alert? |
|---|---|
| Incident **opens** (first P0/P1 observation) | ✅ immediately |
| Escalation crossing 10 / 100 / 1,000 affected students | ✅ one update per threshold |
| Every subsequent observation | ❌ never |
| Severity escalates P1 → P0 | ✅ |
| Incident **recovers** (no observation for 10 min) | ✅ one recovery notice |
| P2 | aggregated into the existing daily digest |
| P3 | stored only |

Founder ruling applied: **a P0 wakes you at 03:00.** P1 also alerts
immediately; P2/P3 never do.

**P0 bypasses cooldown, never deduplication.** 500 students hitting one
provider timeout is one incident with one open alert and threshold updates —
not 500 pages.

## E. EXPECTED vs UNEXPECTED — the ruling that makes this survivable

This is the difference between an alerting system and a nuisance.

| Class | Examples | Alert? |
|---|---|---|
| **EXPECTED** (business outcome) | wrong OTP, wrong password, validation failure, student cancels payment, no timetable uploaded yet, mentor unavailable | **never** — recorded as observations only |
| **UNEXPECTED** (system failure) | timeout, 500, provider outage, `Source` UNAVAILABLE, invariant violation, corrupted state | **per severity** |

A wrong OTP is a **student action**, not a system failure. It must be
*observable* — a spike in wrong-OTP rate is a real signal, and it is detected
on the **rate**, never per event — but it must never page.

Without this line, "every error reaches me" becomes an unreadable feed within a
week, and an unread alert channel is functionally the same as no alert channel.

## F. DELIVERY STATE MACHINE — the crash-safety answer

```
pending ──claim──► dispatching ──ok──► delivered
                        │
                        └──fail──► retrying(n) ──exhausted──► dead_letter
```

**Claim is atomic, so concurrent instances cannot double-send:**

```sql
UPDATE incidents
   SET alert_state = 'dispatching', claimed_at = now(), claimed_by = $1
 WHERE incident_key = $2 AND alert_state = 'pending'
```

Zero rows updated ⇒ another instance owns it ⇒ this one does nothing.

**Crash between write and alert** → state stays `pending` → the sweeper claims
it. **Crash between alert and state update** → state is `dispatching` with a
stale `claimed_at` → reclaimed after a timeout.

That second case is genuinely ambiguous: we cannot know whether the webhook
POST landed. **Explicit policy, chosen rather than defaulted:**

- **P0/P1 → re-attempt.** A duplicate page is cheap; a missed P0 is not.
- **P2/P3 → do not re-attempt.** Not worth the noise.

Webhooks have no idempotency key, so no amount of engineering removes this
ambiguity. Choosing which way to fail is the honest response.

## G. FAILURE HIERARCHY — what is guaranteed, what is not

| Failure | Behaviour | Guarantee |
|---|---|---|
| INSERT fails | attempt the alert anyway, flagged `unpersisted`; never block the student | **best-effort** |
| Process dies before dispatch | state `pending` → sweeper | **guaranteed eventually, NOT within 5 s** |
| Webhook fails | 2 retries with backoff → Resend fallback | best-effort |
| Both channels fail | `dead_letter`, visible in the daily digest | **durable, not timely** |
| Duplicate event | `UNIQUE (event_id)` | **guaranteed** |
| Alerting throws | wrapped; cannot break the request | **guaranteed** |
| **Supabase wholly down** | **the event store IS Supabase — see below** | **NOT guaranteed** |

**The recursive-dependency problem, stated plainly.** If Supabase is down, the
error store is down, and the thing that must be reported is the thing that
cannot be recorded. There is no way to durably record a database outage in that
same database.

The mitigation is *narrow and honest*: on INSERT failure the dispatcher fires
the webhook **directly**, carrying "event not persisted". That is a
best-effort, unpersisted, non-deduplicated alert — precisely the properties this
architecture otherwise forbids — and it exists solely so a total DB outage is
not silent. It protects against exactly one failure, retains nothing, retries
nothing, and is the only place in the design where those weaknesses are
accepted. **Building a second durable store to cover this would be adding a
system to avoid admitting a limitation.**

## H. SCHEMA — three tables, and one rejected

**DDL is NOT authorised. Nothing below is created.**

| Table | Justification |
|---|---|
| `error_events` | high-volume observations; forensic detail; affected-student counting |
| `incidents` | the operational object; holds the exemplar stack, state machine, counts |
| `alert_deliveries` | one row per attempt — escalations and recovery mean several per incident; proves the founder was told |
| ~~`incident_observations`~~ | **REJECTED.** It is `error_events.incident_id`. A join table between an entity and its own rows is a table that exists to look thorough |

Sketch only — full DDL, indexes, RLS and rollback come as a separate document
if and when authorised:

- `error_events`: `event_id` PK, `incident_id` FK, `occurred_at`, `ingested_at`,
  `student_id`, `request_id`, `severity`, `route_pattern`, `deploy_id`.
  **Monthly partitions**, dropped wholesale on expiry — `DELETE` at 100M rows
  is an outage, `DROP PARTITION` is instant.
  Indexes: `(incident_id, ingested_at)`, `(request_id)`, `(student_id, ingested_at)`.
- `incidents`: `incident_key` UNIQUE, state, counts, `first_seen`, `last_seen`,
  exemplar stack + internal message, `deploy_id`.
- `alert_deliveries`: `incident_id`, `attempt`, `channel`, `state`, the four
  latency timestamps.

**RLS: service-role only on all three.** No student may read them. `student_id`
is a UUID; no names, no emails, no phone numbers, ever.

## I. RETENTION

| Data | Hot | Then |
|---|---|---|
| `error_events` P0/P1 | 90 days | drop partition |
| `error_events` P2/P3 | 30 days | drop partition |
| **`student_id` on events** | **30 days** | **NULLed — counts survive, identity does not** |
| `incidents` | 1 year | archive |
| `alert_deliveries` | 90 days | drop |

Debugging convenience is not a reason to hold student identifiers forever.

## J. THE 5-SECOND SLA — defined precisely, P95 not P50

Timestamps: `occurred_at` · `captured_at` · `ingested_at` · `persisted_at` ·
`alert_attempted_at` · `alert_accepted_at` · `alert_delivered_at`.

| Metric | Definition | Target |
|---|---|---|
| `T_ingest` | `occurred_at → ingested_at` | **measured, no target** — browser network is outside our control |
| **`T_dispatch`** | **`ingested_at → alert_attempted_at`** | **P95 ≤ 5 s** ← the contractual SLA |
| `T_delivery` | `alert_attempted_at → alert_accepted_at` | measured; provider-bound |

Founder ruling applied: the SLA is **from successful ingestion to alert
dispatch**, and browser latency is measured separately and never folded in.

**P50 is not reported as the headline.** An 0.8 s average hides a 2 % tail, and
that tail is where the missed P0 lives.

**P99 cannot be guaranteed**, and I will not claim it. Cold starts (200–900 ms),
Postgres connection saturation under storm, and webhook provider variance are
all outside this design's control. The honest statement: **P95 ≤ 5 s is a
design target; P99 will be measured and reported, not promised.**

**The recovery path cannot meet 5 s at all.** An alert lost to a mid-flight
crash is recovered by the sweeper, and Vercel's cron floor is 1 minute — so
that path is **≤ 60 s, not ≤ 5 s**. It is a safety net, not the SLA, and
conflating the two would be exactly the kind of number-massaging this document
was asked to eliminate.

## K. NON-GOALS

Not building: a log aggregator, an APM, a metrics/tracing system, a
multi-provider notification framework, a status page, or on-call rotation. This
is an **error → incident → founder** control plane and nothing else.

---

# ARCHITECTURE STATUS: **NOT READY**

Five items block implementation. Four are yours to decide; one is mine to
finish.

| # | Blocker | Owner |
|---|---|---|
| 1 | **`SECURITY_ALERT_WEBHOOK_URL` unverified in production.** If unset, `sendSecurityAlert` no-ops to `console.warn` and the entire pipeline ends in a log line. Your ruling #1 was "verify first" — it is not yet verified, and I cannot verify it from here without reading production env | founder |
| 2 | **DDL not authorised.** Phase 3 cannot start. Partitioning in particular must be right on day one — retrofitting partitions onto a live 100M-row table is an outage | founder |
| 3 | **P2/P3 sampling threshold (1,000/hr) is a guess.** It is not grounded in measured volume, because we have no ingestion yet. Shipping a guessed threshold that silently drops observations would reproduce this workstream's core defect | me — needs live baseline |
| 4 | **Recovery-path latency is ≤60 s, not ≤5 s.** Architecturally unavoidable on Vercel's 1-minute cron floor. Needs explicit acceptance that the *guarantee* is "durably recorded, alerted within 60 s worst case", while the *target* is P95 ≤ 5 s on the fast path | founder |
| 5 | **Supabase-outage alerting is best-effort and undeduplicated** by construction. Accepted as a named limitation rather than engineered around | founder |

**What is now ready:** the fingerprint, the three-level dedup, the delivery
state machine, the expected/unexpected split, the volume and storage model, the
retention policy, and the SLA definition.

**What I got wrong and corrected:** `after()` as the delivery guarantee.
That was a silent-loss path in the middle of an anti-silent-loss architecture.
