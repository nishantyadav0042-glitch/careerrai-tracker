# Sales Operating System + Founder Control Tower — read-only audit

**23 Aug 2026 · READ-ONLY. No table created, no schema changed, no API changed,
no UI changed, no data migrated, no RLS touched, no payment logic touched. The
four frozen B3b money/CRM paths were read, never modified.**

Every number below comes from a query against production or from a named file.
Where something is unknown, it says UNKNOWN.

---

# THE ANSWER TO YOUR QUESTION

You asked: *"इतने दिन से तुम तीन-चार दिन से उस चीज को बनाने की कोशिश कर रहे थे,
तो क्या फायदा हुआ?"*

The honest answer is not "it's missing" and it is not "it's done".

> **The sales system was built, it is reachable from your admin panel, and it
> is completely empty. `lead_outreach` has 0 rows. `sales_activity` has 0 rows.
> Not one call has ever been logged through CareerRai.**
>
> **Meanwhile 236 real call outcomes DID arrive — from Expedify, between 7 and
> 12 August — and every single one of them was filed against ONE profile: the
> admin account, because Expedify sends the same phone number on every call
> report. Zero student call outcomes exist in this database.**

So when you open the panel and see nothing about your salespeople, the panel is
not lying to you and it is not broken. **There is nothing to show.** The work of
the last few days built the container. The calling never moved into it, and the
one pipe that carried real outcomes has been mis-keyed since the day it was
switched on.

That is the finding. Everything below is the evidence and what follows from it.

---

# PART 1 — THE EXISTING SYSTEM, RECONSTRUCTED

```
ACQUISITION
  self-serve signup ──► profiles (role='student')            771 rows
  CAT-test funnel   ──► cat_test_leads                         7 rows
  Meta / campaigns  ──► lib/attribution.ts (code exists)        0 attributed
                                                      │
QUALIFICATION                                         ▼
  /api/engagement (buddy-CTA tap, instant)  ──┐
  /api/cron/sales-ready (streak≥3, mock, d5) ─┴─► student_engagement.sales_ready
                                                              445 flagged
                                                      │
QUEUEING                                              ▼
  lib/call-queue.ts::buildCallQueue  ── the ONE queue authority
      reads lead_outreach + momentum + engagement, caps at 60/day
      renders to BOTH /admin/sales (founder) and /sales (rep)
                                                      │
OWNERSHIP                                             ▼
  claim_lead(uuid,text) RPC — atomic pull-claim on first disposition
  /api/admin/reassign-lead — admin push-reassign        ── NO UI CALLS IT
                                                      │
ACTIVITY                                              ▼
  /api/sales/log ──► lead_outreach (state) + sales_activity (history)
                                                    0 rows      0 rows
                                                      │
PARALLEL / EXTERNAL                                   ▼
  /api/cron/expedify-flush ──► Expedify vendor  ──► profiles.expedify_status
                                                            634 rows
  /api/expedify/outcome  ◄── Expedify webhook   ──► expedify_events   239 rows
                                                     student_crm      684 rows
                                                      │
PAYMENT                                               ▼
  student_payments (30 rows) ──► profiles.is_premium (8) / subscription_status
```

## Files and tables, named

| Layer | Owner | Rows in prod |
|---|---|---|
| Queue authority | `src/lib/call-queue.ts` | — |
| Disposition vocabulary | `src/lib/sales-disposition.ts` (mirrors DB CHECK) | — |
| Rep portfolio | `src/lib/sales-portfolio.ts` | — |
| Lead 360 for sales | `src/lib/sales-conversion.ts` | — |
| Sales-ready definition | `src/lib/admin-filters.ts::getSalesReadyToCall` | 445 flagged |
| Lead state | `lead_outreach` | **0** |
| Call history | `sales_activity` | **0** |
| Vendor CRM mirror | `student_crm` | 684 |
| Vendor raw events | `expedify_events` | 239 |
| Founder's own outreach | `founder_outreach` | 198 (last: 8 Aug) |
| CAT-test leads | `cat_test_leads` | 7 |
| Payment ledger | `student_payments` | 30 |

