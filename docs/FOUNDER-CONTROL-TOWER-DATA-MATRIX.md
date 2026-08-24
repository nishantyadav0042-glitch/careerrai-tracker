# Founder Control Tower — data observability matrix

**23 Aug 2026 · READ-ONLY.** No UI designed. This answers only one question:
**for each thing the founder wants to see, does the evidence exist?**

Legend — every cell is one of:
**PROVEN** · **PROVEN MISSING** · **NOT INSTRUMENTED** · **UNKNOWN — EVIDENCE
UNAVAILABLE** · **CONTRADICTED BY DATA**

`Reliable?` means: could a hostile or careless actor make this number wrong?

---

# A. SALES

| Founder question | Data exists? | Reliable? | Historical? | Actor? | Timestamp? | Source | UI possible now? |
|---|---|---|---|---|---|---|---|
| 1 New leads today | **PROVEN** | yes | yes | n/a | `created_at` | `profiles` | **YES** |
| 2 Where they came from | **CONTRADICTED BY DATA** | — | — | — | — | `signup_source`: 696/771 `self_serve`, 75 null, **0 campaigns** | NO — would render one bucket |
| 3 Unassigned leads | **PROVEN MISSING** | — | — | — | — | `lead_outreach` = 0 rows | NO |
| 4 Who owns each lead | **PROVEN MISSING** | — | — | — | — | 0 owned | NO |
| 5 Leads per salesperson | **PROVEN MISSING** | — | — | — | — | 0 | NO |
| 6 How many contacted | **PROVEN MISSING** | — | — | — | — | `sales_activity` = 0 | NO |
| 7 Calls made | **NOT INSTRUMENTED** | **no — self-reported** | — | text actor | yes | no telephony record anywhere | NO |
| 8 WhatsApp/SMS/email sent | **NOT INSTRUMENTED** | — | — | — | — | `wa.me` link only; no send record | NO |
| 9 Follow-ups due today | **PROVEN MISSING** | — | — | — | — | derivable from `next_action_at`, 0 rows | NO |
| 10 Overdue | **PROVEN MISSING** | — | — | — | — | same | NO |
| 11 Which rep is behind | **PROVEN MISSING** | — | — | — | — | and `/admin/sales-performance` reads `reps[0]` | NO |
| 12 Leads with no action | **PROVEN** (vacuously — all 445) | yes | — | — | — | `student_engagement.sales_ready` | **YES** |
| 13 Contacted but not followed up | **PROVEN MISSING** | — | — | — | — | 0 | NO |
| 14–16 Hot / likely / going cold | **PROVEN** | yes | yes | n/a | yes | `buildCallQueue` conv score + momentum | **YES** |
| 50 Revenue per rep | **PROVEN MISSING** | — | — | — | — | **0 of 5 paid customers have any sales attribution** | NO |
| 52 Avg time to first contact | **PROVEN MISSING** | — | — | — | — | 0 | NO |
| 56–67 Distribution (see, select, assign, bulk, reassign, history) | **PROVEN MISSING** | — | partial | — | — | reassign API exists, **no UI**; and it rejects the founder | NO |

**Sales verdict: of 30+ sales questions, 4 are answerable today.**

---

# B. STUDENTS

| Founder question | Data exists? | Reliable? | Historical? | Actor? | Timestamp? | Source | UI now? |
|---|---|---|---|---|---|---|---|
| 17 When registered | **PROVEN** | yes | yes | n/a | yes | `profiles.created_at` | **YES** |
| 18 Acquisition source | **CONTRADICTED BY DATA** | — | — | — | — | 0 campaigns attributed | NO |
| 19 Device/platform | **PROVEN** | partial | yes | n/a | yes | `student_events.platform/browser`, `signup_device` | **YES** |
| 20 What they did in the app | **PROVEN, partial identity** | yes | yes | student | yes | `student_events` 165,861 rows | **YES, with a stated ceiling** |
| 21 Pages/screens visited | **PROVEN, 55% identified** | yes | yes | student | yes | `screen_view`/`screen_exit` 38,160 | YES, labelled |
| 22 Important actions | **PROVEN, 100% identified** | yes | yes | student | yes | `daily_log`, `log_submitted`, `buddy_unlock_open` | **YES** |
| — Taps | **PROVEN, 31% identified** | yes | yes | partial | yes | `tap` 94,888 rows | **YES, must show coverage** |
| 23 Prep/progress status | **PROVEN** | yes | yes | student | yes | `daily_reports`, `topic_coverage` (36,205), `streak_data` | **YES** |
| 24 Viewed paywall | **NOT INSTRUMENTED** | — | — | — | — | **0 events** | NO |
| 25 Opened checkout | **NOT INSTRUMENTED** | — | — | — | — | **0 events** | NO |
| 26 Created a payment order | **PROVEN** | yes | yes | student | yes | `student_payments` 30 rows | **YES** |
| 27 Paid | **PROVEN** | yes | yes | Razorpay | `paid_at` | `student_payments.status='paid'` — 5 | **YES** |
| 28–39 Sales relationship | **PROVEN MISSING** | — | — | — | — | 0 rows | NO |
| — Mentor involved | **PROVEN** | yes | yes | buddy | yes | `profiles.buddy_id`, `coaching_sessions` (77), `chat_messages` (146) | **YES** |
| — Pre-signup behaviour | **PROVEN MISSING** | — | yes | **0% identified** | yes | `funnel_events` 14,083, `anon_id` only | NO — cannot attach to a person |

