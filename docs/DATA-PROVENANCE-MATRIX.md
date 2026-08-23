# Data provenance matrix

**23 Aug 2026 · READ-ONLY.** For every metric that matters: what produces it,
who the actor is, whether the system **observed** it or merely **recorded a
claim**, and what is missing.

**OBSERVED** = an independent system produced the record (payment processor,
push service, the product itself).
**CLAIMED** = a human asserted it and the system stored the assertion.

---

| Metric | Source | Event | Actor | Timestamp | Provenance | Reliability | Gap |
|---|---|---|---|---|---|---|---|
| **Revenue / paid customers** | `student_payments` | `status='paid'` | **Razorpay** | `paid_at` | **OBSERVED** | **HIGHEST** | none |
| Payment attempted | `student_payments` | order created | student | `created_at` | OBSERVED | HIGH | order creation ≠ checkout seen |
| Premium entitlement | `profiles.is_premium` | grant fn | system | — | OBSERVED | MEDIUM | **no audit row**; disagrees with `subscription_status` (PAY-01) |
| Notification delivered | `notifications` | state model | push service | yes | **OBSERVED** | HIGH | none |
| Notification opened | `notifications.clicked_at` | `/api/push/click` | **anonymous** | yes | OBSERVED-ish | **MEDIUM** | route is unauthenticated (P3-3) |
| Daily log | `daily_reports`, `student_events.daily_log` | product | student | yes | **OBSERVED** | HIGH | none |
| Study coverage | `topic_coverage` (36,205) | product | student | yes | OBSERVED | HIGH | none |
| App open / screens | `student_events` | product | student | yes | OBSERVED | **MEDIUM** | 45% / 55% identity |
| Taps | `student_events.tap` (94,888) | product | student | yes | OBSERVED | **LOW** | **31% identity** |
| Pre-signup funnel | `funnel_events` (14,083) | beacon | **anon** | yes | OBSERVED | **LOW** | 0% identity **and** attacker-influenceable (P3-4) |
| Acquisition source | `profiles.signup_source` | signup | system | yes | OBSERVED | **NIL** | 696/771 `self_serve`, **0 campaigns** |
| Mentor session | `coaching_sessions` (77) | product | buddy | yes | OBSERVED | HIGH | none |
| **Call made** | `sales_activity` | rep types it | **text actor** | yes | **CLAIMED** | **UNVERIFIABLE** | no call id, duration or recording exists |
| **Call connected** | `sales_activity.status` | rep types it | text actor | yes | **CLAIMED** | UNVERIFIABLE | same |
| **WhatsApp sent** | — | — | — | — | **ABSENT** | — | `wa.me` link only; **no send record at all** |
| SMS / email sent | — | — | — | — | **ABSENT** | — | not instrumented |
| Lead owner | `lead_outreach.owner` | `claim_lead` | **email string** | `updated_at` | CLAIMED | LOW | 0 rows; key is not `profiles.id` |
| Assignment history | `sales_activity` `reassigned` | admin | **`'admin'` literal** | yes | CLAIMED | LOW | actor unnameable |
| Follow-up due | `lead_outreach.next_action_at` | cadence engine | system | yes | derived | — | 0 rows |
| **Follow-up completed** | — | — | — | — | **ABSENT** | — | field is **overwritten**; no completion record can exist |
| Vendor call outcome | `expedify_events` | webhook | vendor | yes | **UNTRUSTED** | **NIL** | 236/236 = one test string on the admin's phone |
| Conversion | `student_payments` | ledger | Razorpay | yes | **OBSERVED** | HIGHEST | **0 of 5 linked to any sales action** |
| Rep performance | `sales_activity` | rep | text actor | yes | **CLAIMED** | **UNVERIFIABLE** | a leaderboard here ranks self-reports |
| Privileged admin action | `admin_audit_log` | one writer | admin | yes | OBSERVED | **NIL coverage** | **9 rows, 3 action types** |
| Errors | `client_errors` (221), `security_events` (1,803) | system | — | yes | OBSERVED | MEDIUM | **no alerting path from `client_errors`** |
| Cron health | `cron_runs` (398) | tracker | system | yes | OBSERVED | HIGH | none |

---

# THE ONE RULE THAT FALLS OUT OF THIS TABLE

Every commercially meaningful **sales** metric is **CLAIMED**. Every
commercially meaningful **product and money** metric is **OBSERVED**.

> **A rep leaderboard built on `sales_activity` ranks self-reports and is
> gameable by construction. The only sales number that cannot be gamed is the
> one already encoded in `summarizePortfolio`: WON = a paid ledger row, never
> the typed `converted` disposition.**

Therefore provenance is not a column to add later. **It is the precondition for
the Team layer of the Control Tower existing at all**, and any surface that
mixes CLAIMED and OBSERVED rows without labelling them is producing a number
the founder cannot act on.
