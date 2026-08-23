# Sales Phase 2 — Security Stops 2 and 2b

**23 Aug 2026 · READ-ONLY. IMPLEMENTED: NONE.** No route, schema, migration,
test, UI, cron or vendor code was changed. Only this document is committed.

---

# 1. SCOPE

Exactly two things, as instructed:

* **Stop 2** — `/sales/student/[id]`: does authentication without ownership
  allow a rep to reach another rep's student?
* **Stop 2b** — sales identity: every place a salesperson is identified, and
  what one canonical identity should be.

Everything else is explicitly out of scope and untouched (§16).

---

# 2. EXACT ROUTES / FILES / FUNCTIONS INSPECTED

| Path | Role |
|---|---|
| `src/app/sales/layout.tsx` | gate for the whole workspace |
| `src/app/sales/page.tsx` | queue, derives `repEmail` |
| `src/app/sales/leads/page.tsx` | own book |
| `src/app/sales/summary/page.tsx` | own stats |
| `src/app/sales/student/[id]/page.tsx` | **the route under test** |
| `src/lib/admin-auth.ts` → `requireSales`, `readRole`, `homeForRole` | auth |
| `src/lib/sales-conversion.ts` → `getSalesConversionView` | the data query |
| `src/lib/momentum.ts` → `getStudentMomentum`, `loadSignals` | **decisive** |
| `src/lib/sales-disposition.ts` → `leadVisibleTo` | visibility rule |
| `src/lib/call-queue.ts` | the only caller of `leadVisibleTo` |
| `src/lib/sales-portfolio.ts` | `getRepPortfolio`, `getRepCallStats` |
| `src/components/sales-log.tsx` → `QuickLog` | the write trigger |
| `src/app/api/sales/log/route.ts` | the only API the sales role may call |
| `src/app/api/admin/reassign-lead/route.ts` | ownership transfer |
| `pg_policy` on `profiles`, all 87 tables | RLS reality |

**Complete surface reachable by the `sales` role** (enumerated by grepping
every role check in `src/app` and `src/lib`):
`/sales`, `/sales/leads`, `/sales/summary`, `/sales/student/[id]`,
`POST /api/sales/log`. Nothing else. `requireAdmin` rejects `sales`;
`student/layout.tsx` redirects any non-student role; `requireBuddy` rejects it.

---

# 3. CURRENT AUTHORIZATION FLOW — `/sales/student/[id]`

```
GET /sales/student/<id>
 ├─ layout: requireSales()
 │    getAuthUser() → 401? redirect /login
 │    readRole(admin, user.id)  ← retries once, THROWS on unreadable read
 │    role ∉ {sales, admin} → redirect homeForRole(role)
 ├─ page:  requireSales()   (again — defence in depth)
 ├─ page:  admin.from('profiles').select('role, email').eq('id', user.id)
 │            → assigned to `me`
 │            → **`me` IS NEVER READ AGAIN** (line 18; the only other match in
 │               the file is the substring in `wa.me/`)
 └─ page:  getSalesConversionView(admin, id)      ← `id` straight from the URL
```

**There is no ownership check.** The rep's own identity is fetched and
discarded: the data needed to authorize is literally in scope on line 18 and
never used.

## What `getSalesConversionView` actually queries

```ts
admin.from('profiles').select('id, full_name, phone, is_premium, buddy_id,
  is_repeater, is_working_professional, push_subscription').eq('id', id).single()
getStudentMomentum(admin, id)
admin.from('student_engagement')…eq('student_id', id)
admin.from('sales_activity').select('created_at, actor, status, note')…limit(20)
admin.from('lead_outreach').select('status')…
…plus topic coverage for the prep breakdown
if (!p || !momentum) return null            ← the whole gate
```

`admin` is `createAdminClient()` — **service-role, RLS bypassed.**

---

# 4. CURRENT IDENTITY FLOW

Enumerated exhaustively. **A salesperson is identified five different ways:**

| # | Site | Expression | Fallback when email is NULL |
|---|---|---|---|
| 1 | `sales/page.tsx:19` | `role==='sales' ? (email ?? null) : undefined` | **`null` → oversight frame** |
| 2 | `sales/leads/page.tsx:30` | `(me?.email as string) ?? '__none__'` | `'__none__'` → empty book |
| 3 | `sales/summary/page.tsx:12` | `(me?.email as string) ?? '__none__'` | `'__none__'` → empty stats |
| 4 | `api/sales/log:45` | `email ?? full_name ?? 'sales'` | **a name, or the literal `'sales'`** |
| 5 | `api/admin/reassign-lead:52` | `email ?? 'admin'` | the literal `'admin'` |

