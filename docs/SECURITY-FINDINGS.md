# Security findings — P0/P1/P2/P3 with evidence and exploitability

**23 Aug 2026 · READ-ONLY.** Nothing was exploited. Every finding is
**STATICALLY ASSESSED — NOT EXPLOITED** unless production data independently
demonstrates the behaviour, which is stated where it applies.

---

# P0 — none

No cross-user private-data access for students or buddies, no privilege
escalation path, no payment bypass, no secret exposure, no arbitrary
webhook-controlled *privileged* mutation.

**Two P0 candidates were investigated and cleared:**

* **Committed service-role key** — `setup-supabase.sh/.bat` match the Supabase
  JWT header pattern. Decoding found **no payload segment**: the literal is
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` with a trailing ellipsis, a
  placeholder exactly like the neighbouring `sk-ant-...`. **FALSE POSITIVE.**
* **Payment/entitlement integrity** — re-verified: all 4 real premium students
  have exactly one paid row. 1:1. **No defect.**

---

# P1

## P1-A · 502 session-token pairs retained indefinitely
**Route/table:** `pwa_session_handoff`
**Evidence:** 502 rows · **502 with payload** · oldest **12 July** · **0 live,
494 expired-unused, 8 used** · no purge job anywhere in `src` or `supabase`.
**Attack path:** any exposure of the database *and* the service-role key —
a backup, a replica, a compromised env — yields 502 AES-256-GCM blobs whose key
is `sha256(SUPABASE_SERVICE_ROLE_KEY)`, each containing a Supabase access +
refresh token pair.
**Impact:** session resurrection for up to 502 accounts.
**Exploitability:** requires prior compromise. **Not remotely reachable.**
**Why P1 anyway:** the payload is needed for 15 minutes and has been kept for 6
weeks; the exposure is pure liability with **1.6% utilisation** (8 of 502
consumed). This is the cheapest large risk reduction available in the codebase.
**UNKNOWN — NOT PROVABLE:** whether those refresh tokens are still redeemable.
Supabase refresh tokens rotate on use and carry no wall-clock expiry; testing
one means using it, which I will not do.
**Fix:** delete rows past `expires_at`; null the payload on burn.
**Test:** a guard asserting no row retains a payload past expiry.

## P1-B · A sales rep can claim any person in the system
**Route:** `POST /api/sales/log`
**Evidence:** body validation is `typeof studentId === 'string'` — no uuid
check, no `role='student'` check, no sales-ready check. `claim_lead` then
INSERTs a `lead_outreach` row for that id. **`sales_activity` has no foreign
key on `student_id`** (constraint list: `pkey`, `status_check` only).
**Attack path:** authenticated rep POSTs `{studentId:"<admin uuid>", outcome:
"interested", note:"x"}`.
**Impact:** any person — including the admin — becomes her owned lead with
fabricated history. A non-existent uuid also persists.
**Exploitability:** **HIGH for an authenticated rep.** One rep account exists
today. **STATICALLY ASSESSED — NOT EXPLOITED.**
**Fix:** validate uuid + role + non-test; add the missing FK.
**Test:** forged-studentId test; non-student rejection test.

## P1-C · A rep can read any student
**Route:** `/sales/student/[id]`
**Evidence:** `requireSales()` then `getSalesConversionView(admin, id)` with the
raw URL id. `leadVisibleTo(owner, repEmail)` exists in
`lib/sales-disposition.ts` and **is not called here**.
**Impact:** name, phone, WhatsApp number, premium state, momentum, prep
breakdown and last 20 activities for **any profile** — another rep's lead, a
buddy, the admin.
**Mitigation that does NOT apply:** the UI has no link to it. Per the ruling,
that is not authorization.
**Exploitability:** HIGH for an authenticated rep, trivial (change a URL).
**Fix:** resolve ownership server-side; call the helper that already exists.
**Test:** cross-rep IDOR test.

## P1-D · A vendor callback selects which student row is written
**Routes:** `/api/expedify/outcome`, `/api/expedify/callback`
**Evidence:** both resolve identity as
`.in('phone', phoneVariants(phone)).limit(1).maybeSingle()`. The outbound
payload in `lib/expedify.ts` contains **no CareerRai identifier** — `studentId`
is in the TypeScript interface and deliberately omitted from the request body.
**Attack path:** anyone holding the shared secret posts any phone; that
student's `expedify_status` and `call_feedback` are overwritten. An ambiguous
phone is resolved arbitrarily and silently.
**Impact:** vendor-chosen mutation of student CRM state.
**Production evidence that the class is real:** 236 events all landed on the
**admin** profile because the vendor sent one constant phone.
**Fix:** `external_ref` correlation; missing or ambiguous ⇒ UNMATCHED, never a
phone guess.
**Test:** vendor-identity test; ambiguity test.

## P1-E · Privileged mutations are unaudited
**Evidence:** `admin_audit_log` = **9 rows** across 16 Jun–23 Aug, three action
types (`assign_buddy`, `retry_unlock`, `revoke_scholarship`), **one writer**
(`src/lib/audit.ts`). `src/lib/premium.ts` contains **no audit call**.
**Impact:** "who granted this student premium / changed this payment state /
assigned this lead" is **not answerable**. `delete_student_account` is a
`SECURITY DEFINER` function with no audit row.
**Exploitability:** not an attack — an **investigative** failure. It becomes an
attack enabler because a malicious privileged action leaves no trace.
**Fix:** audit at the mutation boundary, starting with premium grant/revoke.
**Test:** a guard asserting every privileged mutation writes an audit row.

---

# P2

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| **P2-1** | Handoff encryption key **is** the service-role key (`sha256` of it) | `session-handoff-crypto.ts` | Accept and document, or use a distinct key. Encryption defends a DB-only leak, **not** service-role compromise |
| **P2-2** | Expedify secret accepted in the **query string** (`?key=`) | `/api/expedify/outcome` | header only — already supported |
| **P2-3** | `/api/push/received` anonymously updates `profiles.push_verified_at` | uuid-keyed body | bind to the notification's own user |
| **P2-4** | `actor` / `owner` are unconstrained text with no FK | `sales_activity`, `lead_outreach` | `actor_id`/`owner_id` → `profiles.id` |
| **P2-5** | Staff identity collapses when email is absent — `actor = email ?? full_name ?? 'sales'`, scoping falls back to `'__none__'` | **the admin already has no email** | `profiles.id` as the key |
| **P2-6** | `/api/admin/leads-export` — 25+ columns, all students, no rate limit, **no audit row** | route read | log to `admin_audit_log` |
| **P2-7** | **No CSP, no Permissions-Policy** | `next.config.ts`, deliberate and documented | re-take the decision; low value today (one static XSS sink), high value as containment |

---

# P3

| ID | Finding | Note |
|---|---|---|
| P3-1 | Handoff burn is read-then-write, not atomic | both requests establish the *same* session for the *same* user — bounded |
| P3-2 | `/api/install/handoff` uses `auth.getSession()` not `auth.getUser()` | cookie not re-verified; forged tokens fail later at `setSession`, so not an escalation |
| P3-3 | `/api/push/{click,app-open}` anonymously update `notifications` | uuid is the only gate; corrupts delivery analytics |
| P3-4 | `/api/funnel` accepts an attacker-supplied `anon` | pre-signup funnel numbers are **attacker-influenceable** and must be labelled |
| P3-5 | `/api/cat-leads` IP cap **fails open** on unknown IP | documented in the route |

---

# ATTACKS TESTED AND FOUND NOT EXPLOITABLE

| Attack | Result | Why |
|---|---|---|
| Student → another student's data | **BLOCKED** | `profiles` RLS self-only; 87/87 tables RLS-on |
| Student alters own premium/subscription | **BLOCKED** | client write grants revoked; `guard_privileged_profile_columns` trigger with pinned `search_path` |
| Buddy → another buddy's student | **BLOCKED** | `buddy_id === user.id` → 403 |
| Chat participant → another thread | **BLOCKED** | participant check, **404 not 403** |
| Rep → another rep's ownership | **BLOCKED** | `claim_lead` refuses an owned lead; reassign admin-only |
| Concurrent double assignment | **BLOCKED** | single atomic statement, guard in the `WHERE` — **verified from the function body** |
| Razorpay webhook forgery | **BLOCKED** | HMAC verified before any state change |
| OTP flood | **BLOCKED** | `claim_otp_send_slot(phone, ip)`, atomic, `SECURITY DEFINER`, pinned |
| Unauthenticated AI cost abuse | **BLOCKED** | no unauthenticated route reaches a Gemini call |
| Prompt injection → data exfiltration | **BLOCKED** | the model has **no tools, no function calling, no DB and no network access**; output is rendered as text, and the app's only `dangerouslySetInnerHTML` is a static constant |
| `search_path` hijack of definer functions | **BLOCKED** | 18 of 18 pinned |
| Committed secrets | **NONE** | see P0 |

---

# WEBHOOK REPLAY — the one finding that is not theoretical

`expedify_events_dedupe_key_key UNIQUE (dedupe_key)` exists.
`dedupe_key` is **NULL on 239 of 239 rows**, and Postgres permits unlimited
NULLs in a unique index.

**Result: 220 duplicate deliveries of the same payload landed on 12 August.**
The protection is present in the schema and inert in practice. **PROVEN
VULNERABLE — demonstrated by production data, not by me.**