---

# PART 2 — WHAT WAS BUILT THAT YOU CANNOT SEE OR USE

## The visibility gap matrix

| Capability | DB | Backend | API | Rep UI | Founder UI | Reachable | Canonical | **Usable** |
|---|---|---|---|---|---|---|---|---|
| Lead qualification (sales-ready) | YES | YES | cron | no | `/admin/sales-queue` | YES | YES | **YES** |
| Call queue / prioritisation | YES | YES | — | `/sales` | `/admin/sales` | YES | YES | **YES** |
| Call disposition logging | YES | YES | `/api/sales/log` | YES | — | YES | YES | **YES — 0 used** |
| Lead ownership (claim) | YES | `claim_lead` RPC | in log route | implicit | — | YES | YES | **PARTIAL** |
| Lead **assignment / distribution** | YES | YES | `/api/admin/reassign-lead` | no | **NO UI** | API only | YES | **NO** |
| Follow-up cadence | YES | `planDisposition` | YES | YES | via queue | YES | YES | **YES — 0 used** |
| Rep performance | YES | YES | — | `/sales/summary` | `/admin/sales-performance` | YES | YES | **BROKEN — see 2.2** |
| Message / WhatsApp tracking | **NO** | link-open only | no | compose link | no | — | — | **NO** |
| Call recordings | NO | NO | NO | NO | NO | — | — | **NO** (declared `planned`) |
| Vendor call outcomes | YES | YES | `/api/expedify/outcome` | no | `/admin/leads/[id]` | YES | **NO** | **BROKEN — see 2.3** |
| Student product journey | YES | YES | — | partial | `/admin/student/[id]` | YES | partial | **PARTIAL** |
| Acquisition source / campaign | column | `lib/attribution.ts` | YES | no | `/admin/growth` | YES | YES | **VACUOUS — see 2.4** |
| Payment / checkout funnel | NO events | NO | NO | no | `/admin/revenue` | — | — | **NO** |

## 2.1 The panel is not hidden. It has been in your nav since 21 August.

`src/lib/admin-workspaces.ts` carries a **Sales workspace** with nine tabs:
Call queue · Leads · Performance · Buddy interest · Sales-ready · Remind to log ·
**Rep view (`/sales`)** · Call recordings *(planned)* · **Rep assignment
*(planned)***.

It is on `origin/main` (commit `a46a729`, 21 Aug) and `AdminNav` renders the
registry directly — a guard test fails the build if a page has no workspace.

**So Part 16's question — "is the thing missing, or built but disconnected?" —
has a third answer here: it is built, connected, and empty.** Two of the nine
tabs already declare your exact complaints as `planned`, with the reason
written in the file:

> `Rep assignment` — *"The owner column and the reassign API both exist; no
> admin UI calls it yet, so ownership can only move by API."*

That is your lead-distribution gap, already diagnosed on 21 Aug and left
undone.

## 2.2 `/admin/sales-performance` can only ever show one salesperson

```ts
const { data: reps } = await admin.from('profiles').select(…).eq('role','sales')…
const rep = (reps ?? [])[0];          // ← the whole team view, in one index
```

The page takes **the first sales profile and ignores the rest**. Add a second
rep tomorrow and she is invisible — not a missing feature, a structural
ceiling. It also reads `sales_activity`, which has 0 rows, so today it renders
zeros for the one rep it can see.

**Production has exactly one `role='sales'` account.** So "where are my
salespeople" currently has a literal answer: there is one, and no activity has
ever been recorded for her in this system.

## 2.3 P0 — every vendor call outcome landed on one profile

239 rows in `expedify_events`; 236 of them `call_report`, 7–12 Aug.

```
distinct students matched : 1
distinct phones in payload: 1
payload keys              : agent_summary, event, phone
matched profile role      : admin
profiles.call_feedback set: 1 of 781
```