Storage: `lead_outreach.owner text` · `sales_activity.actor text`. Both
unconstrained, neither with a foreign key.

**Five expressions, four different null behaviours, one of which grants
privilege.** No expression uses `profiles.id`.

---

# 5. EXPLOITABILITY ANALYSIS

## 5.1 — A CORRECTION TO MY OWN P1. Tracing the query narrowed it.

I previously wrote that a rep could open *"any profile — another rep's lead, a
buddy, the admin."* **That is wrong.** `getStudentMomentum` → `loadSignals`:

```ts
admin.from('profiles').select(…)
  .eq('role', 'student')
  .not('is_test_account', 'is', true)
  .not('is_demo', 'is', true)
```

`getStudentMomentum` returns `null` for any id absent from that map, and
`getSalesConversionView` returns `null` when momentum is null, so the page
renders **"Student not found."**

**Corrected scope — the four cases asked for:**

| Case | Result | Why |
|---|---|---|
| (a) own student | **ACCESS** | in the roster |
| (b) **another rep's student** | **ACCESS — the vulnerability** | roster membership is the only test; ownership is never consulted |
| (c) unassigned student | **ACCESS** | same — and this one is arguably correct under the shared-book model |
| (d) arbitrary / nonexistent UUID | **DENIED** — "Student not found" | not in the roster |
| (extra) buddy / admin / another rep's **profile** | **DENIED** | `role='student'` filter |
| (extra) test / demo account | **DENIED** | `is_test_account` / `is_demo` filters |
| (extra) malformed UUID | **DENIED** — same message | PG `22P02`, error discarded, `p` null |

**So the real exposure is cross-rep access to the 763 real students — not
arbitrary profile access.** Still P1; materially narrower than I stated.

**Incidental good property:** all four denial causes return one identical
message, so there is no oracle distinguishing "does not exist" from "is not a
student". That was not designed — it falls out of `if (!p || !momentum)` — and
it should be preserved deliberately rather than by luck.

**Incidental bad property:** a malformed UUID and a genuine absence are also
indistinguishable *to us*. The `.single()` error is discarded, so a database
failure renders "Student not found" — the exact class of defect
`docs/ENGINEERING-MEMORY.md` exists to prevent.

**What is disclosed on a successful cross-rep read:** full name, phone,
WhatsApp number, premium status, buddy status, conversion score, tier,
momentum, reachability, symptom list, per-section prep breakdown, a generated
pitch, **and the last 20 `sales_activity` rows including another rep's notes**.

## 5.2 — Stop 2b: the NULL-email oversight bypass

```ts
export function leadVisibleTo(owner, repEmail?) {
  if (!owner || !repEmail) return true;
  return owner === repEmail;
}
```

`sales/page.tsx` passes `null` when a `sales`-role profile has no email, so
**every claimed lead becomes visible** — the admin oversight frame, granted by
absence rather than by authorization.

**Reachability:** the one `sales` account has an email today, so this is
latent. **The `admin` account has no email**, which proves the null case is not
hypothetical for this schema; the same absence on a sales row grants privilege.

**Asymmetry worth naming:** sites 2 and 3 fail *closed* on the same input
(`'__none__'` matches nothing → empty book). Site 1 fails *open*. **The same
missing field produces both an empty screen and full oversight, depending on
which page you open.**

## 5.3 — Not exploitable, verified

* `POST /api/sales/log` cannot be used to *read* another rep's student.
* `claim_lead` still refuses a lead owned by someone else (atomic, unchanged).
* No RLS bypass is needed — there is none to bypass (§9).
* No alternate route: the sales role reaches five surfaces, and only this one
  takes a student id from the URL.

---

# 6. P0 / P1 ASSESSMENT

| ID | Sev | Finding | Exploitability |
|---|---|---|---|
| **SEC-S2** | **P1** | `/sales/student/[id]` — authenticated cross-rep IDOR over 763 real students, including another rep's private notes | **HIGH for an authenticated rep** — change a URL. STATICALLY ASSESSED — NOT EXPLOITED |
| **SEC-S2b** | **P1** | NULL-email sales profile receives the oversight frame | **latent**; one field on one row separates a rep from full visibility |
| **SEC-S2c** | P3 | `.single()` error discarded — a DB failure renders "Student not found" | not an attack; a truth-boundary violation |
| **SEC-S2d** | P3 | `me` is read and never used | dead code that *is* the missing authorization input |

