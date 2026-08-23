# CareerRai — whole-app security + control audit

**23 Aug 2026 · READ-ONLY, ADVERSARIAL. Nothing implemented.** No migration, no
DDL, no schema/API/UI change, no instrumentation, no data repair, no config
change, no deploy. 87 tables inspected in production, 180 API routes and 98
pages enumerated in the repository.

**Every earlier conclusion was re-verified from primary evidence.** Where a
prior conclusion was wrong it is recorded below as
*Previous → Evidence → Correction → Consequence*, not silently amended.

Artifact package: `WHOLE-APP-ATTACK-SURFACE.md` ·
`FOUNDER-CONTROL-TOWER-DATA-MATRIX.md` · `STUDENT-360-AUDIT.md` ·
`SECURITY-FINDINGS.md` · `DATA-PROVENANCE-MATRIX.md` · `REMEDIATION-ORDER.md` ·
sales domain in `SALES-OPERATING-SYSTEM-AUDIT.md` + `SALES-ARCHITECTURE-GATE.md`.

---

# CORRECTIONS TO MY OWN PRIOR CONCLUSIONS

| # | Previous conclusion | Evidence | Correction | Consequence |
|---|---|---|---|---|
| 1 | "236 real Expedify call outcomes were mis-attributed to one profile" | 236 rows, **1 distinct `agent_summary`** = `"first webhook test"`, 1 distinct phone, no disposition field | They are one test payload delivered 236 times. **No genuine call outcome has ever arrived.** | The vendor pipe is not "mis-keyed", it has never worked. Severity moves from data-loss to never-instrumented |
| 2 | "`student_crm` is a shadow table — retire it" | trigger `trg_sync_student_crm` on `profiles`; migration header declares slice 1 of the profiles split; **mirror disagrees with `profiles` in 0 of 684 rows** | Intentional dual-write, reads not yet flipped | Decision is finish-or-revert, never "retire as dead" |
| 3 | "Add `UNIQUE(phone)`" | shared family numbers are a real Indian case; 0 duplicates today but nothing enforces it | Withdrawn | A constraint would reject a sibling at signup — a product decision, not hygiene |
| 4 | "The sales panel is not visible" | Sales workspace with 9 tabs in `admin-workspaces.ts`, on `main` since 21 Aug (`a46a729`) | Misleading | The panel exists; the data under it does not |
| 5 | "Idempotency on Expedify events is unexercised" | `expedify_events_dedupe_key_key UNIQUE (dedupe_key)` exists, **and `dedupe_key` is NULL on 239/239 rows** | Worse than unexercised — **bypassed by construction**, since Postgres allows unlimited NULLs in a unique index | 220 duplicate deliveries on 12 Aug are the proof |
| 6 | Implied `sales_activity.student_id` is keyed to `profiles` | constraint list shows only `pkey` + `status_check` | **No foreign key exists** | A forged or non-existent uuid persists as activity |
| 7 | (this pass) `setup-supabase.sh/.bat` matched a Supabase JWT header pattern | the match is the literal placeholder `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` with a trailing ellipsis, exactly like `sk-ant-...`; no payload segment exists in either file | **FALSE POSITIVE — no real key is committed** | Recorded so a future scanner does not re-raise it as P0 |

---

# WHAT IS STRUCTURALLY SOUND

Stated first, because an audit that only lists faults misrepresents the system.

| Control | Status | Evidence |
|---|---|---|
| RLS coverage | **PROVEN** | **87 of 87 public tables have RLS enabled. Zero exceptions.** 44 carry zero policies = deny-all except service-role |
| `SECURITY DEFINER` hygiene | **PROVEN** | 18 functions, **18 with a pinned `search_path`**. No unpinned definer function exists |
| Client write grants | **PROVEN** | `20260819l_revoke_unusable_client_write_grants.sql` revokes INSERT/UPDATE/DELETE from `anon`/`authenticated` on privileged tables |
| Payment webhook | **PROVEN** | HMAC verified before any state change; unconfigured secret drops the event; a failed read throws → 500 → Razorpay redelivers, never a false `ok` |
| Object-level authz on `[id]` API routes | **PROVEN** | all 4 checked: admin DNA ×2 gated by `isRequestAdmin()`; buddy briefing enforces `student.buddy_id === user.id`; chat attachment enforces participant and returns **404 not 403** so existence is not confirmed |
| Assignment race | **PROVEN SAFE** | `claim_lead` is one `INSERT … ON CONFLICT DO UPDATE … WHERE owner IS NULL OR owner = excluded.owner` — guard inside the statement, no read-then-write window |
| AI blast radius | **PROVEN** | Gemini REST only (`generativelanguage.googleapis.com`). **No tools, no function declarations, no DB access, no network access from the model.** Grep for `tools:`/`functionDeclarations`/`function_call` returns nothing |
| XSS sinks | **PROVEN** | exactly **one** `dangerouslySetInnerHTML`, a static constant (`LANDED_BEACON`) with no interpolation of any kind |
| Secrets in repo | **PROVEN CLEAN** | 0 tracked `.env` files, `.env*` gitignored, no real JWT in any tracked file (see correction 7). All 11 `NEXT_PUBLIC_*` vars are public by design |
| Public lead capture | **PROVEN BOUNDED** | `/api/cat-leads`: 10/IP/day cap, 24h per-phone dedup, silent accept over cap so a spammer gets no signal |
| Referrer leakage of the handoff token | **MITIGATED** | `Referrer-Policy: strict-origin-when-cross-origin` — the `?k=` token is not sent cross-origin |

---

# THE FIVE THINGS THAT ARE ACTUALLY WRONG

Full detail with exploitability in `SECURITY-FINDINGS.md`. Headlines only:

