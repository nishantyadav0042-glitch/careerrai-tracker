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
