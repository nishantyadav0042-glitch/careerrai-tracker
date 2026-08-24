# P0 Phase 1 — read-only audit: consistency, error observability, 5-second alerting

**READ-ONLY. Nothing changed. No code, no schema, no production data.**
23 Aug 2026 · `main` @ `45b78b6` · every claim below points at a real file.

**Scope honesty up front.** 180 API routes, 38 scheduled crons, ~272 catch
blocks. This pass **enumerated** the error/alerting infrastructure and the
fallback patterns exhaustively by scan, and **sampled** consumer-side
consistency (Objective 1) against the already-mapped 0C.3 inventory rather than
re-deriving all 180 routes. Where a number is a sample rather than a census, it
says so.

---

# THE HEADLINE

> **Today, a single student's P0 error reaches the founder in a worst case of
> 1 hour — and in the common case, never.**

Two paths exist, and neither meets the requirement:

| Path | Mechanism | Latency to founder | Fires for one student? |
|---|---|---|---|
| Server error | `instrumentation.ts` → `security_events` → `/api/admin/security-monitor` (`0 * * * *`, **hourly**) → alerts only if `serverErrors >= 25` in that hour | **up to 3,600 s** | **No — never** |
| Client error | `crash-reporter.tsx` → `/api/client-error` → `client_errors` table | **∞ — nothing alerts on it at all** | **No** |

`client_errors` is read by exactly one consumer, `api/admin/launch-metrics`, an
admin page. **No alerting path exists from it.** A student can see a red error
box, the row lands in the table, and nobody is told — which is Incident #14's
exact shape, now with a table underneath it.

**Gap against the requirement: 720× in the best case, unbounded in the common
case.**

---

# 1. GLOBAL CONSISTENCY MAP — what exists today

| Layer | Module | Status |
|---|---|---|
| Server error capture | `src/instrumentation.ts` (`onRequestError`) | exists, writes `security_events`, **never alerts directly** |
| Client uncaught capture | `src/components/crash-reporter.tsx` → `/api/client-error` | exists, **no alerting** |
| Client *handled* capture | `src/lib/report-error.ts` | exists — **1 call site in the whole app** |
| API error response | `src/lib/api-error.ts` (`serverError`) | exists — **15 call sites vs 670 hand-written `{ error: … }`** |
| Out-of-band alert | `src/lib/alerting.ts` (`sendSecurityAlert`) | Slack/Discord webhook. **4 call sites.** No durability, no dedup, no severity |
| Email alert | `src/lib/email.ts` (`sendAdminAlert`, Resend) | **7 call sites**, all cron digests |
| Security audit trail | `src/lib/security-log.ts` (`logSecurityEvent`) | 8 call sites |
| Cron run tracking | `src/lib/cron-run-tracker.ts` → `cron_runs` | complete (B3a) — **18 jobs tracked**, no alerting |
| Truth boundary | `src/lib/truth/{source,batch,mutation-gate}.ts` | complete, **9 of 13 mutation paths migrated** |
| Canonical facts | `src/lib/facts/*` | **3 facts registered** of a 7-fact v1 set |

**There is no external error service.** No Sentry, no Bugsnag, no Datadog in
`package.json`. `instrumentation.ts` mentions Sentry only in a comment.

## 2. DUPLICATE / CONFLICT INVENTORY