**Expedify posts the same phone number on every call report, and it resolves to
the admin account.** `/api/expedify/outcome` matches on phone, so all 236
outcomes were merged onto one record. The payload also carries **no
disposition, no outcome, no category, no callback time** — only a free-text
`agent_summary`. So even if the phone were right, the structured fields the
leads export and the CRM card read (`disposition`, `reason_code`, `next_step`)
would still be empty.

**Consequence:** every call your team actually made between 7 and 12 August is
unattributable. Not "hard to see" — the student link does not exist in the
data. Nothing has arrived since 12 Aug.

**This is the single highest-value fix in this entire document.** It is a
webhook-contract problem with the vendor, not a dashboard problem.

## 2.4 Acquisition attribution is vacuous

| `signup_source` | students |
|---|---|
| `self_serve` | 696 |
| `(null)` | 75 |

`lib/attribution.ts` reads `utm_source`, click ids and campaign params, and
`/admin/growth` renders channels. **Zero students carry a campaign.** So "which
ad paid for this lead" cannot be answered for any student in the base. Either
the ads never carried tagged links, or the tags never survived to signup —
**UNKNOWN, and it needs a live click test to distinguish, not more code.**

---

# PART 3 — THE SALESPERSON PANEL

**It exists.** `src/app/sales/` — `layout.tsx`, `page.tsx` (Calls),
`leads/page.tsx` (My leads), `summary/page.tsx` (My summary),
`student/[id]/page.tsx` (Convert).

* Gate: `requireSales()` — `sales` **or** `admin` passes, so you can open it
  yourself at `/sales`.
* It consumes the **same** `buildCallQueue` the founder view uses, scoped by
  rep email. Admin sees everything; a rep sees unclaimed leads plus her own.
* Ownership is claimed atomically on first disposition (`claim_lead` RPC); a
  lost race returns 409 and writes nothing.
* It is linked from your nav as **Sales → Rep view**.

**Why it feels absent:** one rep account, zero logged calls, and the founder
mirror of it (`/admin/sales-performance`) hard-codes `reps[0]` and reads an
empty table. The interface is real; the operation never entered it.

---

# PART 4 — THE FOUNDER GAP

**What the backend already knows that you cannot see today:**

| The backend knows | You cannot see it because |
|---|---|
| 445 students are sales-ready right now | you can — `/admin/sales-queue`. This one is fine. |
| 334 students signed up in the last 7 days, 68 yesterday | People/Growth show counts; no *sales* framing of "today's new leads" |
| Which leads are unassigned | there is no owner on any lead — all 0 rows — so "unassigned" is currently *everything* |
| Who owns a lead | `lead_outreach.owner` exists and is empty; only `/admin/leads/[id]` reads it |
| Reassignment is possible | the API exists; **no UI calls it** |
| 236 vendor call reports exist | they are all on one profile (§2.3) |
| Per-rep call/connect/convert rates | `/admin/sales-performance` computes them — for `reps[0]` only, from an empty table |
| 165,861 product events per student | `/admin/student/[id]` shows plan/streak/logs, **not an event timeline** |
| A student opened checkout | **it knows nothing — no checkout event exists** (payment audit, 23 Aug) |

**There is no Activity Timeline anywhere in the product.** Not hidden — never
built. `/admin/leads/[id]` shows a profile card, streak, last 10 daily reports,
mock debriefs and the (empty) `lead_outreach` row, as separate panels. Nothing
merges sales actions and product actions onto one chronological axis.

---

# PART 5 — ACTIVITY vs CLAIM (provenance)

This distinction is **already half-built and worth protecting**:

| Provenance | Where it lives | Trustworthy? |
|---|---|---|
| SYSTEM-OBSERVED | `student_payments` (paid ledger), `student_events`, `notifications`, `expedify_events` (raw vendor payload) | yes |
| REP-RECORDED | `sales_activity.status/note`, `lead_outreach.status` | **claim only** |

`summarizePortfolio` in `sales-portfolio.ts` already encodes the right rule
(SA-1E):

> **WON = a paid row in `student_payments`. Never the typed `converted`
> disposition.** A rep can type "converted"; she cannot manufacture a payment.

