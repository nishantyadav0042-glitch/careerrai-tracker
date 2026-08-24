# CareerRai — Student Success OS: Execution Blueprint

**24 Aug 2026 · Final blueprint before execution. NO CODE. NO MIGRATIONS. NO CONFIG.**
Parent architecture: `STUDENT-SUCCESS-MASTER-ARCHITECTURE.md`.

**Governing principle (founder, 24 Aug):** *the sales system is not a separate
product. It is the human operating layer sitting on top of CareerRai's Student
Success system.* Every decision below is tested against that sentence.

---

## 0. One correction to P0's scope, from the inventory

You listed "Day-2/Day-3 return mechanisms" as something to fix. **They already
exist and already fire.**

**FACT — 15 of 38 production crons are return-loop machinery:**

```
02:30  log-yesterday-reminder      04:30  onboarding-morning
14:30  daily-reminder              */30 04–15  builder-recovery
02:30  study-companion (kickoff)   05:30  study-companion (spark)
15:00  study-companion (progress)  16:00  study-companion (log)
05:00  push-recovery               06:00  session-tomorrow
04:00  renewal-reminders           hourly release-stale-sessions
```

**The return machinery is extensive and working. The channel underneath it is
what is broken.** Nine separate nudges a day are being generated, which is
*why* reachable students get ~4 pushes/day and click 1.1%.

**So P0 is not "build return triggers." P0 is:**
1. **Restore reachability** — 646 students have no channel.
2. **Reduce frequency** — the machinery is over-firing into the few who do.
3. **Verify the fallback** — email may be silently dead.

That is a smaller, sharper, cheaper P0 than the one on your list.

---

## 1. Screens — exactly what exists and what changes

### The rep sees three screens. No more.

**Screen 1 — `/sales` (Today)** *(exists — MODIFY)*
```
┌──────────────────────────────────────────────┐
│ 12 students need you today                   │
│ 6 activation · 3 going cold · 2 promised · 1 intent │
│ You: 18 of 35 active · 4 free                │
├──────────────────────────────────────────────┤
│ ● GOING COLD                    Rahul K.     │
│   Studied 5 of 7 days → 0 in last 3          │
│   Last study: 3 days ago · streak was 6      │
│   → Ask what changed. Get one topic tonight. │
│   [ Call ]  [ WhatsApp ]  [ Log outcome ]    │
└──────────────────────────────────────────────┘
```
**Change:** add `reason_category` to the log form. Nothing else.

**Screen 2 — `/sales/student/[id]` (Student 360)** *(exists — KEEP)*
14-day study strip · latest mock · coverage with source rung · their own signup
words · interaction timeline · open promises · objection playbook. **No change.**

**Screen 3 — `/sales/summary` (My outcomes)** *(exists — MODIFY)*
**Change:** replace call counts with **students recovered above baseline** and
**promises honoured %**. Calls become a small diagnostic line, not the headline.

### The founder sees one screen with five answers

**`/admin/sales/tower`** *(exists — MODIFY)*
```
1  ARE STUDENTS USING CAREERRAI?
   active loggers this week · activation % · D7 curve vs last week
2  ARE REPS IMPROVING THAT?
   recovered above baseline, by lane          [click → the students]
3  ARE STUDENTS CONVERTING?
   completed sessions      ⚠ NOT MEASURABLE until P0b
4  WHY ARE STUDENTS FAILING?
   top reason_categories, ranked, with counts [click → the students]
5  WHAT DID WE LEARN THIS WEEK?
   one paragraph, evidence + confidence + next thing to try
```

