# CareerRai Engineering Memory

> **Permanent organizational knowledge.** Every production incident, outage,
> rollback, failed experiment, and architecture mistake becomes a durable entry
> here — so no engineer and no AI agent ever repeats it. This is not a changelog;
> it is the record of what went wrong, *why*, what it cost, and what now prevents
> it. **Before building in a subsystem, read the incidents that touch it.**
>
> **How to add an entry:** append with the next number. Be honest about impact
> and root cause — a sanitized memory teaches nothing. When the prevention is
> encoded in a Constitution, link it, so the lesson has teeth beyond this file.

---

## Index

| # | Date | Title | Area | Students hit |
|---|---|---|---|---|
| 1 | 2026-07 | Push subscriptions dying same-day | Notification | 34 |
| 2 | 2026-07-19 | Zero new students could log | Notification / Learning | full cohort (0/29) |
| 3 | 2026-07-21 | Dead video-session links | Trust | all buddy sessions |
| 4 | 2026-07 | Stale streaks (displayed ≠ real) | Learning / Analytics | all loggers |
| 5 | 2026-07-20 | Dashboard contradicted itself | Analytics | founder (decisions) |
| 6 | 2026-07 | 0-hour log excluded from streak | Learning | honest loggers |
| 7 | 2026-07 | Invented statistic nearly shipped | Trust | (caught pre-ship) |
| 8 | 2026-07-25 | PWA start_url redirected, installs silently failed | Growth | student-reported |
| 9 | 2026-07-25 | exam_ready was self-declarable | Trust / data | 6 students |
| 10 | 2026-07-28 | App Store rejection: unreachable login | Growth | launch-blocking |
| 11 | 2026-07-29 | Curated Daily Pick wearing a student's byline | Trust | all readers |
| 14 | 2026-08-01 | Security sweep revoked the one grant | Database access | ≥1 confirmed |
| 15 | 2026-08-01 | iOS payment fix sat on a branch for a day | Trust (payment) | every iOS student |
| 17 | 2026-08-04 | One meeting, two truths — mentor lost Join at T+0 | Trust | 1st orientation |
| 18 | 2026-08-04 | /welcome shipped with no login door | Growth | every returning user |
| 19 | 2026-08-05 | Play rejected listing — screenshots the guide had banned | Growth / store | launch-blocking |
| 20 | 2026-08-05 | Plan told a paying student to re-learn finished topics | Learning | every student |
| 21 | 2026-08-05 | A pair sent to two different video rooms | Trust | 1st paying student |
| 22 | 2026-08-06 | Five engines, one student, no two numbers the same | Analytics | 1 (visible) |
| 23 | 2026-08-06 | One file, three walls — a rule in N places drifts N−1 times | Architecture | — |
| 24 | 2026-08-06 | An instruction to a model is not a limit | AI | — |
| 25 | 2026-08-07 | A rule the founder killed kept running in three other files | Architecture | — |
| 26 | 2026-08-11 | Three planners, one Tuesday | Learning | all plan users |
| 27 | 2026-08-11 | The database moved, the code didn't — signups lost name+phone | Data / Signup | 20 (8 phones recovered) |
| 28 | 2026-08-12 | Whole Plan re-rolled the day the student was holding | Learning | 1 visible (all exposed) |
| 29 | 2026-08-12 | git reset --hard destroyed a verified change pre-commit | Process / agent | — (caught next day) |
| 30 | 2026-08-12 | Daily log rejected fractional hours — students could not log | Learning (P0) | all who marked a task "Half" |
| 31 | 2026-08-24 | A paid ₹299 student fell out of the lifecycle and no row was wrong | Trust (P0) | 1 of 2 paying students |
| 32 | 2026-08-26 | The test database is a scaffold, not a replica — probes certified a hole | Process / testing | — (caught pre-prod) |
| 33 | 2026-08-26 | `revoke from public` did not revoke it — Supabase grants anon/authenticated explicitly | Security | — (caught pre-prod) |
| 34 | 2026-08-26 | `claim_lead` is SECURITY DEFINER and callable by anon — *closed 2026-08-28* | Security (P1) | sales pipeline ownership |
| 35 | 2026-08-26 | Deploy took the whole site down (runner build lost NEXT_PUBLIC_SUPABASE_URL) | Deploy / Growth | full cohort (874) |
| 36 | 2026-08-27 | A cancelled session welded the ₹299 to a booking that would never happen | Trust (P0) | every future mentor cancellation |
| 37 | 2026-08-27 | Daily Insight repeated for days — the suppression read had no upper bound | Learning (P1) | every student who opened Home twice |
| 38 | 2026-08-27 | 71% of completions got the wrong topic — task ids are unique only within a day | Learning (P1) | every student the recovery rule fired for |
| 39 | 2026-08-27 | The guard read one of the two routes it named — a lost notification failed a committed booking | Notification / Trust (P1) | every mentor-booked session whose dispatch failed |
| 40 | 2026-08-28 | A refunded payment stayed `paid` forever — refunded money counted as revenue, and would have paid commission | Trust (money) (P1) | every refund ever processed; both counsellors from 2 Sept |
| 41 | 2026-08-28 | Fixing #40 removed the accident that blocked re-activation — a replayed capture after a refund would have handed premium back | Trust (money) (P0) | any refunded student inside Razorpay's retry window |
| 42 | 2026-08-28 | #41's fix was in the caller; the same defect sat in `activate_payment` SQL, and the profiles update had no guard at all | Trust (money) (P0) | any refunded student; reproduced before it shipped |
| 40 | 2026-08-27 | The rules were real, and attached to the wrong verb — availability was `before insert` only | Trust (P1) | any student whose session was moved |
| 41 | 2026-08-27 | A paid entitlement could be bypassed by the path the booking came through | Trust (P0, money) | every mentor-booked session for a paying student |
| 43 | 2026-08-29 | Google signup looped back into onboarding — the stash endpoint inverted its throttle and rejected every request ever made, and the claim sat in a branch a DB trigger made unreachable | Growth / Learning (P0) | every student who chose Continue with Google; 0 drafts stored in the feature's lifetime |
| 44 | 2026-08-29 | An invisible U+FEFF in `NEXT_PUBLIC_SUPABASE_URL` made `new URL()` reject it — 9 of 10 Google callbacks died on "PKCE code verifier not found", a message that never mentions a URL | Growth (P0) | every Google sign-in for a day; 3 accounts left with 0 coverage rows |
| 45 | 2026-08-29 | The OAuth `state` was encoded twice, so the callback's `indexOf(':')` found no colon and read the nonce as empty — every mentor Google Calendar connection ever attempted was refused as `state_mismatch` | Trust (P0) | all mentors; 0 rows in google_oauth_tokens across the project's life |
| 46 | 2026-08-29 | `GOOGLE_CLIENT_SECRET` was a well-formed secret belonging to a DIFFERENT OAuth client — Google checks the secret last, so it stayed invisible behind three other bugs | Trust (P0) | all mentors; token exchange failed after the mentor had completed the whole consent journey |
| 47 | 2026-08-29 | The Google health check searched followed HTML for `invalid_client`, so it scored `redirect_uri_mismatch` as healthy and reported all callback URIs registered while one was missing | Trust (P1) | mentors starting on the legacy PWA origin: Error 400 every time, with the diagnostic saying everything was fine |
| 48 | 2026-08-29 | The `security` workflow had failed on every commit to main — Semgrep runs diff-aware on a PR and full on a push, so no PR ever showed the 16 findings, and an always-red gate stopped being read | Playbook / Trust (P1) | no student directly; a weakened GCM tag check on session-handoff tokens and TLS verification disabled on the production DB script |
| 49 | 2026-08-29 | Ownership was bound to a person, so a departing rep's whole book would silently become unowned — `lead_outreach.owner_id` was `ON DELETE SET NULL` while `sales_followup.owner_id` was `ON DELETE RESTRICT`, two opposite outcomes for one event | Trust / sales ops (P0) | none yet — caught while both tables were empty |
| 50 | 2026-08-29 | One ceiling answered two different questions: portfolio assignment was gated on live-work capacity, so a seat could never hold more than ~200 students against an operating model of ~1,000 | Trust / sales ops (P1) | none yet — no book had been built |
| 51 | 2026-08-29 | The sales system had never held a lead: 974 students, `lead_outreach` = 0 rows, and no route could turn a student into one — both counsellors would have logged in to an empty queue on their first morning | Growth / sales ops (P0) | 2 counsellors, day one |
| 52 | 2026-08-29 | A counsellor tapping "Converted" deleted a student from every future queue with no payment anywhere — `call-queue.ts` treated the typed status as terminal while `/sales/leads` still showed them Active, so the surface they work from was the one that hid them | Trust / revenue (P0) | none yet — caught by audit while `lead_outreach` was empty |
| 53 | 2026-08-29 | The sales system could say what a counsellor LOGGED but never what they were GIVEN, so "did they work the right students?" and "how much of today is left?" had no answer — coverage had no denominator | Analytics / sales ops (P1) | none directly; the founder could not see leakage |
| 54 | 2026-08-29 | The call cadence engine had no upper bound: a `hot` lead who never answered was rescheduled for "tomorrow morning" regardless of how many times it had already been — 31 calls in 30 days to a student who never picked up once, landing hardest on abandoned-checkout students because they are the ones scored hot | Trust / student experience (P0) | none yet — caught by simulation the night before the first counsellor shift |
| 55 | 2026-08-29 | `/api/cron/outcome-sweep` was declared in `vercel.json` on 24 Aug and had NEVER run — the half of the learning loop that observes what a student did after an intervention, so every outcome column in `intervention_ledger` would have stayed NULL and the whole sales experiment would have produced no evidence | Analytics / experiment integrity (P0) | none directly; would have silently voided the 2-counsellor experiment |
| 56 | 2026-08-29 | `/api/cron/purge-session-handoffs` was declared on 27 Aug and had NEVER run, so the credential purge it exists to perform had removed nothing: 595 `pwa_session_handoff` rows, every one still holding an encrypted Supabase access+refresh token pair, all dead, oldest from 12 July | Security / data retention (P0) | none observed; a standing credential liability, not an outage |
| 57 | 2026-08-30 | `/sales` returned "This page didn't load" for BOTH counsellors — PostgREST puts `.in()` lists in the URL, so 975 students meant a ~38,000-character request and a 400 on every load. Seven reads passed the full list; only `lead_outreach` inspected its error, so the other six — including the paid-payments read that stops a paying student being dealt as a lead — failed silently | Growth / sales ops (P0) | both counsellors locked out of the product on their first morning |
| 58 | 2026-08-29 | `reconcile-payments` asks Razorpay what went wrong every 15 minutes, reads `status`, and discards `method`, `error_code`, `error_step` and `error_source` — the four fields that separate "our app cannot hand off to a UPI app" from "the bank declined a card". **CORRECTION (same day):** this entry originally led with "zero of eight orders from an installed iOS surface have ever been paid". That figure was built on a `distinct on (user_id, minute)` join that picked one arbitrary event per user-minute and merged in-app sessions with the browser sessions the app handed students to. Re-derived from the initiating session: installed-iOS is 11 orders and 0 paid, not 8; iOS Safari is 2 paid of 3, not 1 of 1; installed Android is 3 paid of 16, not 2 of 13. The instrumentation defect below is real and unchanged; the device numbers that motivated it were not | Payments / diagnosis (P0) | the product's most expensive open question was unanswerable from our own database; no student harmed, no money lost |
| 59 | 2026-08-29 | CareerRai serves from two live origins and Razorpay accepts payments from only one: 13 orders minted from `careerrai-daily.vercel.app` — 0 paid, 2 refused outright with `source=internal` "Payment blocked as website does not match registered website(s)" — against 20 from `careerrai.in`, 5 paid. One student was blocked twice on the legacy origin and paid nine minutes later on the canonical one. 101 students used the legacy origin in the last 7 days | Payments / conversion (P0) | between 0 and 13 lost orders; only the 2 refusals are certain, the other 11 never produced a Razorpay attempt at all |