| Concept | Definitions found | Evidence | Risk |
|---|---|---|---|
| **API error shape** | **4** | `{ error: … }` ×670, `{ ok: … }` ×163, `{ message: … }` ×11, `{ success: … }` ×9 | **P0** — no client can handle failure uniformly |
| **Severity vocabulary** | **6** | `critical` ×12, `normal` ×5, `warning` ×5, `high` ×4, `info` ×2, `error` ×1 | **P0** — cannot route or prioritise |
| **Error code registry** | **0** | every code is an ad-hoc string at its call site | **P0** |
| **Error → founder path** | 3 unrelated | `sendSecurityAlert` (webhook), `sendAdminAlert` (email), `security_events`+hourly cron | **P0** — no single boundary |
| **Console-only errors** | **235 `console.error`** vs 1 `captureException` | most production error paths end in stdout | **P0** — invisible off-Vercel |
| **`?? []` on a read** | **64** direct `data ?? []` sites (606 `?? []` overall) | the reconciliation-incident shape | **P0** where mutation-capable — 9 of 13 now migrated, **4 remain** |
| **`?? 0`** | 346 | mixes real zero with unknown | **P1** — needs per-site classification, not a blanket rule |
| **`catch {`** | 272 (81 with an explanatory comment, **2 fully empty**) | swallowed failures | **P1** |
| **Schedulers** | **2** | `vercel.json` (38 crons) + `.github/workflows/cron-fallback.yml` | **P1** — this is what caused the Phase 11 duplicate sends |

The 0C.3 audit already documented the *fact*-level duplication (four universes
for syllabus coverage, six producers of `logged_days_last_7`). That work is
Wave 2+ and is **not** re-opened here.

## 3. ERROR SURFACE INVENTORY — coverage against the 24 required flows

| # | Flow | Captured today? | Alerts founder? |
|---|---|---|---|
| 1–4 | Login / signup / OAuth callback / session refresh | partially — `login_attempts`, `security_events`, `auth-observation.ts` | **no** |
| 5–7 | Onboarding / profile save / student plan | `report-error.ts` exists but **1 call site** | **no** |
| 8 | Daily log submission | `console.error` only | **no** |
| 9–10 | Mentor booking / chat | `console.error` only | **no** |
| 11–14 | Payment init / success / subscription / webhook | `integration_audit_log`, `reconcile-payments` (`*/15`) | **only via a 15-min reconcile** |
| 15–17 | Notification / email / WhatsApp dispatch | `notifications` state model (complete) | **no** |
| 18 | Cron jobs | `cron_runs` (complete, 18 jobs) | **no** |
| 19–20 | Database / external API failures | via `onRequestError` if thrown | **hourly, ≥25 threshold** |
| 21 | Server actions | **n/a — zero server actions in the app** | — |
| 22 | API routes | `onRequestError` for *thrown*; handled errors return `{ error }` and vanish | **no** |
| 23–24 | Client uncaught / unhandled rejection | `crash-reporter.tsx` → `client_errors` | **no** |

**Every row's alert column is "no" or "too slow". That is the whole finding.**

## 4. ERROR → USER IMPACT MATRIX (proposed, needs ruling on the boundaries)

| Severity | Definition | Examples in this codebase |
|---|---|---|
| **P0** | student blocked, money, security, data integrity | payment failure, auth loop, `weekly-plan-reconcile` mutating on a dead read |
| **P1** | major student-facing failure, workaround exists | daily-log save fails, plan won't load, push storm |
| **P2** | degraded, non-blocking | insight card empty, digest under-sends |
| **P3** | diagnostic | cron partial-degraded, dedup unavailable |

## 5. THE 5-SECOND ARCHITECTURE — achievable, with one caveat

**Cron cannot do this.** Vercel's minimum is 1 minute; this project's monitor is
hourly. Any polling design fails the requirement by construction.

**The event-driven path is already available in this codebase** and is the only
design that meets it:

```
T0  error thrown / caught
     ↓  (same invocation — no queue, no poll)
T1  captureError()  → INSERT error_events        ~30–80 ms
     ↓  after() from 'next/server'  ← ALREADY USED in src/lib/auth.ts:2
T2  dispatcher: dedupe by incident key, decide alert
     ↓
T3  Slack/Discord webhook (alerting.ts pattern)   ~150–400 ms
     └─ fallback: Resend email (email.ts)         ~300–800 ms
```

**Realistic T3 − T0: 0.3 – 1.5 s for server-side errors.** Comfortably inside 5 s.

**Where I cannot guarantee it, stated plainly:**

1. **Client-side errors add a network hop** the server does not control. A
   student on a poor Indian mobile connection may take >5 s just to POST
   `/api/client-error`. **The SLA is measurable from ingestion (T1), not from
   the error in the browser (T0).** I will instrument both and report them
   separately rather than quietly redefine T0.
