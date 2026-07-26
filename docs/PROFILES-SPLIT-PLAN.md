# Splitting `profiles` — migration strategy

**Roadmap item #2.** Status: **planned, not started. Nothing has been executed.**
Every number here was measured against the live database and the current tree
on 26 July 2026.

---

## 1. Why this is the second-highest-leverage change

`public.profiles` holds **112 columns** — 17% of the 645 columns in the whole
schema, against 25 for the next-largest table — and **18 different subsystems
issue `UPDATE` to it**: auth, payments, push, the Expedify calling vendor's
webhook, logging, timetable, calendar, install, events, coverage, sessions,
voice notes, admin and four cron jobs.

Three consequences, in increasing order of cost:

1. **No domain can own its own data.** Ownership is the unit you assign to an
   engineer. There is nothing to assign.
2. **Write amplification and lock contention.** Updating a push subscription
   rewrites a 112-column row. At 258 students this is invisible. At 500,000 it
   is the hottest row in the system.
3. **It compounds.** Every new feature adds columns here because that is the
   path of least resistance, and every added column raises the cost of ever
   splitting it. This is the one item on the roadmap that gets *strictly more
   expensive every week it is deferred.*

---

## 2. The method: expand → migrate → contract

No slice is a big-bang. Each runs as four separately-deployable steps, and the
system is fully working after each one:

| Step | What happens | Reversible? |
|---|---|---|
| **E — Expand** | Create the new table, backfill it from `profiles`. Old columns untouched and still authoritative. | Yes — drop the new table |
| **D — Dual-write** | Every writer writes both places. New table is a verified mirror. | Yes — stop writing it |
| **R — Flip reads** | Readers move to the new table, one call site at a time, behind tests. | Yes — flip back |
| **C — Contract** | Stop writing the old columns; drop them after a soak period. | **No** — the only one-way step |

**Only step C is irreversible, and it never happens in the same week as step E.**
A minimum 7-day soak between R and C, with the old columns still populated, is
what makes a mistake recoverable instead of a restore-from-backup.

---

## 3. Slice 0 — retire what nothing uses (do this first)

Measured: columns with **zero rows populated** and at most one code reference.

| Column | Rows populated | Code refs |
|---|---|---|
| `exam_date` | **0 / 258** | 0 |
| `google_calendar_connected_at` | **0 / 258** | 0 |
| `joined_cohort_week` | **0 / 258** | 0 |
| `photo_url` | **0 / 258** | 0 |
| `premium_extension_days` (non-zero) | **0 / 258** | 0 |
| `shadow_rival_id` | **0 / 258** | 0 |
| `call_feedback` | **0 / 258** | 4 |

Two more are fully populated but referenced nowhere in application code —
they hold nothing but their column defaults:

| Column | Rows populated | Code refs | Note |
|---|---|---|---|
| `email_verified` | 258 / 258 | 0 | Duplicates `auth.users.email_confirmed_at` |
| `section_elo` | 258 / 258 | 0 | Every row is the `{1200,1200,1200}` default |

**112 → 103 columns for effectively zero risk.** But note `shadow_rival_id`
carries a foreign key and appears in 3 SQL/migration files, and `call_feedback`
is read by 4 source files even though no row has ever held a value — so the
correct order is *stop referencing, soak, then drop*, not drop-and-fix.

**I have not dropped anything.** Your standing rule is that 1% uncertainty means
don't delete, and "0 rows today" is not the same as "no code path can ever write
it." Slice 0 needs your explicit go-ahead, and I would still soak it.

---

## 4. Slices 1–5, ordered by risk

Sized by how many source files touch each group — the real cost driver.

### Slice 1 — `student_crm` · **lowest risk, highest danger removed**

`expedify_status` (158 rows), `expedify_synced_at`, `call_feedback` (0 rows).
**Touches 6 source files.**

This is the leak that should go first, and not because it is big. An external
calling vendor's inbound webhook (`api/expedify/outcome`) currently writes
directly to the row that authenticates a student. A malformed payload or a bug
in a third-party integration has a straight path to identity data, and no schema
boundary stands in the way.

*Effort: 2–3 days. Risk: low — sales-only surface, no student-facing read.*

### Slice 2 — `student_growth`

`signup_device`, `signup_browser`, `install_source`, `install_source_at`,
`app_installed`, `app_installed_at`, `signup_source`, `post_signup_done`,
`onboarding_step_reached`, `onboarding_last_activity_at`.
**Touches ~25 source files** (`app_installed` alone is in 18).

Growth attribution is append-mostly and nothing downstream computes money or
correctness from it, so a mistake here is a reporting error, not a student
harm. Good second slice: real size, low blast radius.