**Gap:** nothing displays *provenance* to you. A future timeline must label
every row `observed` or `claimed` at the point of render, or the CRM becomes a
place where history can be written by hand.

---

# PART 6 — LEAD DISTRIBUTION GAP

**How today's leads are assigned: they are not.**

The model is **pull, not push**. A rep opens `/sales`, sees unclaimed leads
ranked by conversion score, calls one, and logging the disposition claims it.
That is a legitimate call-centre model — but it means:

* You cannot hand 40 leads to one rep and 40 to another.
* You cannot see an "unassigned queue" as a distinct thing (everything is
  unassigned).
* There is no bulk action anywhere in the codebase.

**How historical / stale leads are reassigned:** only by POSTing to
`/api/admin/reassign-lead` with a `studentId` and `newOwnerId`. Admin-only,
target must be a real `sales`/`admin` profile, and it always writes a
`reassigned` row to `sales_activity`. **The API is correct. Nothing in the UI
calls it.**

**Stale/abandoned/inactive-rep queues: do not exist.** No query anywhere
computes them.

---

# PART 7 — OWNERSHIP

`lead_outreach.owner` is `text` (an email), one row per `student_id` (PK), so
`current_owner = exactly one rep OR NULL` holds by construction. History lives
in `sales_activity` rows with `status='reassigned'`.

Ownership is enforced **server-side** in two places only: the `claim_lead` RPC
(atomic, conditional) and the admin reassign route. `/api/sales/log` explicitly
omits `owner` from its upsert with a comment saying why. **This is the right
design and it is already correct.**

**One weakness:** ownership is keyed by *email string*, not by `profiles.id`.
Change a rep's email and her whole book detaches silently. The reassign route
resolves an id → email at write time, which makes the drift one-way and
invisible.

---

# PART 8 — FOLLOW-UP GAP

The cadence engine is real and pure: `lib/sales-disposition.ts::planDisposition`
maps a disposition to `status`, `callback_at`, `next_action_at`,
`no_answer_count`, and the vocabulary is mirrored by a DB CHECK constraint plus
a guard test.

`buildCallQueue` then surfaces, in priority order: **callback due → retry due →
follow-up due → fresh**, suppressing converted/not-interested forever and
anything already dispositioned today.

**So OVERDUE / DUE TODAY / UPCOMING / NEVER CONTACTED / STALE are all derivable
from `lead_outreach.next_action_at` + `last_attempt_at` today — none of them is
rendered as a founder-facing list, and all of them would return 0 because the
table is empty.**

**Canonical thresholds that already exist** (do not invent new ones):
retry/callback timing in `planDisposition`; queue cap 60/day; prime calling
window 18:00–21:00 IST; sales-ready criteria streak≥3 / mock-opened+first-log /
day-5 fallback. **There is no canonical "stale" threshold — that is a product
decision you owe, not a number I should pick.**

---

# PART 9 — SALES-SAFE DATA SURFACE

Today a rep at `/sales/student/[id]` gets, via `getSalesConversionView`: name,
phone, conversion score, tier, momentum, lead status, recent sales activity,
and a product-derived brief.

**Two problems.**

1. **No ownership check on the route.** `requireSales()` proves *a* sales role,
   then the page reads any `id` passed in the URL. Any rep can open any
   student's card, including one owned by another rep. Today that is one
   account; the moment you hire, it is a real cross-rep exposure. **SALES-SEC-1
   (P1).**
2. **No defined minimum surface.** The rep view is curated by hand rather than
   by a declared allow-list, so the next field someone adds to the view is a
   decision nobody reviews.

`/api/admin/leads-export` (admin-only) exports 25+ profile columns as CSV —
correctly gated, but worth naming as the widest single sales-data egress in the
app.

---

# PART 10 — STUDENT JOURNEY DATA: WHAT ACTUALLY EXISTS