2. **Cold starts.** A serverless invocation that cold-starts adds 200–900 ms.
   Still inside budget, but it is variance, not headroom.
3. **`after()` runs post-response but within the invocation lifetime.** If the
   platform kills the container early the dispatch is lost — so the durable
   INSERT must happen **before** the response, and only the *alert* in `after()`.
   That ordering is the design's load-bearing detail.
4. **Webhook provider outage.** Handled by fallback + retry, not by pretending.

**Verdict: ≤5 s is achievable for server-originated errors and for
client errors measured from ingestion. It is NOT achievable end-to-end from a
browser on an unreliable network, and no architecture can make it so.**

## 6. ERROR EVENT CONTRACT (proposed — needs a schema ruling)

The repo already has `client_errors` and `security_events`. Neither carries
severity taxonomy, incident grouping, or latency fields. **Reusing
`client_errors` (as `os/sacred-failure.ts` does with `source='server'`) would
overload a table whose name and consumers mean something else.**

This needs a **founder ruling — new table vs extend existing** (§16). I have
written no DDL.

## 7. DEDUP / INCIDENT MODEL

```
ErrorEvent (many)  ──group by──►  Incident (one)
   event_id                          incident_key = hash(category, error_code, route, deploy_id)
```

Alert on the **first** P0/P1 event for an incident key; subsequent events
update the count and `last_seen` without a new alert. 500 students hitting one
provider timeout ⇒ **1 alert, 500 preserved events, affected-student count on
the incident.** `event_id` is the idempotency key so retries cannot duplicate.

## 8. WHAT I AM NOT DOING

- **No DDL.** Explicitly unauthorised.
- **No deploy, no merge, no production data change.**
- **The four remaining B3b paths stay untouched.** Your opening line said
  proceed; the mandate says not until this audit places them. **They belong in
  Phase 8**, and their `?? []` sites are already counted above.
- **No new alert provider.** The design reuses `alerting.ts` (webhook) and
  `email.ts` (Resend), both already in the app.

## 9. IMPLEMENTATION ORDER (matches your phases)

| Phase | Content | Gate |
|---|---|---|
| 2 | Error contract + code registry + severity enum (pure, no I/O) | unit + guards |
| 3 | `captureError()` + durable ingestion | failure-matrix tests |
| 4 | Dispatcher + dedup + retry + fallback | alert-storm test |
| 5 | Auth / signup / onboarding | per-flow tests |
| 6 | Payments + webhooks | per-flow tests |
| 7 | Student product flows | per-flow tests |
| 8 | Crons — **including the 4 remaining B3b paths** | gate 6/7 as established |
| 9 | Client global capture | latency measurement |
| 10 | Static guards + full failure matrix | CI |

---

# 10. WHAT REQUIRES A FOUNDER RULING

1. **Storage.** New `error_events` + `incidents` tables (needs DDL
   authorisation), or extend `security_events`? I have written no schema.
2. **T0 definition for client errors.** Measure from browser (unachievable on a
   bad network) or from ingestion (achievable, honest)? I recommend measuring
   and reporting **both**.
3. **Alert channel of record.** `SECURITY_ALERT_WEBHOOK_URL` is currently unset
   in some environments — `sendSecurityAlert` no-ops to `console.warn`. If the
   webhook is not configured in production, **the 5-second path has no
   destination** and no amount of code fixes that.
4. **P0 alert volume.** A genuine P0 incident at 03:00 IST — wake you, or queue
   to the daily digest? "Within five seconds, at any cost" implies wake you; I
   want that said explicitly before I build a pager.
5. **The 346 `?? 0` sites.** A blanket ban is wrong — many are legitimate
   business zeros. This needs per-site classification, which is Wave-5 hours
   work, not this phase.
6. **Two schedulers.** `vercel.json` + `cron-fallback.yml` both fire the same
   jobs; this already caused duplicate sends once (Phase 11). Out of scope here,
   but it is a live consistency violation and I am flagging it rather than
   absorbing it.
