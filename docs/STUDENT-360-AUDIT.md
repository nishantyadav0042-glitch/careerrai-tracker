# Student 360 — journey reconstruction audit

**23 Aug 2026 · READ-ONLY.** Can the founder reconstruct one student's complete
journey from evidence? **PARTIAL — and the boundary is exact.**

| Stage | Source table | Event | Timestamp | Actor | Identity coverage | Confidence |
|---|---|---|---|---|---|---|
| Landed (pre-signup) | `funnel_events` | `start:landed` (631) | yes | **anon_id only** | **0%** | **NONE — cannot attach to a person** |
| Onboarding wizard | `funnel_events` | 12 `start:*` steps, 14,083 rows | yes | anon_id | **0%** | NONE |
| **Lead capture** | `cat_test_leads` | 7 rows | yes | n/a | — | **ORPHANED — joins nothing** |
| Signup | `profiles` | `created_at` | yes | student | 100% | **HIGH** |
| Profile | `profiles` | 112 columns | `updated_at` | student | 100% | HIGH |
| First session | `student_events` | `app_open` (13,396) | yes | student | **45%** | MEDIUM |
| Screens | `student_events` | `screen_view`/`exit` (38,160) | yes | student | 55% | MEDIUM |
| **Taps** | `student_events` | `tap` (94,888) | yes | student | **31%** | **LOW — two-thirds unattributable** |
| Install | `student_events` | `install_*` (1,304) | yes | student | 80–89% | MEDIUM-HIGH |
| Study activity | `daily_reports` (443) · `topic_coverage` (36,205) · `streak_data` | yes | student | 100% | **HIGH** |
| Prep progress | `student_dna` (756) + `student_dna_history` (2,809) | yes | system | 100% | HIGH |
| Mentor interaction | `coaching_sessions` (77) · `chat_messages` (146) · `buddy_briefings` | yes | buddy | 100% | HIGH |
| Buddy intent | `student_engagement.buddy_cta_clicks` · `buddy_unlock_open` | yes | student | 100% | HIGH |
| **Paywall viewed** | — | — | — | — | — | **NOT INSTRUMENTED** |
| **Checkout opened** | — | — | — | — | — | **NOT INSTRUMENTED** |
| Payment order | `student_payments` (30) | `created_at` | student | 100% | HIGH |
| Payment result | `student_payments.status`, `paid_at` (5 paid) | yes | **Razorpay — OBSERVED** | 100% | **HIGHEST** |
| Subscription | `profiles.subscription_status` + `is_premium` | partial | system | 100% | **CONFLICTED — two fields (PAY-01)** |
| **Sales assignment** | `lead_outreach` | — | — | — | **0 rows** | **PROVEN MISSING** |
| **First contact / calls** | `sales_activity` | — | — | — | **0 rows** | **PROVEN MISSING** |
| **Follow-ups** | `next_action_at` (a field) | — | — | — | 0 rows, **and overwritten on completion** | **PROVEN MISSING + structural** |
| Founder outreach | `founder_outreach` (198) | yes | implicit founder | 100% | MEDIUM — a third activity log |
| Notifications | `notifications` (62,292) | yes | system | 100% | **HIGH — OBSERVED delivery state** |
| Retention | `student_events` recency, `streak_data` | yes | student | partial | MEDIUM |

---

## The three structural ceilings

1. **The anon → identified stitch does not exist.** 14,083 pre-signup funnel
   events carry only `anon_id`; `student_events` carries both `anon_id` and
   `user_id` but only 31–55% of the high-volume events have `user_id`.
   **No UI can resolve this** — it is a missing join, not a missing screen.
2. **The commercial middle is dark.** Between "opened the app" and "created an
   order" there is no paywall or checkout event. 24 abandoned orders are one
   undifferentiated bucket.
3. **The entire sales half is empty.** Assignment, contact, follow-up: 0 rows.

## What a Student 360 CAN honestly show today

Signup → device → product activity (with a coverage label) → study progress →
mentor interaction → payment order → payment result → notification delivery.

That is a real and useful timeline. **It must render the three dark stages as
`NOT AVAILABLE — DATA NOT INSTRUMENTED`, never as an empty gap** — an empty gap
reads as "the student did nothing", which is a claim the data does not support.
