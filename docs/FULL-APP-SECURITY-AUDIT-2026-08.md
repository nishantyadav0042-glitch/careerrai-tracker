# CareerRai — full application security audit

**READ-ONLY. Nothing modified: no code, no schema, no data, no config, no
deploy.** 23 Aug 2026 · `main` @ `2d6bb8f` · production `pobhpszlsozeonejtzqy`.

---

# 1. EXECUTIVE VERDICT

## **NOT READY**

Two reasons, and the second matters more than the first:

1. **Two confirmed P1s already exist** (SEC-0001, SEC-0002 — carried from the
   23 Aug branch review, both still open).
2. **This audit is INCOMPLETE.** Of the 23 prescribed phases, **8 are complete,
   4 partial, 11 not started.** Per your own rule — *"NOT READY … or critical
   evidence is missing"* — missing evidence alone decides it.

**I am not issuing a clean bill on phases I did not run.** Section 28 lists
every unexamined area by name.

### What the completed phases actually found

The database security posture is **materially better than I expected**, and
that is an evidence-backed statement, not a compliment:

- **RLS is enabled on all 88 public tables.** Verified via `pg_class`.
- **44 tables have RLS enabled and ZERO policies** — deny-all, fail-closed. For
  non-service-role callers these are unreachable.
- **Every policy inspected on high-value tables is correctly owner-scoped**
  (`auth.uid() = owner_id`). No policy leaks another user's rows.
- **Privilege escalation via profile self-update is blocked twice over** —
  column-level grants that exclude `role`, plus a trigger.
- **The payment webhook is correctly built**: mandatory HMAC-SHA256 with
  `timingSafeEqual`, event dropped if the secret is unset, duplicate delivery
  handled.

**No confirmed P0 was found in the areas examined.** That is not the same as
"there is no P0."

---

# 2. AUDIT COVERAGE — what was actually done

| Phase | Status | Evidence basis |
|---|---|---|
| 1 Repo/architecture inventory | **COMPLETE** | 180 API routes, 38 crons, 0 server actions |
| 2 Authentication | **PARTIAL** | primitives located; takeover flows NOT tested |
| 3 Authorization / IDOR | **PARTIAL** | DB layer verified; per-endpoint matrix NOT built |
| 4 Database / Supabase / RLS | **COMPLETE** | live `pg_policies`, grants, triggers |
| 5 Payments | **PARTIAL** | webhook verified; full lifecycle NOT traced |
| 6 Webhooks | **COMPLETE** (payment) | signature + replay verified |
| 7 Cron | **COMPLETE** | auth mechanism read |
| 13 Error/logging | **COMPLETE** | separate review, 23 Aug |
| 19 Invariants | **PARTIAL** | DB-enforced ones verified |
| 20 Consistency | **COMPLETE** | separate review, 23 Aug |
| 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 21 | **NOT STARTED** | — |

**11 phases not started.** Business logic, AI/LLM, XSS/injection, rate
limiting, secrets scanning, file uploads, headers/CSRF, supply chain,
deployment/preview isolation, information disclosure, and adversarial PoCs.

---

# 4. AUTHENTICATION — PARTIAL

**Verified:** `authorizedCron` (below), Supabase Auth as the session
authority, `getAuthUser` / `classifyAuth` primitives, `login_attempts` and
`otp_send_events` tables exist with lockout monitoring in `security-monitor`.

**NOT verified — and these are the ones that matter:** password-reset
takeover, OTP brute-force ceilings under concurrency, OTP replay, email/phone
change takeover, email enumeration, session fixation, logout invalidation
completeness.