| Journey step | Event | Rows | Identity coverage | Founder-visible | Sales-visible |
|---|---|---|---|---|---|
| Landed (pre-signup) | `funnel_events.start:landed` | 631 | **0% (anon_id only)** | `/admin/growth` | no |
| Onboarding steps | `funnel_events.start:*` (12 steps, 1,908 max) | 14,083 | **0% (anon)** | `/admin/funnel` | no |
| Registration | `profiles.created_at` | 771 | 100% | yes | yes |
| App open | `student_events.app_open` | 13,396 | **45%** | `/admin/launch` | no |
| Screen view / exit | `screen_view` / `screen_exit` | 38,160 | 55% | `/admin/analytics` | no |
| **Taps** | `student_events.tap` | **94,888** | **31%** | aggregate only | no |
| Install | `install_click` / `install_prompt_result` | 1,304 | 80–89% | `/admin/growth` | no |
| Daily log | `daily_log`, `log_submitted` | 515 | 100% | yes | yes (as brief) |
| Buddy intent | `buddy_unlock_open`, `buddy_cta_clicks` | 104+ | 100% | yes | yes |
| Paywall shown | — | **0** | — | **DOES NOT EXIST** | no |
| **Checkout opened** | — | **0** | — | **DOES NOT EXIST** | no |
| Payment attempted | `student_payments` (order created) | 30 | 100% | `/admin/payments` | as `paid` flag |
| Payment succeeded | `student_payments.status='paid'` | 5 | 100% | yes | yes |
| Subscription | `profiles.subscription_status` | — | 100% | yes | no |

**Your question — "कब कितना किस पे टैप किया" — is answerable for roughly a
third of taps and half of app opens, and not at all before signup.** The
anonymous→identified stitch (`anon_id` → `user_id`) is the missing link, and it
is the honest ceiling on any Student 360 built today.

**The payment funnel has no events at all.** This is the same gap the 23 Aug
payment audit closed on: 24 abandoned orders sit in one undifferentiated bucket
because nothing records whether the student ever saw Razorpay.

---

# PART 11 — CANONICAL OWNERS, AND THE CONFLICTS

| Concept | Canonical owner | Conflict? |
|---|---|---|
| Student identity | `profiles` | none |
| Lead identity | `profiles` (a lead **is** a student) + `cat_test_leads` for pre-signup | **YES — two lead universes** |
| Salesperson identity | `profiles.role='sales'` | none |
| Current ownership | `lead_outreach.owner` (email) | keyed by email, not id (§7) |
| Sales activity | `sales_activity` | **YES — `expedify_events` is a second history** |
| Next action | `lead_outreach.next_action_at` | none |
| Payment truth | `student_payments` | none |
| Entitlement truth | `profiles.is_premium` **and** `subscription_status` | **YES — PAY-01, already logged** |
| Product activity | `student_events` | `analytics_events`, `funnel_events`, `routine_engagement_events` are separate universes |
| Vendor call status | `profiles.expedify_status` + `profiles.call_feedback` | **YES — `student_crm` has the same two columns** |
| System failures | none | (canonical error system: designed, not built) |

## The duplication map — five live conflicts

1. **`student_crm` vs `profiles`.** Both carry `expedify_status`,
   `expedify_synced_at`, `call_feedback`. The inbound webhook writes
   `profiles`; the outbound flush writes both. `student_crm` (684 rows) has
   **no reader in application code** — grep finds only a capability-health
   label and a metric-registry note. **It is a shadow table.**
2. **`expedify_events` vs `sales_activity`.** Two call histories with different
   shapes and no join. One has 236 rows and no student; the other has 0 rows
   and a proper student key.
3. **`cat_test_leads` vs `profiles`.** A pre-signup lead in `cat_test_leads`
   (name, phone, scores) never becomes a `lead_outreach` row. Nothing bridges
   them.
4. **`founder_outreach` vs `sales_activity`.** Your own outreach (198 rows, via
   `/api/admin/outreach` and the mission queue) is a **third** activity log,
   invisible to both the rep queue and the performance page.
5. **`is_premium` vs `subscription_status`** — carried over from the payment
   audit; a sales "converted" view must pick one and say which.