**Supporting screens that stay as they are:** `/admin/sales/capacity` (built,
read-only), `/admin/sales/quality` (12 data-quality checks), `/admin/sales`
(admin frame of the same queue), `/sales/leads` (rep's book).

**DO NOT BUILD:** any sixth screen. Any second dashboard. A student-facing
sales surface.

---

## 2. The rep's day

```
MORNING   open /sales. The list is already ordered. Read card 1.
          → open student → 20 seconds of context → call
          → log: outcome · WHAT THEY SAID (reason_category) · promise
          → next card
MIDDAY    promised callbacks surface at their promised time, automatically
EVENING   prime window 18:00–21:00 IST — best pickup
END       /sales/summary: what came of it, not how much you did
NEXT DAY  yesterday's promises are at the top. Nothing to remember.
```

**Never:** decide who to call · search for a student · remember a promise ·
fill a form longer than four fields.

---

## 3. Intervention taxonomy

**Four intervention types** (what the rep was *trying* to do):

| Type | Trigger lane | The ask |
|---|---|---|
| **ACTIVATION** | new, never logged | "one topic tonight — 25 minutes" |
| **RESTART** | going cold / broken streak | "what changed? let's restart small" |
| **DIAGNOSTIC** | opened but not logging | "what stopped you?" — listening, no ask |
| **CONVERSION** | declared mentor intent | explain the ₹299 session honestly |

**Ten reason categories** (what the *student* said — the product-intelligence
field):

```
timetable_mismatch · no_time · exam_far_away · using_other_app ·
app_confusing · never_saw_notification · content_not_relevant ·
personal_reasons · price · other(+verbatim)
```

**Why structured:** one student saying "the timetable doesn't match my plan" is
an anecdote. Thirty-seven saying it is a roadmap. **Free text cannot aggregate,
and aggregation is the entire point.**

---

## 4. Data model — one new table, everything else reused

**NEW — `intervention_ledger`** (append-only, the only new table):

```
BEFORE   student_id · rep_id · at · state · lane · flag_reason ·
         days_since_last_log · streak_at_time · prior_intervention_count ·
         tenure_days · reachable_by_push      ← separates channel from message
ACT      channel · ist_hour · weekday · intervention_type · ask_made ·
         micro_commitment (bool) · reason_category · reason_verbatim · objection
AFTER    logged_same_day · logged_d1 · logged_d3 · logged_d7 ·
         sustained_7d · streak_resumed · session_booked · session_completed ·
         dnd · silence
```

**MODIFY — `video_sessions`:** populate `started_at` / `ended_at`, which are
NULL on all 16 rows. Without this, "completed sessions" cannot exist as a
metric. **P0b.**

**REUSE, unchanged:** `profiles` · `lead_outreach` · `sales_activity` ·
`sales_followup` · `sales_rep_config` · `daily_reports` · `streak_data` ·
`topic_coverage` · `mock_debriefs` · `student_payments` · `notifications` ·
`student_events` · `admin_audit_log`.

---

## 5. KPI definitions — exact, so they cannot drift

| KPI | Definition | Class |
|---|---|---|
| **Activated** | first-ever `daily_reports` row | FACT |
| **Incremental activation** | activated after contact **minus** matched-lane uncontacted rate | INFERENCE — "associated with" |
| **Recovered** | was AT_RISK, logged within 72h of contact, **and sustained 7d** | FACT + INFERENCE |
| **Sustained** | ≥1 log in each of the 7 days following | FACT |
| **Completed session** | `video_sessions.ended_at IS NOT NULL` | **NOT MEASURABLE today** |
| **Promise honoured** | `sales_followup` closed by a discharging activity before `due_at` | FACT |
| **Reached** | ≥1 `sales_activity` with a connected outcome | SELF-REPORTED |
| **Unreachable** | no push subscription **and** no usable phone | FACT |

**Never a target:** calls · messages · students touched · hours online ·
HOT/WARM/COLD counts · bookings (as opposed to completions) · raw log counts
without the sustained check.

---

## 6. Experiment design

**Baseline first (P2), experiments later (P4).** You cannot measure lift
without knowing what students do unaided.

```
WEEK 1–2   observe only. No experiments. Establish per-lane natural rates
           from the ~600 uncontacted students.
WEEK 3+    lane-matched comparison: reached vs unreached, same lane, same week
LATER      A/B within a lane: two openings · two timings · call vs WhatsApp
MUCH LATER randomised holdout — ethically clean here, since we cannot reach
           most students anyway; randomising WHICH we reach withholds nothing
```

**Reporting rules, permanent:** no rate below 30 observations (show
UNAVAILABLE) · weekly and pooled, never daily per-rep · always show the
unreached column beside the reached one · label everything ASSOCIATED WITH
CONTACT.

---

## 7. Component-by-component decision

**Every sales/student-success component in the repo:**

| Component | Decision | Note |
|---|---|---|
| `call-queue.ts` (`classifyLane`, `buildCallQueue`) | **KEEP** | The one queue + lane authority |
| `sales-disposition.ts` | **KEEP** | Vocabulary = DB CHECK |
| `sales-authz.ts` | **KEEP** | Identity on `profiles.id` |
| `sales-followup.ts` | **KEEP** | Promise history |
| `sales-audit.ts` | **KEEP** | Audit trail |
| `sales-portfolio.ts` | **KEEP** | Rep's book; WON = paid ledger |
| `sales-score.ts` | **KEEP** | One conversion score |
| `sales-capacity.ts` | **KEEP** | Read-only, observation |
| `sales-data-quality.ts` | **KEEP** | 12 checks |
| `sales-conversion.ts` (Student 360) | **MODIFY** | Add `reason_category` capture |
| `sales-control-tower.ts` | **MODIFY** | Restructure to the five questions |
| `/sales/page.tsx` | **MODIFY** | Add reason field to log form |
| `/sales/summary` | **MODIFY** | Outcomes headline, calls demoted |
| `/admin/sales/tower` | **MODIFY** | Five questions + learning paragraph |
| `/admin/sales/capacity` · `/quality` · `/admin/sales` · `/sales/leads` · `/sales/student/[id]` | **KEEP** | No change |
| `notification-os.ts` (`dispatch`) | **KEEP** | Single send gate — do not fork |
| 9 daily nudge crons | **MODIFY** | **Reduce frequency.** Machinery is right, volume is wrong |
| `push-subscribe` / `push-recovery` / registry | **MODIFY** | Reachability is the P0 constraint |
| `email.ts` | **VERIFY** | May be silently stubbed — unverified |
| `video_sessions` lifecycle | **BUILD** | `started_at`/`ended_at`. P0b |
| `intervention_ledger` | **BUILD** | The only new table |
| Assignment engine (2B-2) | **PAUSED** | Five evidence triggers |
| `student_crm` dual-write · `cat_test_leads` | **DEPRECATE** | Zero readers / no consumer |
| ML scoring · 2nd dashboard · call recording · telephony · weighted capacity · teams | **DO NOT BUILD** | None is the constraint |

**Net: 1 new table, 6 modifications, 1 lifecycle fix, 0 new systems.**

---

## 8. Phased implementation

| Phase | Objective | Exit criteria |
|---|---|---|
| **P0 — Return loop** | Verify email · restore push reachability · **cut ~9 daily nudges to ~1–2** · install prompt after first log · instrument the funnel | Reachable % rising · CTR above 1.1% · funnel measurable end to end |
| **P0b — Session delivery** | payment → buddy assigned → student joins → conducted → **`started_at`/`ended_at` recorded** → feedback | **One session completed and recorded.** Non-negotiable before any conversion target |
| **P1 — Intervention ledger** | The table + `reason_category` + weekly read | Every intervention captured before/act/after |
| **P2 — Baselines** | Per-lane natural rates from uncontacted students | Every lane has a baseline with n≥30 |
| **P3 — Attribution** | Reached vs unreached weekly table | Founder can answer "did the rep help?" |
| **P4 — Experiments** | A/B openings, timing, channel | Only after P1–P3 are stable |
| **2B-2** | *paused* | Two of five triggers observed |

**Dependency rule: P0 and P0b gate everything. A rep working inside a broken
return loop measures the plumbing, not their method.**

---

## 9. Founder decisions

1. **Approve P0 + P0b before the reps start.**
2. **Verify `RESEND_API_KEY` in production** — one check; silent stub if absent.
3. **Approve cutting daily nudges from ~9 to ~1–2.**
4. **Approve `reason_category`** as a structured field (the 10 categories above).
5. **Fixed salary only, 3 months.** No commission — especially not on bookings
   when zero sessions have completed.
6. **Contact cap:** max 2 per 7 days, never 2 in 24h.
7. **Accept "completed sessions" is not a rep metric until P0b ships.**

---

## 10. The standard this is built to

> *"If I removed this salesperson tomorrow, exactly what measurable student
> behaviour would disappear — and what did we learn from having them?"*

Every element above exists to answer that. The lane-matched table answers the
first half. **The intervention ledger with `reason_category` answers the second
— and the second half is the one that compounds.**

The rep is not selling CareerRai. They are answering: **what makes a CAT
student come back tomorrow?** That answer, written into the product, is worth
more than any month's revenue they could generate.

---

**No code. No migrations. No configuration. Awaiting the seven decisions in §9.**