**P0: 0. P1: 2.**

---

# 7. MINIMUM REMEDIATION (specified, NOT implemented)

**Design rule:** authorization resolves from the authenticated `profiles.id`.
A missing email, phone or name must never change an authorization outcome.
**FAIL CLOSED.**

### R1 — one authority for "may this actor see this lead"
A single server-side function, `profiles.id`-keyed, called by the detail route
*and* the queue. Not a second copy of `leadVisibleTo`: **the existing helper is
correct for the shared-book rule and must be re-keyed, not duplicated** —
`owner_id: string | null, actorId: string, actorRole: 'sales' | 'admin'`.

| Input | Result |
|---|---|
| actor role `admin` | ALLOW (explicit, never via a null) |
| `owner_id` null (unclaimed) | ALLOW — shared-book, preserved deliberately |
| `owner_id === actorId` | ALLOW |
| `owner_id !== actorId` | **DENY** |
| actor identity unresolvable | **DENY** — never ALLOW |

### R2 — detail route
Resolve the actor from `requireSales()` (which already returns `user`), read
`lead_outreach.owner_id`, call R1, and on DENY render the **same** "Student not
found" surface — preserving §5.1's no-oracle property.

### R3 — retire the five identity expressions
Replace all five with the authenticated `profiles.id`. **`'__none__'`,
`'sales'`, `'admin'` and the bare `null` all disappear.** Until §8 lands,
`repEmail` must be derived *fail-closed*: an unresolvable rep gets an empty
frame, never an oversight frame.

**R2 and R3's fail-closed form need no schema change and can ship alone.**
R1's clean form wants `owner_id`, which is §8.

---

# 8. DATABASE IMPLICATIONS

**Backfill requirement, calculated rather than assumed — re-queried this hour:**

```
lead_outreach   0 rows   → owner  → owner_id  : 0 rows to map, 0 ambiguous
sales_activity  0 rows   → actor  → actor_id  : 0 rows to map, 0 ambiguous
```

**The migration is `ADD COLUMN` + FK + index. There is no backfill and no row
to guess.** The email columns may be dropped in the same migration because no
row depends on them — but §16 keeps them until every reader is migrated and
verified, per the discipline already agreed.

Also required and independent: **`sales_activity` has no FK on `student_id`**
(constraints are `pkey` + `status_check` only). That belongs to Stop 1, not
here, and is named so it is not lost.

**No DDL was written or applied. Production is untouched.** When authorised the
migration is built and verified on `careerrai-test` (`endycmkdphymmhzniaih`)
first, and reported before production.

---

# 9. RLS IMPLICATIONS

`profiles` carries six policies: admin-all (`is_admin(auth.uid())`),
buddy-reads-their-students, and four self-only. **There is no policy for the
`sales` role.** All sales tables are RLS-on with **zero** policies.

Two consequences:

1. A rep's browser client can read only her own row — **the client boundary is
   already tight**, and no RLS change is needed for these two stops.
2. Every rep-visible datum arrives through a server component holding
   service-role, which **bypasses RLS entirely**. **Route code is the only
   authorization layer that exists for sales.** These fixes are therefore not
   defence-in-depth; they are the defence.

**Recommendation: do not add sales RLS policies now.** They would be dead
weight under a service-role client and would create a second, divergent
authorization model — the exact duplication this workstream removes.

---

# 10. RED-TEAM CASES

| # | Attack | Today | After R1–R3 |
|---|---|---|---|
| 1 | URL IDOR to another rep's student | **SUCCEEDS** | DENY |
| 2 | NULL-email bypass to oversight | **SUCCEEDS (latent)** | DENY — identity from `profiles.id` |
| 3 | Spoofed `studentId` in the log body | claims any *profile* | Stop 1, not this phase |
| 4 | Unassigned student access | succeeds — **intended** (shared book) | ALLOW, deliberately |
| 5 | Arbitrary/nonexistent UUID | denied | denied |
| 6 | Malformed UUID | denied (by accident — discarded error) | denied (explicitly) |
| 7 | Admin-vs-sales confusion | admin passes `requireSales` — **correct**, but oversight also reachable via a null | admin allowed only by explicit role |
| 8 | Privilege escalation via request body | no body on this route | unchanged |
| 9 | Alternate route to the same data | **none** — sales reaches five surfaces, one takes a URL id | unchanged |
| 10 | Direct DB access as sales | **impossible** — no sales RLS policy, client grants revoked | unchanged |
| 11 | Rename/change email to steal a book | **plausible today** — ownership is an email string | impossible — uuid |
| 12 | Two staff with no email collide into one actor | **possible** (`'sales'`, `'__none__'`) | impossible |

