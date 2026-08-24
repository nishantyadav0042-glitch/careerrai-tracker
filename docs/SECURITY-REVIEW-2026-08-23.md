# Security review — B3b branch + error-architecture gate

**23 Aug 2026 · Layer A: 27 files vs `main` · Layer B: targeted scan of the
existing error/alert/security infrastructure only.**
Read-only. No DDL, no production change, four frozen B3b paths untouched.

# VERDICT: **NOT READY**

Two P1 findings in code I wrote, one P2 pre-existing, and — the decisive one —
**every security property of the proposed error architecture sits at rung 1 of
your ladder.**

| Rung | Proposed error-system claims |
|---|---|
| documented | **all of them** |
| implemented | none |
| enforced | none |
| tested | none |

Your correction was right and I am adopting it as the standard: *"UUID-only, no
names/emails/phones"* and *"`student_id` NULLed at 30 days"* were **design
intentions I stated as security properties.** They are unverified, and until
there is a constraint, a sanitisation boundary and a test, they count for
nothing.

---

# LAYER A — the 27 changed files

## P1-1 · Raw Postgres error text is returned in HTTP bodies, and printed into **public** CI logs

**Mine. Introduced by this workstream.**

```ts
// src/lib/truth/source.ts
return unavailable<T[]>(`${label}: ${error.message}`);   // raw PG message

// e.g. src/app/api/cron/check-red-flags/route.ts:75,102,128
return NextResponse.json(
  { ok: false, skipped: 'source_unavailable', reason: gate.reason, … }, { status: 503 });
```

This violates the repo's own documented rule, in `src/lib/api-error.ts`:

> *"Postgres error text (column, constraint and RLS names) is schema recon in an
> attacker's hands, so it must never reach the response body."*

**Why it is worse than a normal body leak.** `.github/workflows/cron-fallback.yml`
does:

```yaml
code=$(curl -s -o /tmp/resp.txt -w '%{http_code}' …)
cat /tmp/resp.txt          # ← every response body, success or failure
```

**This repository is public, and GitHub Actions logs on public repos are
publicly readable.** Seven of the routes I migrated are called by that workflow:
`check-red-flags`, `decision-engine`, `daily-reminder`, `onboarding-morning`,
`buddy-brief`, `nishant-weekly`, `weekly-digest`.

So on any source failure, a Postgres error message — which can name columns,
constraints and RLS policies — is printed to a public log.

**Scope, precisely:**

| | |
|---|---|
| Deployed today | `weekly-plan-reconcile` only — and it is **not** in the cron-fallback list, so its `reason` reaches `cron_runs` but not public logs |
| On this branch, called by public CI | the seven above — **would leak on the first failed read** |
| Contains PII? | **No.** Schema/constraint names, not student data |
| Contains credentials? | No |

**Fix (not applied — no code changes in a review):** return a stable code in the
body, keep the detail server-side.

```ts
{ ok: false, skipped: 'source_unavailable', status: 503 }   // body
console.error('[check-red-flags]', gate.reason);            // logs + cron_runs
```

`cron_runs.result` already stores the detail durably, and that table is
service-role only. Nothing operational is lost.

## P1-2 · Postgres error messages can carry PII, and the design routes them into durable storage **and** into your alert

The architecture proposes storing `internal_message` and `exemplar_stack`, and
putting an internal message into founder alerts. Postgres constraint violations
embed **row values**:

```
duplicate key value violates unique constraint "profiles_email_key"
DETAIL:  Key (email)=(student@example.com) already exists.
```

That is a student email address, arriving in durable storage and in a webhook
message, from a code path whose stated policy is "no emails".

**This is exactly the gap your ladder exposes.** The policy is documented; there
is no scrubber, so it is not implemented, not enforced and not tested.

**Required before Phase 3:** a sanitisation boundary in `captureError` that
strips `DETAIL:` / `Key (...)=(...)` payloads, `Bearer …`, cookies,
`authorization` headers, query strings, and anything matching email/phone
patterns — with a test per pattern class. Not a convention. A function with
tests.

## P2-1 · Public CI prints every response body unconditionally

`cat /tmp/resp.txt` runs on success too. Today those bodies are counts
(`{ok, flagged, examined}`), so nothing sensitive leaks. **But it is an
unguarded channel**: any future endpoint that returns identifiers leaks
automatically, with no review step.

`weekly-plan-reconcile` is the proof of what that would look like — its success
body contains **655 student UUIDs** (`results: [{studentId, newDate, daysAdded}…]`).
It is not currently in the workflow's list. **Adding it would put 655 student
UUIDs into a public log**, and nothing in the repo prevents someone doing that.

**Fix:** `cat` only when `code >= 400`, or drop it and rely on the status line.

## Informational · `buddy-escalation` returns `issues: [mock_<uuid>…]`

Internal mock identifiers into public CI logs. Not student data, correlatable
only with service-role access. Pre-existing, low.

## Clean in Layer A

- The nine migrated routes **reduce** attack surface: chunked reads bound
  request size, and `503` replaces a plausible-looking success.
- Test fixtures use synthetic data only (`s0…`, `example.test`). No real
  identifiers committed.
- No secrets, tokens or credentials in the diff.
- The row-level recovery CSVs were **deliberately not committed** for exactly
  this reason.

---

# LAYER B — can the canonical system actually become the single system?

## 1. PII / privacy