**Known open item (pre-existing, task #42):** *106 independent `getUser()` call
sites.* Authentication is **not** one system by call-site count. Whether they
can *disagree* is exactly the question this audit has not yet answered.
**UNKNOWN — not safe.**

---

# 5–6. AUTHORIZATION & DATABASE — COMPLETE at the DB layer

## SEC-0000 · The strongest control found

**Evidence — live production, not migrations:**

```
88 public tables · RLS enabled: 88 · RLS disabled: 0
44 tables with RLS and ZERO policies → deny-all for anon/authenticated
```

Policies on the highest-value tables, verbatim from `pg_policies`:

| Table | Policy | Expression |
|---|---|---|
| `google_oauth_tokens` | Owner reads own | `user_id = auth.uid()` |
| `student_payments` | student sees own | `student_id = auth.uid()` |
| `chat_messages` | pair members | `auth.uid() = student_id OR auth.uid() = buddy_id` |
| `notifications` | ALL, own only | `user_id = auth.uid()` (USING **and** WITH CHECK) |
| `session_credits`, `refund_requests`, `buddy_payouts` | own only | owner-scoped |
| `profiles` | own / buddy's students / admin | `auth.uid() = id`, `buddy_id = auth.uid()`, `is_admin(auth.uid())` |

**Every one is correctly scoped.** `google_oauth_tokens` — the highest-value
table in the database — is owner-only.

## SEC-0003 · `profiles` UPDATE has no `WITH CHECK` — investigated, NOT exploitable

The UPDATE policies specify `USING (auth.uid() = id)` with **`WITH CHECK` =
none**. In isolation that permits changing what the row *becomes*, including
`role`. **I pursued this as a candidate P0 and it does not hold**, because two
independent controls stop it:

**1. UPDATE is granted column-by-column**, and the privileged columns are
absent from the grant list:

```
authenticated may UPDATE: full_name, phone, email, avatar_url, study_target_hours,
  hours_available, notif_prefs, onboarding_*, self_reported_*, … (≈130 columns)
authenticated may NOT UPDATE: role, id, is_premium, is_admin, buddy_id,
  subscription_status, is_test_account
```

**2. A trigger blocks it anyway** — `guard_privileged_profile_columns`, enabled,
with a **pinned `search_path`** (correct hardening against the classic
SECURITY DEFINER attack):

```plpgsql
IF current_user IN ('service_role','postgres','supabase_admin') THEN RETURN NEW;
IF NEW.role IS DISTINCT FROM OLD.role
   OR NEW.is_premium … OR NEW.premium_since … OR NEW.subscription_status
   OR NEW.subscription_plan … OR NEW.buddy_id … OR NEW.password_set
THEN RAISE EXCEPTION 'Modifying privileged profile columns is not allowed';
```

**Answers to your P0 questions 4, 7 and 14:** a student **cannot** self-promote
to admin, **cannot** self-grant premium, and **cannot** reassign their own
mentor. Blocked at the database, twice, independent of application code.

**Residual — SEC-0003, P2:** the missing `WITH CHECK` means the *policy* is not
the control; two other mechanisms are. If someone later adds a column grant
without adding it to the trigger, the gap opens silently. **Recommend adding
`WITH CHECK (auth.uid() = id)` for defence in depth**, and a test asserting the
grant list and the trigger list stay in agreement.

**Also unguarded: `coaching_enrolled`** is user-updatable and **not** in the
trigger's protected list. Whether it gates any paid capability is **UNKNOWN**
— it needs tracing before it can be called safe.

## SEC-0004 · `TRUNCATE`/`DELETE` granted to `anon` on `profiles` — P2

`anon` and `authenticated` hold table-level `INSERT, SELECT, DELETE, TRUNCATE,
REFERENCES, TRIGGER`.

- **DELETE** is reachable via PostgREST, but there is **no DELETE policy**, so
  RLS denies it. Safe.
- **TRUNCATE is NOT subject to RLS.** A role holding TRUNCATE can empty the
  table regardless of policies.

**Why this is P2 and not P0:** PostgREST exposes no TRUNCATE verb, and the
`anon` *key* is a PostgREST JWT, not database credentials. Exploitation
requires a direct Postgres connection as the `anon` role, which requires the DB
password. **The grant is dangerous hygiene, not a reachable path** — from the
evidence I have. Marked **NOT VERIFIED** on whether direct DB connections as
`anon` are possible in this Supabase configuration.

---

# 7. PAYMENTS & WEBHOOKS — verified good

```ts
// src/app/api/payments/webhook/route.ts
if (!secret) { console.error('… not configured — event dropped'); }   // fail-closed
if (!verifyRazorpayWebhook(raw, signature, secret))
  return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

// src/lib/razorpay.ts:66
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
```

**Answers to P0 questions 5 and 8:** a payment **cannot** be marked successful
without provider verification, and **a forged webhook is rejected**. Signature
comparison is timing-safe. Duplicate delivery is explicitly handled (`'paid' =
duplicate`). Refund processing sets state back.

**NOT verified:** amount/plan tampering at checkout creation, double-consumption
of one payment under concurrency, entitlement race between webhook and
`reconcile-payments` (`*/15`), and the full refund→entitlement path. **P0
questions 6 and 7 remain UNKNOWN.**

---

# 8. CRON — SEC-0005, P3

```ts
if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
```

Shared static secret, **compared with `===`, not `timingSafeEqual`.** Unlike
the payment webhook, which does it correctly — an inconsistency worth noting in
its own right.

**Severity P3, argued rather than assumed:** remote timing attacks against
string comparison over HTTPS are impractical — network jitter exceeds the
timing delta by orders of magnitude. It should still be `timingSafeEqual` for
consistency with `razorpay.ts`.

**Answer to P0 question 9:** an attacker **cannot** trigger a cron without
`CRON_SECRET`; it fails closed when unset.
**Answer to question 10:** two concurrent executions **can** produce duplicate
mutations in the four unmigrated jobs — that is exactly the B3b work, and it is
why they are frozen.

---

# 13. ERROR / LOGGING — two open P1s

Carried from the 23 Aug review, both still open:

**SEC-0001 (P1)** — raw Postgres error text returned in 503 bodies, and
`cron-fallback.yml` does `cat /tmp/resp.txt` on **every** response into
**public** GitHub Actions logs. Seven migrated routes are in that workflow.
Schema recon; no PII, no credentials. *Introduced by this workstream.*

**SEC-0002 (P1)** — Postgres constraint violations embed row values
(`Key (email)=(…)`), and the proposed error architecture routes
`internal_message`/`exemplar_stack` into durable storage **and** founder
alerts. **Answer to P0 question 17: YES, error logs can contain PII** unless a
scrubber is built first.

**Answer to P0 question 13:** an attacker **cannot currently** flood the
founder channel — because no per-error alerting exists at all. Under the
proposed design, EXPECTED errors never page, but there is **no cap on
incident-creation rate** (SEC-0006, P2).

---

# 23. SPECIAL P0 QUESTIONS — answered or marked UNKNOWN

| # | Question | Answer |
|---|---|---|
| 1 | Student A read Student B's data? | **NO** at the DB layer (verified). API layer **UNKNOWN** — no endpoint matrix built |
| 2 | Student A modify Student B's state? | **NO** at the DB layer (verified) |
| 3 | Mentor access unassigned student? | **NO** — `buddy_id = auth.uid()` (verified) |
| 4 | Student → admin via request manipulation? | **NO** — grants + trigger (verified) |
| 5 | Payment successful without verification? | **NO** — HMAC required (verified) |
| 6 | Valid payment consumed twice? | **UNKNOWN** — concurrency not tested |
| 7 | Subscription extended without payment? | **NO** via profile update (verified). Other paths **UNKNOWN** |
| 8 | Webhook replay? | **NO** — signature + duplicate handling (verified) |
| 9 | Attacker triggers cron? | **NO** without `CRON_SECRET` (verified) |
| 10 | Two crons → duplicate mutations? | **YES** in the 4 unmigrated jobs (known, frozen) |
| 11 | Notification dedup bypass? | **YES** on failure, in the 4 unmigrated jobs |
| 12 | Forge founder alerts? | **NO** — service-role only (verified) |
| 13 | Flood founder channel? | **NO** today; **P2 gap** in the proposed design |
| 14 | Client value → privileged state? | **NO** for profiles (verified). Elsewhere **UNKNOWN** |
| 15 | Service-role reachable by a user? | **UNKNOWN — highest-priority unanswered question** |
| 16 | Preview → production data? | **UNKNOWN — not examined** |
| 17 | Logs contain secrets/PII? | **YES** — SEC-0002 |
| 18 | Error system lose events silently? | **YES** on DB outage — accepted, documented |
| 19 | Error system become a DoS vector? | **YES, possible** — sampling unresolved (blocker #3) |
| 20 | Competing security/alert system? | **YES — six today.** That is the whole error workstream |

**Question 15 is the one I would prioritise next.** `createAdminClient()`
bypasses RLS entirely, and every control verified above lives in RLS. A single
user-reachable route that passes a request-supplied id into an admin-client
query voids the entire database-layer defence. I have **not** enumerated those
call sites, so the answer is UNKNOWN — and UNKNOWN is not safe.

---

# 25. FINDINGS

| ID | Sev | Conf | Finding | Status |
|---|---|---|---|---|
| SEC-0001 | **P1** | CONFIRMED | PG error text → public CI logs | open, mine |
| SEC-0002 | **P1** | CONFIRMED | PG row values (emails) can enter error storage + alerts | open, blocks Phase 3 |
| SEC-0003 | P2 | CONFIRMED | `profiles` UPDATE lacks `WITH CHECK`; safety rests on grants + trigger | defence-in-depth |
| SEC-0004 | P2 | CONFIRMED | `TRUNCATE` granted to `anon`; not reachable via PostgREST | hygiene |
| SEC-0005 | P3 | CONFIRMED | `authorizedCron` uses `===`, not `timingSafeEqual` | consistency |
| SEC-0006 | P2 | CONFIRMED | No cap on incident-creation rate (proposed design) | design gap |
| SEC-0007 | INFO | CONFIRMED | `coaching_enrolled` user-updatable, unguarded by trigger | trace needed |
| SEC-0008 | INFO | CONFIRMED | 106 independent `getUser()` sites — auth is not one system | pre-existing |

**No P0 found in the phases completed.**

---

# 28. UNKNOWNS REQUIRING EVIDENCE — not to be read as "safe"

1. **Service-role reachability from user routes** — highest priority
2. Per-endpoint IDOR matrix across 180 routes
3. Payment concurrency: double-consumption, entitlement races
4. Auth takeover flows: reset, OTP replay, email/phone change
5. AI/LLM: prompt injection, cross-user context, tool permissions
6. XSS / injection / SSRF / open redirect
7. Rate limiting coverage and bypass
8. Secrets in client bundles and git history
9. File upload validation and bucket exposure
10. CORS / CSRF / cookie flags / CSP
11. Supply chain
12. Preview-vs-production isolation
13. Information disclosure to anonymous users
14. Adversarial PoCs — **none were run**

---

# 30. FINAL VERDICT

## **NOT READY**

Two confirmed P1s, and **11 of 23 phases not started**. The database layer is
genuinely strong and I have said so with evidence. But the application layer
above it — where `createAdminClient()` bypasses every control verified here —
is largely unexamined.

**UNKNOWN ≠ SAFE.** This audit found no P0 in what it looked at, and that
sentence is doing a great deal of work.

**Recommended next:** enumerate every `createAdminClient()` call site reachable
from a user request and check whether any request-supplied identifier reaches a
query without an ownership check. That single question can invalidate every
positive finding above, and it is answerable in one focused pass.

---
---

# AUDIT CHECKPOINT 2 — Phases 5, 6/7, 8, 11 (23 Aug)

Audit base `223f3de`. **Working tree clean; no application change made during
the audit.** The 10 non-doc files differing from `main` are the pre-audit B3b
migrations, authorised earlier and unrelated to this audit.

## PHASE 5 — service-role sweep · **STATUS: PARTIALLY VERIFIED**

**208 `createAdminClient()` call sites**, classified by gate:

| Gate | Count |
|---|---|
| `authorizedCron` | 36 |
| `isRequestAdmin` / `requireAdmin` | 4 |
| user-authenticated (`getAuthUser` / `getUser` / `getSession`) | 120 |
| **ungated routes** | **14** |

All 14 ungated routes are legitimately pre-authentication: login, OTP
request/verify, funnel beacon, install handoff/exchange, push telemetry, lead
capture, Razorpay webhook, Expedify callbacks.

**Evidence class: A (static).** No dynamic test was possible.
**Therefore the P0 question — "does any user-reachable route pass a
request-supplied id into a service-role query without ownership proof" — is
answered NO by code reading and UNKNOWN by execution.**

## PHASE 6/7 — injection & XSS · **STATUS: PARTIALLY VERIFIED**

**Exactly one `dangerouslySetInnerHTML` in the entire codebase:**

```
src/app/start/layout.tsx:32  <script dangerouslySetInnerHTML={{ __html: LANDED_BEACON }} />
```

`LANDED_BEACON` is a module-level constant — **no user-controlled data reaches
it.** The XSS sink surface is unusually small for an app this size.

**NOT verified:** markdown rendering, URL handling, open redirect, SSRF,
PostgREST filter injection. Phase incomplete.

## PHASE 8 — AI / LLM · **STATUS: VERIFIED SAFE for the decisive property**

**The model has no tools, no function calling, and no database access.**
`callGemini` sends `systemInstruction` + `contents` and returns text:

```ts
// src/lib/gemini.ts:129
contents: [{ role: 'user', parts: opts.parts }]   // no tools:, no function_call
```

**A model that cannot call tools cannot be an authorization bypass.** Grep for
`tools:`, `function_call`, `functionDecl`, `tool_choice`, `executeTool` returns
nothing. This eliminates the highest-severity AI risks by construction:
no model-triggered mutation, no model-initiated fetch, no privileged tool.

**Residual AI risk, NOT eliminated:**
- Prompt injection into mentor-facing drafts. Mitigated by design — the founder
  ruled AI output must be human-triggered and human-reviewed ("someone has to
  tap"), so a poisoned draft reaches a mentor's screen, not a student.
- **Cross-user context leakage: UNKNOWN.** I did not verify that every prompt is
  scoped to a single student. `stripNames()` exists, but whether it is applied
  on every path is unverified.
- Model output rendering: safe by the single-sink finding above.

## PHASE 11 — secrets · **STATUS: PARTIALLY VERIFIED**

**Every `NEXT_PUBLIC_*` variable is legitimately public:**

`SUPABASE_URL`, `SUPABASE_ANON_KEY` (public by design; RLS is the control),
`VAPID_PUBLIC_KEY` (public by definition), `APP_VERSION`, `SITE_URL`,
`META_PIXEL_ID`, `PAYMENTS_ENABLED`, `STORE_FUNNEL_ENABLED`, two WhatsApp
numbers.

**No server secret is exposed to the browser bundle by name.** ✅

**NOT verified:** git history for historically committed secrets, and the built
client bundle itself. Both require work not done here.

### SEC-0010 · P2 · Cryptographic key reuse — VERIFIED VULNERABLE (design)

```ts
// src/lib/session-handoff-crypto.ts:11
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

**The database service-role key is reused as the encryption key for session
handoff payloads** — payloads that contain live `access_token` and
`refresh_token` values.

One secret serves two unrelated trust domains. Consequences:

- Rotating the service-role key (a routine security action, and mandatory after
  any suspected exposure) **silently invalidates every outstanding handoff
  payload** — and, worse, the rotation would be done *for* a database reason
  while breaking an *authentication* mechanism nobody connected to it.
- A compromise of either domain compromises both.
- It creates a reason **not** to rotate the most powerful credential in the
  system, which is the real damage.

**Not exploitable on its own** — the key is server-side and not exposed. This is
a key-management defect, not an access-control one. **P2.**

**Remediation (do not apply during the audit):** a dedicated
`SESSION_HANDOFF_KEY`, with the migration handling in-flight tokens.

## Checkpoint status

| Phase | Status |
|---|---|
| 0 scope/git | **COMPLETE** |
| 4 RLS/database | **COMPLETE** |
| 5 service-role | **PARTIALLY VERIFIED** (static only) |
| 6/7 injection/XSS | **PARTIAL** |
| 8 AI/LLM | **VERIFIED SAFE** on tools; cross-user context **UNKNOWN** |
| 9 payments | **PARTIAL** |
| 11 secrets | **PARTIAL** |
| 13 cron/webhook | **COMPLETE** |
| 19 adversarial | **NOT TESTABLE** |
| 2, 3, 10, 12, 14, 15, 16, 17, 18, 20, 21 | **NOT STARTED** |

**SECURITY GATE: FAIL** — SEC-0001 and SEC-0002 (P1) remain open, and
11 phases are unstarted.