**Per your rule, I am not silently picking a winner for any of these five.**

---

# PART 12–16 — ARCHITECTURE

## A. What exists today
A complete, tested, reachable dialer CRM (queue authority, disposition
vocabulary mirrored to a DB CHECK, atomic claim, cadence engine, portfolio
maths with a payment-backed WON rule), a rep workspace, a founder call-queue
mirror, a sales-ready qualification engine with 445 live candidates, and a
vendor integration in both directions.

## B. What is broken
1. **P0 — vendor outcome attribution.** 236/236 call reports on one profile;
   payload carries no disposition. (§2.3)
2. **P1 — `/admin/sales-performance` is single-rep by construction.** (§2.2)
3. **P1 — `/sales/student/[id]` has no ownership check.** (§9, SALES-SEC-1)
4. **P2 — ownership keyed by email string.** (§7)
5. **P2 — `student_crm` is written and never read.** (§11)

## C. What is merely hidden
Almost nothing. The Sales workspace is in the nav with nine tabs, and the two
capabilities you named as missing are already declared `planned` **in the
registry with their blocking reason**. The gap is execution, not discovery.

## D. What is duplicated
The five conflicts in §11.

## E. What should become canonical
`lead_outreach` for state · `sales_activity` for history · `student_payments`
for money · `student_events` for product behaviour · `profiles` for identity.
**`expedify_events` becomes a raw audit feed that is *normalised into*
`sales_activity`, never read directly by a surface.** `student_crm` is retired
after proving it has no reader.

## F. Salesperson operating model
Keep pull-claim as the default (it is working and it is atomic), and **add**
push-assignment as an admin override. A rep sees: her book, unclaimed leads,
what is due now, and one card per student with the brief. She never sees the
base size, other reps' books, or founder-level aggregates.

## G. Founder operating model
Four levels, as you specified — but Level 1 must be honest about emptiness. A
zero must read *"0 calls logged — the team is not using the CRM"*, never a bare
`0` that looks like a quiet day. Every count drills to the exact rows behind it
(`docs/SCALE-CONTRACT.md`).

## H. Lead distribution architecture
An **Unassigned queue** (today: everyone) with filters, bulk select, and assign
→ one `POST /api/admin/reassign-lead` per lead (the API already exists and
already writes history). A **Stale queue** needs a canonical threshold you have
not yet set.

## I. Follow-up architecture
Derive OVERDUE / DUE TODAY / UPCOMING / NEVER TOUCHED entirely from
`lead_outreach` — no new table, no new status vocabulary.

## J. Student 360 architecture
One chronological merge over `profiles` · `sales_activity` · `founder_outreach`
· `student_events` · `notifications` · `student_payments`, **each row labelled
`observed` or `claimed`**, bounded by a time window and cursor-paginated. Show
only events that exist; render an explicit *"no telemetry before signup"* band
rather than an empty space.

## K. Activity/audit architecture
`sales_activity` is append-only history. `expedify_events` stays raw. A
normaliser writes vendor outcomes into `sales_activity` with
`actor='expedify:<agent>'` **only once the phone-keying defect is fixed** —
normalising today would import 236 rows of wrong attribution.

## L. Metrics architecture
`src/lib/metric-registry.ts` already exists and is enforced by a test and the
nightly integrity endpoint. **Every sales metric must be registered there** —
`leads_new_today`, `leads_unassigned`, `calls_logged_today`,
`followups_overdue`, `conversions_paid`, `revenue_booked` — each with source,
required columns, owner, surfaces, and `knownEmpty`. This is the mechanism that
stops a second definition appearing, and it is already built.

## M. Permission/RLS model
All sales tables are RLS-on with **zero policies** (deny-all) — no browser can
reach them. **Every sales authorization decision therefore lives in route code
using `createAdminClient()`, which bypasses RLS entirely.** That is workable
but it means route-level ownership checks are the *only* control; §9's missing
check is the live example.