| Question | Answer |
|---|---|
| Is `student_id` necessary? | **Yes** — "who was affected" is a stated requirement. But see below |
| Can UUIDs become sensitive by correlation? | **Yes.** `student_id` joins to `profiles`, which holds name, email, phone. The store is **pseudonymous, not anonymous** — and I previously implied otherwise |
| Is 30-day NULLing enforced? | **No. Documented only.** No job, no constraint, no test |
| Can stack traces / messages / metadata contain PII? | **Yes — see P1-2.** Postgres `DETAIL` embeds row values |
| Can a public-repo developer expose production error data? | **Yes, today** — via the CI-log path in P1-1/P2-1 |

## 2. Privilege boundaries

| Question | Answer |
|---|---|
| Who can INSERT events? | Proposed `service_role` only — **not implemented** |
| Who can UPDATE delivery state? | Proposed dispatcher only — **not implemented** |
| Can app code modify historical evidence? | Proposed no (INSERT-only grant) — **not implemented** |
| Can a compromised path manufacture incidents? | **Yes.** Any code holding the service-role key can write any incident. That is true of every table today; it is not made worse, but it is not solved |
| Is service-role access isolated? | **No.** One key, used everywhere. Out of scope here, worth its own workstream |

## 3. Alert abuse

- **Dedup atomicity:** `UNIQUE(incident_key)` + conditional-UPDATE claim is
  genuinely atomic. Concurrent workers cannot create duplicate incidents. ✅ by
  design.
- **Alert-channel exhaustion by an attacker:** EXPECTED errors never alert, so
  password-spraying cannot page you. ✅
- **But:** an attacker producing *varied* UNEXPECTED failures (malformed
  payloads across many routes) creates many distinct `incident_key`s, each
  legitimately alerting. **The design has no cap on incident creation rate.**
  **Gap — needs a per-hour ceiling with a single "alert storm" meta-incident.**

## 4. Webhook security

| Question | Answer |
|---|---|
| SSRF | **No risk.** URL is env-controlled, never user-controlled |
| Secret handling | **The URL *is* the credential.** A Slack/Discord webhook URL is bearer-equivalent; anyone holding it can post to your channel |
| Timeout | **NONE.** `sendSecurityAlert` calls `fetch(url, …)` with no `signal` and no timeout. A hung endpoint blocks the invocation — and under the proposed design that is on the alert path. **P2, must fix in Phase 4** |
| Response validation | **None.** Non-2xx is not detected, so a failed post is recorded as sent |
| Replay / idempotency | Not possible at the transport — stated, not solved |
| Retry amplification | Bounded (2 attempts) by design — not implemented |
| If the webhook endpoint is compromised | An attacker reads every alert: incident keys, route patterns, counts. **No student PII if P1-2 is fixed; student emails if it is not** |

## 5. Stack traces / exception data

Covered by P1-2. **Nothing today scrubs anything.**

## 6. 100M+ behaviour

Covered in the DDL Red-Team Gate: per-partition indexes, `DETACH CONCURRENTLY`,
`SKIP LOCKED`, rejected per-student index. One residual risk stands:
**partition creation is load-bearing** — no partition, no inserts.

**Can the architecture become the bottleneck?** Yes, in one specific way: one
synchronous INSERT is added to every failing request. On a healthy system that
is rare. **During a storm, every request both fails and writes** — the DB is
hit hardest exactly when it is least able. Mitigation is the P2/P3 sampling
policy, which is **blocker #3 and still unresolved**.

## 7. Bypass resistance

Existing transports into the founder: `alerting.ts::sendSecurityAlert`,
`email.ts::sendAdminAlert`, `security-monitor`, `founder-alerts`, plus
`console.error` ×235.

**The proposed allowlist guard is designed, not built.** And the specific
warning is one this workstream has already paid for: `daily-reminder` and
`study-companion` were missed by my first population-read scan because they
mutate through `dispatch()` rather than a write verb. **A guard matching direct
imports only would miss helper-mediated alert paths the same way.** It must
resolve through helpers — as the final population-read guard does.

---

# FINDINGS SUMMARY

| ID | Severity | Finding | Status |
|---|---|---|---|
| P1-1 | **P1** | Postgres error text in HTTP bodies → public CI logs | **Mine. Fix before merging this branch** |
| P1-2 | **P1** | PG `DETAIL` can carry student emails into durable storage and alerts | **Blocks Phase 3** |
| P2-1 | P2 | Public CI prints all response bodies unconditionally | Pre-existing; fix is one line |
| P2-2 | P2 | `sendSecurityAlert` has no timeout and no response validation | Fix in Phase 4 |
| P2-3 | P2 | No cap on incident-creation rate — varied attack can page repeatedly | Design gap |
| INF-1 | info | `buddy-escalation` leaks mock UUIDs to public CI | Pre-existing |
| INF-2 | info | Single service-role key used everywhere | Own workstream |

# WHAT IS REQUIRED FOR **READY**

1. **P1-1 fixed** — stable code in the body, detail to logs and `cron_runs`.
2. **P1-2 fixed** — a scrubber with per-pattern tests, before any event is stored.
3. **P2-1 fixed** — `cat` only on failure.
4. **The four PII claims moved from documented to tested**: UUID-only,
   30-day NULLing, no-emails, no-secrets.
5. **Blocker #3 resolved** — sampling policy, so the error system cannot become
   the outage.

None of these require DDL. All of them must precede it.
