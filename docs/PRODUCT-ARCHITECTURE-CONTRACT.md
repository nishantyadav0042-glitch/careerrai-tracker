# CareerRai — Product Architecture Contract

**24 Aug 2026 · Phase 0/1 output of the founder's read-only architecture gate.**
This document exists because the alternative — six engineers, or six AI
sessions, each reading the founder's intent independently — is how one product
becomes six. `docs/MISSION.md` and `docs/KNOWLEDGE.md` remain the outranking
documents; this file is the operational contract underneath them, updated as
decisions are made, not a static snapshot.

**How to use this file:** before building anything that touches Home, mentor
matching, sessions, Daily Pick, or the landing page, check here first. If a
guard test is named below, treat it as load-bearing — read it before touching
the code it protects, and if your change requires it to change, that is a
founder decision, not an engineering one.

---

## 1. The four surfaces (from MISSION.md — restated here because every item below maps to one)

| # | Surface | Job | Route |
|---|---|---|---|
| 1 | Study plan (free) | "What do I do today?" | `/student/today`, `/student/plan`, `/student/tracker` (Home) |
| 2 | Buddy (paid) | Human relationship | `/student/buddy` |
| 3 | Daily Pick (engagement) | A reason to open the app on a bad day | `/student/community` |
| 4 | Depth | Analysis, reports, journey | `/student/analysis`, `/student/reports` |

Surface 1 is the mission. Surfaces 2–4 exist to serve it, never to compete
with it for attention. This is why Home's hierarchy is guard-locked (§4).

---

## 2. Standing product decisions — the ones a naive feature request will collide with

Each row: the decision, why, the guard test enforcing it, and the date. **Do
not build around these silently.** If a request conflicts with one, escalate —
this is MISSION.md's own rule, not an invention of this document.

| Decision | Why | Enforced by | Date |
|---|---|---|---|
| Not an open marketplace — students never browse/compare mentors by price | MISSION.md §"What we are not" | `buddy-choice.guard.test.ts` | 12 Aug / 19 Aug |
| Mentor recommendation shows ONE pick, with a "see 5" door — never 5 equal profiles by default | Directory framing reads as a marketplace | `buddy-choice.guard.test.ts` | 19 Aug |
| No verification claim ("Verified IIM alumni") without `iim_verified_at` present | A real false claim shipped once (unlock sheet, all 8 buddies unverified) | `iim-claim.guard.test.ts` | 19 Aug |
| Mentor CTA register is "Talk to", never "Book"/"Hire" | Positioning — a relationship, not a transaction | `iim-claim.guard.test.ts` | 19 Aug |
| Coaching timetable is FREE for every student, no premium gate | Evidence: 70–80% of aspirants already have one; the upload IS the proof of value, we were charging for the proof | `timetable-free.guard.test.ts` | 8 Aug |
| Buddy check-in nudges are PAID-only, re-checked at send time not just draft time | "The machine is free, the human is paid" — a mentor's personal attention is the thing the subscription buys | `buddy-checkin-premium.guard.test.ts` | 10 Aug |
| CareerRai Insight renders above the plan on Home, never removed as "declutter" | Documented near-miss: removed 22 Aug, reverted within the hour — it's the timetable ingestion signal, not decoration | `insight-visible.guard.test.ts`, `home-hierarchy.guard.test.ts` | 22 Aug |
| Exactly one commercial line on Home ("Audit Your CAT Prep with IIM Alumni" → `/student/buddy`), hidden from paying students, no second price shown | Home sells nothing directly; it hands off | `home-hierarchy.guard.test.ts` | — |
| Daily Pick copy is "Solve something tough. Challenge others" — never "Stuck on something?" (help-desk framing) or "competitor"/"beat other" language | Competitive energy without making peers into rivals | `home-hierarchy.guard.test.ts` | — |
| No raw vote counts or ranks shown anywhere in community/Daily Pick | Locked engagement-honesty rule | `no-vote-counts.guard.test.ts` | — |
| Session booking never publishes remaining-spot counts ("2 spots left") | Reveals how small the mentor pool is | `session-booking.guard.test.ts` | — |
| Session capacity + mentor-match checked BEFORE payment, never after | Overselling burns the students most willing to pay | `session-booking.guard.test.ts` | — |
| A student cannot buy a second session credit while one is open | `hasOpenSessionCredit` | `session-booking.guard.test.ts` | — |
| The Daily Pick share/submit funnel is fully instrumented (opened → attempted → blocked/failed → submitted) | 21 Aug: 11 opens, 0 submissions, and the old telemetry couldn't say why | `community-share-funnel.guard.test.ts` | 21 Aug |