---

# 11. TESTS REQUIRED (specified, not written)

1. Rep A → Rep B's student ⇒ denied, and the response is byte-identical to
   "not found" (no oracle).
2. Rep A → own student ⇒ allowed.
3. Rep A → unassigned student ⇒ allowed (pins the shared-book decision).
4. Rep with NULL email ⇒ **no oversight frame**; sees unclaimed + own only.
5. Admin ⇒ sees everything, and only because role is `admin`.
6. Actor unresolvable ⇒ DENY (fail-closed).
7. Nonexistent / malformed UUID ⇒ denied, same surface.
8. **Guard test:** no sales module may key a person by email or phone. It must
   resolve through helpers — the population-read guard missed `dispatch()`-
   mediated writes exactly that way.
9. Regression: `call-queue` still calls the visibility helper
   (`sales-claim.guard.test.ts` already asserts this — must keep passing).

---

# 12. PRODUCTION MIGRATION PLAN

R2 and R3 are code-only: no migration, no data change, deploy and verify by
reading `/sales` as each role.

§8's columns, when authorised: inspect schema → prove readers/writers/triggers/
grants → write migration + tests → apply to `careerrai-test` → verify → report →
only then production. **Old columns are not dropped until every reader is
migrated and verified.**

---

# 13. ROLLBACK PLAN

R2/R3: `git revert` — no state to unwind.
§8 columns: `DROP COLUMN` — **zero rows means nothing is lost.**
No destructive operation is proposed. `student_crm` and `cat_test_leads` are
untouched.

---

# 14. ACCEPTANCE CRITERIA

1. Rep A cannot load Rep B's student by URL; denial is indistinguishable from
   "not found".
2. Authorization never consults email, phone or name.
3. A rep whose identity cannot be resolved gets **less** access, never more.
4. Admin oversight is granted by role only.
5. Unclaimed leads remain visible to every rep (documented, tested).
6. `call-queue`'s existing guard still passes.
7. Tests 1–9 green.
8. Production check: read `/sales` as rep and as admin; confirm the frames
   differ for the right reason.

---

# 15. EXPLICIT UNKNOWNS

1. **Whether cross-rep access was ever used.** No page-view telemetry exists on
   `/sales/*`. **UNKNOWN — NOT PROVABLE FROM CURRENT SYSTEM.** With one rep
   account and zero `sales_activity` rows, there is no evidence either way, and
   I will not present the absence as proof of non-occurrence.
2. Whether unclaimed-lead visibility should stay shared or become
   assignment-only. Encoded as SA-1D; **a product decision, not a security
   one.** I preserve current behaviour and flag it.
3. Whether a second `sales` account will exist soon — it determines whether
   SEC-S2 is latent or live.
4. Whether any non-`sales`, non-`admin` role will ever need this route.

---

# 16. WHAT MUST NOT BE CHANGED YET

Control Tower · lead distribution · payment instrumentation · Expedify contract
· follow-up objects · `student_crm` (**do not delete — deliberate slice-1
dual-write**) · `cat_test_leads` (**do not merge**) · B3b · `reconcile-payments`
· `claim_lead` (**atomic and correct — do not redesign**) · the queue's use of
`leadVisibleTo` (**correct; re-key, never duplicate**) · per-rep conversion
rates (5 paid customers total).

---

```
VERDICT:          NOT READY

P0:               0

P1:               2
                  SEC-S2  — /sales/student/[id] cross-rep IDOR over 763 real
                            students, including another rep's notes
                  SEC-S2b — NULL-email sales profile receives the admin
                            oversight frame

PHASE 2:          PASS  (trace + red-team complete; one prior finding corrected
                        and narrowed by tracing the actual query)

IMPLEMENTED:      NONE

NEXT DEPENDENCY:  Authorization for R2 + R3 — resolve the actor from the
                  authenticated profiles.id and fail closed — as code-only
                  changes with tests, before any schema work.
```