> Entries 12 and 13 were never written. The gap is left visible rather than
> renumbered — the numbers are referenced from commit messages and code
> comments, so closing it would break those references.

---

> **This file is the INDEX.** The full entries — symptom, root cause, cost,
> prevention — live in `ENGINEERING-MEMORY-ARCHIVE.md`. Before building in a
> subsystem, scan this table for incidents touching it, then grep the archive
> for `## Incident #<n>` and read only those. (Split 12 Aug 2026: the one file
> had grown past 1,000 lines and was being re-read whole on every task.)
>
> **Adding an incident:** full entry in the archive, one-line row here — same
> commit, next number.

---

## CareerRai engineering laws

Laws outrank incidents: an incident teaches one lesson, a law refuses a whole
class of them. Both are binding.

**L1 — A trustworthy UNKNOWN is infinitely more valuable than a precise lie.**
(Founder, 18 Aug 2026.) CareerRai Notice only works if the student comes to
believe *"CareerRai notices things about me I didn't notice myself."* That
belief survives a silence. It does not survive one discovery of *"wait —
CareerRai made that number up."* Insufficient evidence produces UNKNOWN or
silence, never a weaker guess, never a default, never a flattering one.

**L2 — No claim about product behaviour from code location alone.**
(Founder, 18 Aug 2026.) Trace PRODUCER → WRITE → CONSUMER → SURFACE → REAL
DATA before asserting what the product does. Every 0C.3 investigation found a
defect this way that reading the code had missed — and one investigation found
a defect in its own first pass the same way.

---

## How prevention becomes permanent

An incident is only closed when its lesson is encoded somewhere with teeth — a
Constitution non-negotiable, a shared library that makes the wrong thing
impossible, or a Playbook gate. A lesson that lives only in this file will be
repeated; a lesson wired into `push-client.ts` or `admin-filters.ts` cannot be.