## N. Performance/scaling model
`buildCallQueue` caps at 60 and reads a 30-day window — bounded. The risks at
10k–1M are: `getSalesReadyToCall` uses `.limit(1000)` (a silent truncation),
`/admin/students` selects ~45 columns for every profile with no pagination, and
any timeline must be cursor-paginated from day one. **No new dashboard may
aggregate in the browser.**

## O. Error/observability integration
Sales writes already return non-2xx on failed writes (Sales Phase 1) and
`call-queue` throws rather than returning a wrong list. Once the canonical
error system exists, sales failures register as its first real consumer.

## P. Migration plan
No data migration is needed for the CRM — the tables are empty. The only
migration question is `student_crm`: prove no reader, then retire.

## Q. Testing plan
The existing guard tests (`sales-claim`, `sales-clock`, `sales-won`,
`sales-ready-drain`, `sales-script-honesty`, `crm-end-to-end`) already pin the
invariants. New work adds: a multi-rep performance test that fails on
`reps[0]`, a cross-rep authorization test, and a provenance test that a
`claimed` row can never render as `observed`.

## R. Rollback plan
Every proposed change is additive UI over existing APIs plus one webhook
contract change. Rollback = revert the UI; no data is destroyed because nothing
is rewritten.

---

# THE SEQUENCE I RECOMMEND — AND WHY IT IS NOT YOURS

Your Phase 1–9 order starts with data consolidation and ends with production
verification. **I think that order buys visibility into an empty room.**

| # | Do this | Why first |
|---|---|---|
| **0** | **Fix the Expedify phone key** (vendor contract: send the *lead's* number + a structured disposition) | Until this is fixed, every call your team makes is unrecoverable. It is the only item that is losing information *right now*. |
| **1** | **Ship `payment_checkout_opened`** | One event, no DDL, already specified. Splits the 24 abandoned orders. You asked for it first and it is one line. |
| **2** | **Admin lead-assignment UI** over the existing `/api/admin/reassign-lead` | The API and the ownership model are done; this is the smallest change that turns 445 sales-ready students into distributed work. |
| **3** | **Fix `/admin/sales-performance` to be per-rep, all reps** + add the cross-rep ownership check | Removes the structural ceiling before you hire. |
| **4** | Founder Sales Control Tower L1/L2 (today · team) | Now it has something to show. |
| **5** | Follow-up queues (overdue/due/upcoming/never) | Pure derivation from `lead_outreach`. |
| **6** | Student 360 + activity timeline with provenance labels | The largest build; needs 0–2 done to be non-empty. |
| **7** | Register every sales metric in `metric-registry.ts` | Locks definitions before more surfaces read them. |
| **8** | Retire `student_crm`; normalise `expedify_events` → `sales_activity` | Only after §0 makes vendor data trustworthy. |

**The reordering rests on one claim:** a control tower over an empty CRM shows
you zeros, and zeros will not tell you whether the team is idle or the
instrument is unplugged. Steps 0–2 create the data the tower exists to display.

---

# WHAT I DID NOT DO, AND WHAT I DO NOT KNOW

**Not done:** no table, no schema, no API, no UI, no RLS, no data migration, no
deploy. `reconcile-payments` untouched. The four frozen B3b paths were read
only.

**UNKNOWN, stated plainly:**

1. **Why Expedify sends one phone.** I can prove the effect; the cause is on
   the vendor's side and needs their payload spec.
2. **Why calling stopped on 12 August.** No record in this system explains it.
3. **Whether the ads ever carried UTM tags.** 771 students, 0 attributed —
   consistent with both "never tagged" and "tags lost at signup".
4. **Whether the one rep ever opened `/sales`.** There is no page-view
   telemetry on admin/sales routes at all.
5. **Whether `student_crm` has an external reader** (a vendor or a script
   outside this repo). I proved only that this codebase never reads it.

**Per Part 19: STOP. Nothing is implemented. Awaiting your approval of the
sequence above — in particular the decision to put the Expedify key fix and
`payment_checkout_opened` ahead of the Control Tower itself.**
