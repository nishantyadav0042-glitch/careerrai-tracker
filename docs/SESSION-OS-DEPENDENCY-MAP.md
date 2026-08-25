# Session OS — Reconnaissance, Dependency Map, Parallel Plan
**24 Aug 2026 · read-only recon · no implementation**

---

## 0. The finding that explains everything

CareerRai has sold 16 sessions and delivered **zero**. Earlier work found the
proximate causes (`active` was an unreachable state; the mentor Start button
did not exist). This recon found the **infrastructure** cause:

| Fact | Value |
|---|---|
| Mentors (`role='buddy'`) | 8 |
| **With Google Calendar connected** | **0** |
| With a `buddy_meet_url` | 3 (hand-pasted) |
| **With `buddy_meet_event_id`** (a room we own) | **0** |

`ensureBuddyRoom()` is the availability gate inside `schedule-meeting`. It
mints a mentor's permanent Meet room and **requires a live Google connection**.
With zero mentors connected, it fails for every mentor. Only a hand-pasted
link can produce a session today.

**The Google Calendar / Meet integration is fully built and has never been
switched on by a human.** No amount of code fixes this. It is an operations
action, and it is the top P0 blocker.

---

## 1. Canonical authorities (what already owns what)

| Responsibility | Canonical authority | Verdict |
|---|---|---|
| Session delivery lifecycle | `video_sessions.session_status` + 4 triggers | **KEEP** |
| Double-booking prevention | `no_overlapping_buddy_sessions` (GIST EXCLUDE) | **KEEP** |
| Mentor bookable week | `buddy_availability` + `buddy_time_off` | **KEEP** (new, 20260824h) |
| Slot computation | `lib/session-slots` (pure) | **KEEP** (new) |
| Meeting room | one permanent room per mentor (`buddy_meet_*`) | **KEEP** — founder decision 5 Aug |
| Google Calendar/Meet API | `lib/google-meet.ts` | **KEEP** — create/update/delete all present |
| Constraint → human sentence | `lib/booking-constraints` | **REUSE** |
| Entitlement (money) | `session_credits.status` | **KEEP, separate from delivery** |
| Student problem vocabulary | `finding_kind` + `FINDING_TO_SPECIALITY` | **REUSE / EXTEND — do not fork** |
| Mentor matching | `lib/session-credit :: matchMentor` | **REUSE** |
| Notification decisions | `dispatch()` in `lib/notification-os` | **REUSE ONLY** |
| Human intervention record | `intervention_ledger` | **REUSE** |
| Outcome observation | `sweep_intervention_outcomes()` | **REUSE** |
| Founder view | `/admin/student-success` (Command) | **MODIFY, do not add a dashboard** |

### Not what their names suggest — DO NOT TOUCH
- `coaching_sessions` (77 rows) — the student's **coaching-class timetable**,
  written by `timetable-apply`. Not a session system.
- `session_assignments` — post-call **tasks** a mentor assigns. Not scheduling.
- `rating_prompts` — the **App Store** rating ask. Not session feedback.
- `buddy_assignment_queue`, `mentor_grants` — subscription buddy access.
- `pwa_session_handoff` — auth handoff. Not a meeting.

---

## 2. The break in the middle: entitlement ≠ delivery

`session_credits` has `video_session_id`, `buddy_id`, `completed_at`,
`status`, `finding_kind`. In production:

```
status=paid · 2 rows · linked_to_a_session 0 · assigned_buddy 0
             · completed 0 · has_reason 0
```

`session_credits.status` is **INSERTed once and never updated** (single writer:
`activate-payment.ts`). `video_session_id` is **never written by any code**.

So the money and the delivery are two disconnected islands. "Was this ₹299
delivered?" cannot be answered by joining anything. This is the central thing
to build, and per founder §10 the two state machines **stay separate** with
cross-state invariants — they model different things.

### Legal / illegal combinations to enforce
| credit | session | legal? |
|---|---|---|
| paid | (none) | yes — bought, not yet scheduled |
| scheduled | scheduled/active | yes |
| completed | completed | yes |
| refunded | cancelled/expired | yes |
| **completed** | **cancelled/expired** | **NO** |
| **refunded** | **completed** | **NO** (unless a goodwill refund policy exists — founder call) |
| paid | completed | NO — credit must advance |

---

## 3. Classification of every relevant component

**KEEP** — session lifecycle triggers, exclusion constraint, `google-meet.ts`,
permanent-room model, `booking-constraints`, `session-slots`,
`buddy_availability`, `dispatch()`, intervention ledger, outcome sweep.

**REUSE** — `finding_kind`/`FINDING_TO_SPECIALITY`, `matchMentor`,
`rosterCapacity`/`readMentorRoster`, `session-link` (`joinState`/`canJoinNow`),
`session-window`, `CallCloseout`, `SessionStart`, `MyOutcomes`,
`student-success-mis`.

**MODIFY** — `sessions/book` (capture intent + slot), `schedule-meeting`
(accept a student-initiated booking), `activate-payment` (advance the credit),
`buddy/commitment` (structured closeout), `/admin/student-success` (session
funnel), buddy cockpit (availability + session list).

