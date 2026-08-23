# The Canonical Error System — architecture

**Status:** ARCHITECTURE ONLY. No implementation, no schema created, nothing
deployed. 23 Aug 2026 · `main` @ `a6cb0d7`.

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
