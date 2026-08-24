# Payment: canonical state, entitlement, and funnel instrumentation design

**READ-ONLY. Nothing changed: no code, no schema, no Razorpay config, no
deploy, `reconcile-payments` untouched.** 23 Aug 2026.
**No student names or UUIDs — the repository is public.**

---

# EXECUTIVE VERDICT

**The 8-premium-vs-5-payment discrepancy does not exist. I was wrong.**

You told me to prove it rather than assume manual grants. I did, and the
assumption was the error:

| # | premium_since | sub_status | demo | test | paid rows |
|---|---|---|---|---|---|
| 1 | 11 Jul | free | **yes** | **yes** | 0 |
| 2 | 4 Aug | active/monthly | no | no | **1** |
| 3 | 4 Aug | active/monthly | no | no | **1** |
| 4 | 9 Aug | active/tillcat | no | no | **1** |
| 5 | 23 Aug | free | no | no | **1** |
| 6 | — | free | no | **yes** | 0 |
| 7 | — | free | no | **yes** | 0 |
| 8 | — | active/monthly | **yes** | **yes** | 0 |

**Four of the eight are test/demo accounts. All four REAL premium students have
exactly one completed payment. A perfect 1:1 match.**

The fifth paid row is the 15 Jul monthly subscription, now expired — correct
behaviour, not a missing grant.

**My error:** I counted `is_premium` across *all* profiles while counting
payments across real ones. The "4 unexplained premium students" were an
artifact of my own inconsistent filtering — the exact class of mistake this
whole workstream exists to eliminate, committed by me while auditing for it.

**There is no payment/entitlement integrity defect.** `is_premium` and
`student_payments` agree completely once test accounts are excluded.

---

# PHASE A/B — THE GRANT PATHS

`is_premium` has **exactly three writers**:

| Writer | Direction | File |
|---|---|---|
| `grantPremiumAndQueueBuddy` | → true | `src/lib/premium.ts:20` |
| `revokePremium` | → false | `src/lib/premium.ts:66` |
| expiry sweep | → false | `api/cron/expire-subscriptions:41` |

**One grant function, three callers:**

| Caller | Trigger | Client can influence student_id? | Payment verified? |
|---|---|---|---|
| `lib/activate-payment.ts` | Razorpay webhook / reconciliation | **No** — from the verified order | **Yes** |
| `api/payments/create-order` | server-computed price < `MIN_CHARGE_PAISE` | **No** — `user.id` from session | **N/A — free by design** |
| `api/admin/retry-unlock` | admin action | admin-gated | manual, audited |

44 readers of `is_premium`. **One writer path, many readers** — the shape you
have been asking for everywhere else, already true here.

## The `create-order` free-grant branch — legitimate

It grants premium without Razorpay when the **server-computed** price falls
below `MIN_CHARGE_PAISE` (a 100% scholarship or coupon). Correct by design.

**A client cannot reach it by tampering.** The request body carries only
`{ plan, coupon }`:

- `plan` validated by `isPlanId`; base price from the `PLANS` constant
- coupon **validated server-side** in `resolvePrice` against the database
- scholarship is a founder grant, server-side
- campaign seat cap enforced **on the money path**, so a stale page promising
  an expired offer is still charged list price

**The client never sends a price.** Verified in `create-order/route.ts:20–65`
and `lib/pricing.ts:90`.

Evidence it has never fired: all 5 `paid` rows carry a `razorpay_payment_id`.
The free path would produce a paid row with none. **Zero such rows exist.**

---

# PHASE D — INCONSISTENCIES FOUND

| ID | Sev | Finding |
|---|---|---|
| PAY-01 | **P2** | **`subscription_status` and `is_premium` are independent.** Premium row #5 is `is_premium=true` with `subscription_status='free'` — a `session` purchase grants premium but never sets a subscription. Two fields, two answers to "is this student paid", and no code keeps them in agreement |
| PAY-02 | P3 | `reconcile-payments` never assigns `abandoned`: it reports `checked: 7, abandoned: 0` forever, re-querying Razorpay for the same 7 orders every 15 min. "Abandoned" is a state the system never actually writes |
| PAY-03 | P3 | Test/demo accounts carry `is_premium=true`, so any premium count that forgets `is_test_account`/`is_demo` overstates by 4 — **as mine did** |

**No P0 or P1.** The two systems agree on real students.

---

# PHASE G — PAYMENT SECURITY CHECKS