**BUILD** — student slot picker, booking intake, `session_feedback` (student→
session; does **not** exist), credit↔session bridge + invariants, no-show
handling, reschedule/cancel student flows, mentor availability editor,
reminder wiring through `dispatch()`.

**DEPRECATE** — per-booking `google_event_id` (already called `legacyEventId`
in the reschedule route); superseded by the permanent room.

**DO NOT BUILD** — second session table, second status machine, second
availability authority, second notification scheduler, second feedback
authority, email infrastructure, WhatsApp automation, automatic assignment
(2B-2 stays paused).

---

## 4. What exists vs Topmate (verified only)

Topmate's own docs were reachable **only via search snippets** — `topmate.io`
and their Freshdesk are blocked by this environment's egress proxy.

| Topmate (verified) | CareerRai today | Verdict |
|---|---|---|
| Calendar sync drives availability | integration built, **0 mentors connected** | ADAPT — connect mentors |
| Creator sets availability upfront | `buddy_availability` (new) | ADOPT |
| Client picks slot, pays, gets link | **mentor types a time; no student picker** | ADOPT — biggest gap |
| WhatsApp confirmation in seconds | `wa.me` deep links only, no Business API | **FOUNDER DECISION** |
| Calendar invite to both parties | `sendUpdates=all` supported, unused per-booking | ADAPT |
| Expert reschedule → email slots | `reschedule-meeting` exists (mentor-side) | EXTEND to student |
| Cancel requires a reason | route exists, **no reason captured** | ADOPT |
| No-show: 72h to respond or auto-refund | **nothing exists** | ADAPT |
| Public ratings/testimonials | **nothing exists** | ADAPT — with consent, private by default |

**Learned from their failure mode, not their features:** Trustpilot shows
Topmate's dominant complaint is the expert not joining — including a seller who
**marked a session completed while never appearing**. Completion must not rest
on mentor self-report alone. This validates keeping `started_at` observed and
argues for student-side confirmation before a session counts as delivered.

---

## 5. Dependency map

```
              ┌──────────────────────────────────────────┐
              │ P0-OPS: mentors connect Google Calendar  │  ← blocks EVERYTHING
              └──────────────────┬───────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
  A1 availability          A2 credit↔session        A3 intent taxonomy
  editor (mentor)          bridge + invariants      extends finding_kind
        │                        │                        │
        └────────────┬───────────┴────────────┬───────────┘
                     │                        │
              B  student slot picker + booking intake
                     │
        ┌────────────┼────────────┬───────────────┐
        │            │            │               │
   C reminders   D feedback   E reschedule/   F no-show
   (dispatch)    + closeout   cancel          policy
        │            │            │               │
        └────────────┴─────┬──────┴───────────────┘
                           │
                    G founder MIS session funnel
```

**Hard dependencies**
- Everything student-facing depends on **P0-OPS**. A slot picker for mentors
  with no room produces bookings nobody can join.
- **B depends on A1** (no availability → no slots) and **A2** (a booking must
  consume a credit atomically).
- **D (feedback) depends only on a completed session** — independent of B.
- **G depends on A2** for the funnel's denominator.

---

## 6. Parallel execution plan

| Track | Depends on | Can start now? |
|---|---|---|
| **A1** mentor availability editor + `/api/buddy/availability` | schema (done) | **YES** |
| **A2** credit↔session bridge, cross-state invariants, booking RPC | schema (done) | **YES** |
| **A3** intent taxonomy extending `finding_kind` | nothing | **YES** |
| **D** `session_feedback` + consent + structured closeout | nothing | **YES** |
| **B** student slot picker + intake + confirmation | A1, A2, A3 | no — wait |
| **C** reminders through `dispatch()` | B | no |
| **E** reschedule/cancel with reasons | A2 | no |
| **F** no-show (student vs mentor, asymmetric) | B, C | no |
| **G** MIS session funnel | A2, D | partial |

**Four tracks can genuinely run in parallel now: A1, A2, A3, D.**
B is the integration point and must not be faked ahead of them.

---

## 7. Stop conditions hit (founder decisions required)

1. **WhatsApp** — only `wa.me` deep links exist. Confirmations "within seconds"
   need the **paid Business API**. Not implementing silently.
2. **Refund policy on mentor no-show** — Topmate auto-refunds after 72h.
   CareerRai has no policy. Needed before F.
3. **`refunded` + `completed`** — is a goodwill refund on a delivered session
   legal? Determines one cross-state invariant.
4. **Testimonial consent wording** — publishing student words needs a policy,
   not a default.
5. **Reschedule limits** — how many, how close to the session, does the credit
   follow.

---

## 8. P0 blockers, in order

1. **No mentor has connected Google Calendar.** Ops, not code.
2. **No mentor has availability configured.** Blocked on A1.
3. **Credit and session are unlinked.** Blocked on A2.
4. **No student→session feedback exists.** Blocked on D.
