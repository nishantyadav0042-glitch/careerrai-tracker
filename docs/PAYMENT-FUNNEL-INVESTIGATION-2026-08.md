# Payment funnel — read-only investigation

**READ-ONLY. Nothing changed: no code, no schema, no Razorpay config, no
deploy.** 23 Aug 2026 · production `pobhpszlsozeonejtzqy`.
**No student names or UUIDs in this document — the repository is public.**

---

# EXECUTIVE VERDICT

> **There is no evidence of a payment-processing failure, and no evidence that
> any student has been charged without receiving access.**
>
> The evidence shows a **severe checkout-funnel conversion problem**: almost
> nobody starts checkout, and ~9 in 10 who do never complete it.

**Do not call this a payment bug.** The distinction matters, because the fix
for a broken pipe and the fix for an empty pipe are opposites.

---

# 1. THE NUMBERS

| | |
|---|---|
| Real students | **762** |
| Checkout attempts, all time (15 Jul – 21 Aug, 38 days) | **30** |
| → paid | **5** |
| → abandoned at Razorpay (`created`, no payment id) | **24** |
| → failed at the bank | **1** |
| Attempts per day | **0.8** |
| Last 14 days | **10 starts, 1 payment** |

## The ₹2,000/day figure does not survive contact with the data

Total **attempted** volume across all 38 days ≈ **₹45,000**. Collected ≈
**₹6,300**. ₹2,000/day is ₹76,000/month — **more than every payment anyone has
ever attempted.**

The loss is **revenue that never enters the funnel**, not revenue leaking out of
it. That is a harder problem and a more valuable one.

---

# 2. THE DECISIVE EVIDENCE — money is not being lost

`reconcile-payments` runs every 15 minutes. It takes every order still sitting
at `created` and **asks Razorpay directly** what happened — Razorpay is the
source of truth, not our webhook log.

Every run today:

```
{"errors": 0, "checked": 7, "rescued": 0, "abandoned": 0}
```

**`rescued: 0` means Razorpay confirms no payment was captured on any of them.**

So:

- **No student paid and was denied access.** ✅
- **No webhook was silently dropped.** ✅
- The safety net designed for exactly this failure **is working and should not
  be touched.**

Corroborating: `integration_audit_log` holds zero payment rows, and
`analytics_events` holds **zero events matching payment / checkout / paywall /
razorpay / upgrade / subscription**. The funnel before order-creation is
completely dark — see §5.

---

# 3. THE CRM LABEL IS CORRECT

The People tab shows "Payment pending" on 9 students. The query behind it
(`admin/people/page.tsx:47`) is `status='created'` within 14 days, excluding
premium. **Exactly 9 students match.**

It looked like "everything is failing" because the list sorts pending students
to the top, and **9 of the 10 recent checkout-starters are pending.**

**The CRM is not lying. It is reporting a 90% abandonment rate accurately.**

---

# 4. THE 30-ATTEMPT RECONSTRUCTION, BY PLATFORM

| Install source | Attempts | Paid | Rate |
|---|---|---|---|
| `browser` | 14 | 3 | 21% |
| `pwa` (installed Android/other) | 8 | 2 | 25% |
| **`ios` (installed iOS PWA)** | **6** | **0** | **0%** |
| unknown | 2 | 0 | — |

**Every one of the 24 incomplete rows has `razorpay_payment_id = NULL`** — none
reached a payment attempt that Razorpay acknowledged.

## The iOS hypothesis — and why it is NOT yet a cause

Installed iOS is the only cohort at 0. There is a plausible mechanism: a
standalone iOS PWA has its own cookie jar, and Razorpay checkout can navigate
out to Safari, where **the session does not exist**. That is precisely the
problem `install/handoff` was built to solve for login — and nobody appears to
have applied the same reasoning to checkout.

**But the statistics do not support calling it the cause:**

```
overall paid rate                = 16.7%
P(0 paid in 6 attempts by chance) = 0.335
```

**A one-in-three coincidence.** Six failures in a row at this base rate is
unremarkable. This is a hypothesis worth **one manual test**, not a rewrite.

---

# 5. THE REAL BLOCKER: THE FUNNEL IS UNOBSERVABLE

`student_payments` starts recording at **ORDER_CREATED**. Everything before it
is invisible, and the most important question lives there.

| Stage | Observable? | Source |
|---|---|---|
| PAYWALL_VIEW | **NO** | — |
| PAY_CTA_CLICK | **NO** | — |
| ORDER_CREATE_STARTED | **NO** | — |
| ORDER_CREATED | yes | `student_payments` |
| CHECKOUT_OPENED | **NO** | — |
| PAYMENT_SUCCESS / FAILED / CANCELLED | partial | Razorpay only, via reconcile |
| WEBHOOK_RECEIVED / VERIFIED | **NO** | not logged anywhere |
| PREMIUM_GRANTED | yes | `profiles.is_premium` |
| PREMIUM_VISIBLE | **NO** | — |

**Consequence:** the 24 incomplete orders are indistinguishable between:

- the student never saw Razorpay open *(product/platform failure)*
- Razorpay opened and they closed it *(price/trust/UX)*
- they tried to pay and their bank declined *(payment failure)*

**These need opposite fixes, and today we cannot tell them apart.** That, not
iOS, is the finding that should drive the next action.

---

# 6. DATA-INTEGRITY OBSERVATIONS (not payment failures)

- **8 profiles are `is_premium`; only 5 payment rows ever reached `paid`.**
  At least **4 premium students have no completed payment record** — consistent
  with manual/founder grants, which is normal for a founder-led product, but it
  means `is_premium` and `student_payments` are two different answers to
  "who has paid".
- **One paid row (15 Jul, monthly) belongs to a student who is not premium
  now** — consistent with normal expiry of a monthly plan, not a bug.
- `reconcile-payments` reports `checked: 7, abandoned: 0` on every run: orders
  are never marked abandoned, so the same 7 are re-checked against Razorpay
  every 15 minutes forever. Harmless today, wasteful, and it means "abandoned"
  is a state the system never actually assigns. **P3.**

---

# 7. WHAT I RECOMMEND, IN ORDER

1. **One manual test on an installed iOS PWA.** Ten minutes. Either the session
   survives Razorpay and back, or it does not. This kills or confirms the top
   hypothesis for the price of one test — before any code changes.
2. **Instrument the funnel** (§5), so abandonment, product failure, and bank
   failure stop being one bucket.
3. **Only then fix** whatever 1 and 2 expose.

**Not recommended: touching `reconcile-payments`.** It is the one part of this
system demonstrably doing its job.

---

# 8. WHAT I STILL CANNOT PROVE

- Whether the 24 abandonments are UX, price, trust, or platform. **No evidence
  exists either way** — that is the point of §5.
- Whether the iOS session actually breaks at Razorpay. **Not reproduced.** I
  cannot run an installed iOS PWA from this environment.
- Whether students ever reach the paywall at all. 0.8 checkout starts/day from
  762 students suggests the loss may be *upstream of checkout entirely* —
  unmeasurable today.