---

# C. REVENUE

| Question | State | Evidence |
|---|---|---|
| Checkout starts | **NOT INSTRUMENTED** | 0 events |
| Payment attempts | **PROVEN** | 30 orders |
| Success | **PROVEN** | 5 paid |
| Abandonment | **PROVEN as a count, MISSING as a cause** | 24 abandoned; cannot split "never saw Razorpay" from "saw it and left" |
| Refunds | **PROVEN** (path exists) | `refund_requests` (0 rows), webhook refund branch, `revokePremium` |
| Revenue | **PROVEN** | paid ledger |
| Source attribution | **CONTRADICTED BY DATA** | 0 campaigns |
| Salesperson attribution | **PROVEN MISSING** | **0 of 5** |
| **Canonical "paying customer"** | **PARTIAL** | `student_payments.status='paid'` is canonical and guard-tested (`sales-won.guard`). But `is_premium` (8) and `subscription_status` are independent and disagree for ≥1 student (PAY-01). **Two fields answer "is this student paid".** |

---

# D. SECURITY / OPERATIONS

| Question | State | Evidence |
|---|---|---|
| Failed auth | **PROVEN** | `login_attempts` 187, `otp_send_events` 1,120 |
| Suspicious requests | **PROVEN** | `security_events` 1,803 |
| **Privileged actions** | **PROVEN MISSING** | `admin_audit_log` = **9 rows, 3 action types, one writer.** Premium grant/revoke, payment state, lead assignment, coupon use, account deletion write **nothing** |
| Webhook failures | **PARTIAL** | `integration_audit_log` 51 rows; unmatched vendor events are stored but **never surfaced** |
| Server errors | **PARTIAL** | `client_errors` 221 rows — **no alerting path exists from it** |
| Cron health | **PROVEN** | `cron_runs` 398 rows, 18 jobs tracked |
| Incidents | **NOT INSTRUMENTED** | canonical error system designed, not built |

---

# E. THE DATA-QUALITY LAYER — the only one fully renderable today

All 16 checks return a real number right now (definitions in
`SALES-IDENTITY-CONTRACT.md` §5):

```
students without phone                       41   (39 non-test)
duplicate phone (exact / last-10)             0 / 0
malformed phone                               0
non-canonical stored format                  65
leads without owner                           0  (of 0)
owner refs unresolvable                       0  (of 0)
activity actor unresolvable                   0  (of 0)
staff without email                           1   ← the admin
Expedify events UNMATCHED                     3
Expedify events matched to a NON-student    236   ← the whole vendor defect
orphan lead_outreach / sales_activity          0 / 0
legacy cat_test_leads                          7
legacy student_crm                           684
external id mapped to >1 student             n/a  (no external id column exists)
```

---

# F. THE RENDERING CONTRACT

Because `lead_outreach = 0` means *"the CRM has no recorded activity"* and
**not** *"the team made zero calls"* — and the system has no independent
evidence either way — every empty metric must render exactly one of:

```
0 — VERIFIED ZERO ACTIVITY          (only when an observed source proves it)
NOT AVAILABLE — DATA NOT INSTRUMENTED
NOT AVAILABLE — DATA QUALITY FAILURE
UNKNOWN — SOURCE UNAVAILABLE
```

**A naked zero is forbidden.** Applying this today: every sales metric renders
`NOT AVAILABLE — DATA NOT INSTRUMENTED`, and *that is the honest Control Tower*
until the CRM carries rows.