### P1-A · 502 encrypted session-token pairs retained forever
`pwa_session_handoff`: **502 rows, all carrying a payload, oldest 12 July, 0
live, 494 expired-unused, 8 used. No purge exists anywhere in the repo.** Each
payload is an AES-256-GCM blob of a Supabase **access + refresh token** pair.

The encryption key is `sha256(SUPABASE_SERVICE_ROLE_KEY)`. **So the encryption
protects against a database-only exposure (a backup or replica leak) and gives
no protection whatsoever against service-role compromise — the two secrets are
the same secret.** Payload lifetime needed: 15 minutes. Payload lifetime
actual: 6 weeks and counting.

**UNKNOWN — NOT PROVABLE FROM CURRENT SYSTEM:** whether those refresh tokens
are still redeemable. Supabase refresh tokens rotate on use and do not expire
on wall-clock; testing one would mean using it, which I will not do.

### P1-B · A sales rep can claim any person in the system
`/api/sales/log` validates `studentId` only as `typeof === 'string'`. No uuid
check, no `role='student'` check. `claim_lead` then INSERTs a `lead_outreach`
row for that id, and `sales_activity` has **no foreign key on `student_id`**, so
even a non-existent uuid persists as history.

### P1-C · A rep can read any student, including ones she does not own
`/sales/student/[id]` calls `requireSales()` then reads the URL id with no
ownership resolution. `leadVisibleTo()` already exists in the codebase and is
simply not called here.

### P1-D · A vendor callback selects which student row is written
Both Expedify inbound routes resolve identity from `payload.phone` via
`.in('phone', phoneVariants(…)).limit(1).maybeSingle()`. Whoever holds the
shared secret chooses the row; an ambiguous phone is resolved arbitrarily and
silently.

### P1-E · Sensitive actions are essentially unaudited
`admin_audit_log` holds **9 rows across 10 weeks**, covering exactly three
actions: `assign_buddy`, `retry_unlock`, `revoke_scholarship`. It has **one
writer** (`src/lib/audit.ts`). **Premium grant, premium revoke, payment state
change, lead assignment, reassignment, coupon use and account deletion write
nothing to it.** `grantPremiumAndQueueBuddy` contains no audit call at all.

---

# FINAL ARCHITECTURE JUDGEMENT

### 1. Can CareerRai safely operate with real students and real money today?
**YES, with two conditions.** The money path is the best-defended part of the
system: HMAC-verified webhook, server-side pricing, deny-all RLS, no client
trust. The conditions are P1-A (purge the token store) and P1-D (the vendor
must not choose the student). Neither is a reason to stop taking payments today.

### 2. Can the founder see the operational truth of the business?
**PARTIAL.** Student and product truth: yes — 165,861 events, payments,
progress. Sales truth: **no** — 0 lead rows, 0 activity rows, 0 of 5 paid
customers attributable.

### 3. Can the founder manage a multi-rep sales team from the admin panel?
**NO.** `/admin/sales-performance` reads `reps[0]`; there is no unassigned
queue, no bulk assign, no assignment UI, and the reassign API rejects the
founder because his profile has no email.

### 4. Can the system prove sales activity actually happened?
**NO.** There is no call id, duration, recording, or message receipt anywhere.
The system can record that a rep *said* she called. `wa.me` links, typed notes
and the `converted` disposition are all claims. **The only observed commercial
fact is a paid ledger row.**

### 5. Can the system reconstruct a student's complete journey?
**PARTIAL.** Post-signup: strong (100% identity on logs, payments, buddy
intent). Mid-funnel: weak (`tap` 31% identified, `app_open` 45%). Pre-signup:
**none** (14,083 funnel events, 0% identified). Paywall and checkout: **not
instrumented at all**.

### 6. Can an authenticated user cross another user's security boundary?
**YES — for one role.** A **sales** rep can read any student (P1-C) and claim
any person (P1-B). Students and buddies: **NO** — every path checked enforces
ownership, and the four dynamic API routes are correctly gated.

### 7. Can a vendor callback choose an arbitrary student?
**YES.** P1-D. This is the finding I would fix first among the security items.

### 8. Are payments and entitlements internally consistent?
**PARTIAL.** All 4 real premium students have exactly one paid row (1:1, no
integrity defect — re-verified). But `is_premium` and `subscription_status` are
independent fields and disagree for at least one student (PAY-01), so
"is this student paid" has two answers.

### 9. The five issues that must be fixed before anything else is built
1. **P1-A** — purge `pwa_session_handoff`; 502 stored credential pairs is the
   largest standing exposure and the cheapest to remove.
2. **P1-D** — vendor must never select the student row; missing/ambiguous
   correlation ⇒ UNMATCHED; reject a null idempotency key.
3. **P1-B + P1-C** — the two sales authorization holes; both are route-level
   fixes plus one missing foreign key.
4. **Identity** — `owner_id`/`actor_id` as `profiles.id`. **Free today: both
   tables have 0 rows. A migration the moment the CRM is used.**
5. **P1-E** — audit the privileged mutations, starting with premium grant.

### 10. What should NOT be built yet
The Control Tower's L1–L5. Any rep leaderboard (it would rank self-reports).
Any lead-distribution UI before P1-B/P1-C. Any normalisation of
`expedify_events` into `sales_activity` (it would import 236 rows of a test
string). The four frozen B3b paths. `payment_checkout_opened` — **useful, but
it is one event, and the founder is right that it does not fix the
lead→rep→interaction→payment chain.**

**The one thing that CAN be built now: the Data Quality layer (L6).** All 16 of
its checks return real numbers today, and its subject matter is the missing
data itself — so it is the only sales surface that is not UI over an empty
table.