*Effort: 1 week. Risk: low–medium.*

### Slice 3 — `mentor_profiles`

`cat_percentile`, `first_attempt_percentile`, `cat_year`, `iim_converted`,
`current_company`, `linkedin_url`, `how_i_work`, `biggest_mistake`,
`younger_self_advice`, `strongest_section`, `student_types_helped`,
`buddy_bio`, `intro_audio_url`, `agreed_monthly_payout`,
`buddy_onboarding_completed`, `buddy_tour_completed`.
**Touches ~30 source files.**

Sixteen columns that are NULL for 249 of 258 rows, because only 7 mentors
exist. This is the clearest case of a domain squatting on the identity table.

It also **unblocks "multiple mentor types"** from the Future Feature Test:
adding mentor attributes today means adding more columns to a 112-column table,
which is why that feature is currently rated "easy but makes things worse."

*Effort: 1–1.5 weeks. Risk: medium — the buddy showcase and match engine read
these on the page where students decide to pay.*

### Slice 4 — `push_subscriptions` · **BLOCKED, needs your decision**

`push_subscription`, `push_died_at`, `push_context`, `push_subscribed_at`,
`push_resubscribed_at`, `push_verified_at`, `notif_prefs`.

Technically the best-shaped slice — a student has multiple devices and the
current schema **cannot represent that**, because it is one JSONB column on one
row. 72 of 258 rows hold a subscription.

**Not touching it.** You said notifications are off-limits, and they are also
the subsystem with the most incidents on record. This needs to be a deliberate
decision by you, not a side effect of a refactor.

### Slice 5 — `student_exam_profile` · **do LAST, and merge it with roadmap #3**

The 19 CAT-specific columns: `baseline_varc/dilr/qa`, `baseline_mocks_taken`,
`baseline_locked`, `starting_percentile`, `target_percentile`,
`last_year_percentile`, `syllabus_target_date`, `coaching_enrolled`,
`current_streak`, `best_streak`, and the six `*_model_enabled` /
`*_include_bonus` flags.
**Touches 60+ source files** (`cat_percentile` alone is in 27, `target_percentile` 24).

**The planning insight that matters: this slice and roadmap item #3
(model the exam instead of hardcoding it) are the same work.** Both move
CAT-shaped state off `profiles`. Doing them separately means touching the same
60 files twice, and the second pass would undo the first — because the right
target is not `student_exam_profile` keyed by student, it is keyed by
**(student, exam)**.

**Recommendation: do not start Slice 5 until the multi-exam decision is made.**
If the answer is "CAT only, forever," Slice 5 is a simple lift. If the answer is
"we expand," Slice 5 *is* the Exam aggregate and should be designed as one.

---

## 5. Sequencing and cost

| Slice | Files touched | Effort | Risk | Depends on |
|---|---|---|---|---|
| 0 — retire dead columns | ~5 | 1 day + soak | Very low | Your go-ahead |
| 1 — `student_crm` | 6 | 2–3 days | Low | Slice 0 |
| 2 — `student_growth` | ~25 | 1 week | Low–med | — |
| 3 — `mentor_profiles` | ~30 | 1–1.5 weeks | Medium | — |
| 4 — `push_subscriptions` | ~20 | 1 week | **Blocked** | Your decision |
| 5 — `student_exam_profile` | 60+ | 2 weeks | High | **Multi-exam decision** |

**Total for slices 0–3: about 3 weeks**, and that alone takes `profiles` from
112 columns to roughly **60**, with four domains owning their own data.

Slices 4 and 5 are each gated on a decision that is yours, not mine.

---

## 6. What makes this safe now, and did not before

Roadmap item #1 shipped first for exactly this reason. The invariant modules
that read these columns — `evidence.ts`, `buddy-match.ts`, `prep-model.ts`,
`streak-utils.ts`, `pricing.ts`, `study-day.ts` — now have **104 unit tests**
and a CI gate. Slice 3 in particular rewires `buddy-match.ts`, and there are now
16 tests asserting exactly what its ranking and match copy must produce.

Moving 571 files or splitting a 112-column table without that would have been
how a refactor becomes an outage.

---

## 7. What I need from you

1. **Go/no-go on Slice 0** — retire 9 unused columns, with a soak, no drops on
   day one.
2. **Go/no-go on Slice 1** — `student_crm`, the external-webhook leak.
3. **The multi-exam decision**, whenever you are ready. It does not block
   slices 0–3, and it fully determines slice 5.
4. **Whether notifications are ever in scope** for slice 4, or stay frozen.

I have executed nothing. Say which slices to start and I will run each as
expand → migrate → contract, one deployable step at a time.