---

## 3. Canonical entities — source of truth, as it exists today

| Entity | Canonical owner | Notes |
|---|---|---|
| Student identity | `profiles.id` | Also the sales-OS canonical id (see `docs/SALES-IDENTITY-CONTRACT.md`) |
| Mentor ranking | `lib/buddy-match.ts` → `rankBuddies()`/`recommendFor()` | ONE engine — do not build a second ranking anywhere |
| Mentor assignment (final) | `profiles.buddy_id` (single FK) via `POST /api/admin/assign-buddy` | 1:1, admin-executed. Gap: not yet driven by which recommended card the student tapped |
| Session capacity/booking | `lib/session-credit.ts` + `api/sessions/book/route.ts` | Tested, hardened, recent (§2) |
| Session record | **Not yet consolidated** — `video_sessions`, `session_requests`, `session_assignments`, `session_commitments` are four separate tables | Real gap — see §5, Phase 5 |
| Timetable | `student_timetables`, one row per student, `lib/timetable-apply.ts` shared by both writers (student self-upload, buddy edit) | Free, live |
| Daily Pick content | `student_submissions` → `daily-pick.ts` rotation → `featured_on` | Curated flag distinguishes ours vs student-authored (Incident #11) |
| Payment | `student_payments`, Razorpay only | Card data never touches our servers |
| Sales identity/activity | `profiles.id`, `lead_outreach.owner_id`, `sales_activity.actor_id`, `sales_followup` | Separate system, see the Sales OS docs — not part of this contract |

**The one real duplication risk found in this pass:** session state is split
across four tables with no single canonical `session` object. This is
`docs/KNOWLEDGE.md` §8 rule #1 in the making — "two implementations of one
concept will diverge" — and Phase 5 must consolidate, not add a fifth.

---

## 4. Home hierarchy (locked, `home-hierarchy.guard.test.ts` + `insight-visible.guard.test.ts`)

```
CareerRai Insight (branded, above the plan, dismiss-only, no timer removal)
  ↓
one commercial line ("Audit Your CAT Prep with IIM Alumni" → /student/buddy,
  hidden from paying students, no second price)
  ↓
Today's plan (PaceCard, TodaysRoutineCard)
  ↓
Mentor teaser
  ↓
Log block
  ↓
HomeTimetableCard (must stay mounted — the coaching-student ingestion point)
  ↓
ValueProofCard
```

Do not reorder without reading both guards first.

---

## 5. The six items — resolved status (24 Aug)

| # | Item | Status | Remaining work |
|---|---|---|---|
| 1 | Timetable upload | **Live, free, working.** 4 entry points, guard-tested. | Diagnose the specific account that looked broken — likely a visibility condition, not a code gap. |
| 2 | Multiple mentors | **Built 19 Aug** (recommend-one + explore-5, honest personalisation fallback). | Wire the tapped card through to actual assignment — today payment leads to admin-assigns-any-of-5 regardless of student's tap. |
| 3 | CAT/IIM headline | **Already live on Home** (not `/welcome` — founder confirmed this is what he meant). `/welcome`'s locked H1 ("Six jobs are ours...") is untouched. | Investigate why the existing line doesn't read as prominent; no new copy needed until that's diagnosed. |
| 4 | Daily Pick engagement | Share mechanics + aggregate stats exist. **Funnel underneath converts at 0%** (11 opens → 0 submits, measured 21 Aug). | Fix the completion cliff first (telemetry is live — read what it says now that it's had 3 days). Challenge-tracking is real added scope, sequenced after. |
| 5 | Topmate-parity session infra | Booking/capacity/payment layer solid and recent. No slot-picker, no embedded video (bare Google Meet link, no session key), no session-linked feedback, no transactional email. | Consolidate the 4-table session state first (§3), then layer: slot-picker → secure join flow → session-linked feedback trigger → booking/reminder emails. Video-embed vendor choice is the biggest single decision, sequenced last. |
| 6 | Insights lower on Home | **Not changing** — founder confirmed, given the 22 Aug near-miss on record. | None. |

---

## 6. What this document is not

Not a replacement for `docs/MISSION.md`, `docs/KNOWLEDGE.md`, or the OS
Constitutions. Not exhaustive — 88 guard test files exist in this repo; only
the ones intersecting the current six-item conversation are catalogued here.
Extend this file, don't fork it, when the next feature request arrives.