| Check | Result | Evidence |
|---|---|---|
| Client cannot grant premium | **PASS** | only 3 writers; all server-side |
| Client cannot modify amount | **PASS** | body is `{plan, coupon}`; price from `PLANS` + server-validated coupon |
| Client cannot substitute another student's order | **PASS** | `user.id` from session, never from the body |
| Webhook signature mandatory | **PASS** | event dropped if secret unset |
| Signature timing-safe | **PASS** | `crypto.timingSafeEqual` |
| Duplicate webhook safe | **PASS** | `'paid'` treated as duplicate delivery |
| Failed/cancelled payment cannot grant premium | **PASS** | grant only from verified capture |
| Reconciliation idempotent | **PASS** | acts only on `status='created'`; Razorpay is the authority |
| Admin/manual grants auditable | **PARTIAL** | `retry-unlock` writes `admin_audit_log`, but only 2 of 8 premium rows have audit entries |
| Webhook vs reconciliation race | **UNKNOWN** | not tested under concurrency |
| Refund/chargeback behaviour | **UNKNOWN** | `revokePremium` exists; full path not traced |
| Premium grant idempotent | **UNKNOWN** | not verified under repeat invocation |

**Three UNKNOWNs. None is "probably safe".**

---

# PHASE E — MINIMUM FUNNEL INSTRUMENTATION (specified, NOT built)

`analytics_events` already exists and is the right home — **no new table, no
DDL.** Nine events, not eleven: `ORDER_CREATE_STARTED` and `PAYMENT_VERIFIED`
add nothing the adjacent events do not already prove.

| Event | Where | Key metadata |
|---|---|---|
| `payment_paywall_view` | client | plan shown, install_source, device |
| `payment_cta_click` | client | plan, install_source |
| `payment_order_created` | server | plan, amount_paise, install_source |
| `payment_checkout_opened` | client | order_id, install_source ← **the iOS question** |
| `payment_checkout_dismissed` | client | order_id, reason |
| `payment_success` | client | order_id |
| `payment_failed` | client | order_id, provider_code |
| `payment_webhook_received` | server | order_id, event type |
| `payment_premium_granted` | server | order_id, plan |

**Idempotency key:** `(student_id, order_id, event)` where an order exists;
`(student_id, session_id, event)` before one does.

**Never in the payload:** Razorpay key/secret, signature, card data, tokens,
email, phone, name, request bodies, stack traces. `student_id` is a UUID.

**`payment_checkout_opened` is the single most valuable event.** It is the one
that splits "never saw Razorpay" (product/platform failure — the iOS
hypothesis) from "saw it and left" (price/trust/UX). Today those are one bucket
of 24, and they need opposite fixes.

---

# PHASE F — CANONICAL ARCHITECTURE

| Field | Role |
|---|---|
| `student_payments` | **CANONICAL** — the payment ledger |
| Razorpay | **EXTERNAL SOURCE OF TRUTH** — reconciliation defers to it, correctly |
| `profiles.is_premium` | **MATERIALIZED ENTITLEMENT** — derived, not canonical |
| `profiles.subscription_*` | **DERIVED**, currently able to disagree (PAY-01) |
| `analytics_events` | **OBSERVABILITY ONLY** — never an entitlement input |
| CRM labels | **DERIVED** — already correct |

**The principle, as you stated it: payment ≠ entitlement ≠ UI label.**

This system is already close. `is_premium` is a materialized view of the
ledger with one writer. What it lacks is **divergence detection** — nothing
alerts when the ledger and the entitlement disagree. That is the gap PAY-01
sits in, and it is one reconciliation query, not an architecture.

---

# WHAT I STILL CANNOT PROVE

- Whether the 24 abandonments are UX, price, trust, or platform — **no evidence
  exists either way**, which is the entire case for instrumentation.
- Whether the iOS session survives Razorpay. **Not reproduced.**
- Webhook/reconciliation race, refund path, grant idempotency (Phase G).
- Whether students reach the paywall at all: 0.8 starts/day from 762 students
  suggests the loss may be **upstream of checkout entirely**.

---

# RECOMMENDED ORDER

1. **One manual iOS test** — ten minutes, no code.
2. **Ship `payment_checkout_opened` alone** if you want a fast answer. One
   event, one line, and it splits the 24 into two populations within days.
3. The remaining eight events.
4. PAY-01 divergence check.
5. The three Phase-G UNKNOWNs.

**Not recommended: touching `reconcile-payments`.** It is the one component
demonstrably doing its job.
