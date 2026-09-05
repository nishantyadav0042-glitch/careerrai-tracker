# The Daily 50–70 — how a counsellor's day is dealt

**Founder, 2 Sep 2026:** "take charge… keep a range 50–70 daily… a mix of all
variety… the old students must rotate… retention is a journey in itself: real
app download, then notifications, then the daily study update. Second goal is
sales of buddy sessions." This document is the rule that shipped, and why.
The constitution (`docs/OS/SALES-OS.md` §5, §15) was amended the same day on
the founder's word.

## The two lists

| Layer | Question | Runs it | Rule |
|---|---|---|---|
| **The book** | Who is this counsellor responsible for? | `lib/lead-intake.ts`, 4 AM IST | Every new free student with a phone enters a book that day, 50 per seat max (`max_new_per_day`). |
| **The day** | Who do they talk to today, and why? | `lib/call-queue.ts` → `lib/sales-day.ts` | 50–70 named students, each with a true printed reason and a channel. |

## The seven lanes, in the order they fill

| # | Lane | Signal | Channel | Floor / ceiling |
|---|---|---|---|---|
| 1 | Promises | callback, retry, follow-up due | call | all, never bumped |
| 2 | Money | order created and never paid | call | all |
| 3 | Buddy intent | buddy option tapped or intent door **within `CONVERSION_INTENT_DAYS` (14)** | call | ceiling 12 |
| 4 | New arrivals | signed up 1–7 days ago, no first log | call | ceiling 15 |
| 5 | Attention | opened the app and did not log, or tapped a notification, in the 2 days since the 4 AM anchor | **message first** | floor via backfill, ceiling 20 |
| 6 | Retention | going cold, broken streak | call | all |
| 7 | Rotation | never contacted, then anyone silent ≥ 21 days, oldest first | message; every 4th a call | floor 15, fills to 50, room to 70 |

Signals fill first. Rotation takes what is left up to 70 and never fewer than
15. If the day is short of 50 and a ceiling held real signals back, they come
back before the day ends short. A book where everyone was touched this week
yields a short day, and that is information, not a bug.

## The rules that keep it honest

- **One touch a week.** After any call or message a student rests
  `TOUCH_COOLDOWN_DAYS` (7) unless a promise, money or a retention lane brings
  them back.
- **Six no-answers and out** (unchanged), **closed is closed** (dnd,
  not_interested, paid).
- **The reason is printed.** Rotation's card says "last spoken to N days ago —
  nothing since". A card with no true sentence is padding and is forbidden
  (§15.3).
- **Messaged is an outcome.** `lead_outreach.status = 'messaged'`,
  `sales_activity.activity_type = 'whatsapp'`. It sets `last_attempt_at`
  (the cooldown), counts as worked, sets no clock, and never downgrades a live
  state (interested, follow_up, no_answer keep their clocks).
- **The journey decides the ask.** Every card names the stage — not installed →
  notifications off → reminders died → installed but not logging → logging —
  and the one-tap WhatsApp asks for exactly the next step
  (`lib/sales-messages.ts`).

## Every card ends the day marked

*Added 3 Sep 2026, on the founder's word: "make sure they mark every list
close or something, otherwise it doesn't make sense of these lists."*

Verified that morning: **240 of the 241 cards ever dealt were still open**,
going back to 30 August. A card left the deck only when a call was logged, so
`worked_at is null` was storing three different facts in one empty cell — the
counsellor never got to it, deliberately deferred it, or could not act on it.

A card now ends the day in exactly one of three recorded states:

| State | Set by | Counts as work? | Counts as leakage? |
|---|---|---|---|
| **worked** | a disposition (call or message) | yes | no |
| **skipped** | the counsellor, with a reason | **no** | no — somebody decided |
| **not marked** | the 21:45 IST sweep | no | it *is* the leakage number |

- **A skip changes nothing about the student.** No `lead_outreach` write, no
  status, no `last_attempt_at`, no clock, no miss count, and it never counts
  as reaching anyone. They return to tomorrow's queue on the same terms — a
  skip buys a day, never a disappearance. Reasons: not reachable today ·
  wrong/dead number · already spoke recently · ran out of time · not worth
  calling today.
- **A skip is never work.** `worked_at` keeps its one meaning (a real
  disposition) and still drives coverage and "reached". Closing a card by
  stamping `worked_at` would make a day of skips read as 100% — that is the
  defect the second column exists to prevent, and `day-must-close.test.ts`
  pins it.
- **The day closes itself.** `/api/cron/day-close` at 21:45 IST, 45 minutes
  after the shift, stamps every still-open card from a day that has ended as
  `not_marked`. It sweeps *every* past day, so a missed run repairs itself
  instead of leaving a permanent hole.
- **Worked + skipped + not marked + open always equals given.** Nothing can
  hide, on the counsellor's screen or the founder's.
- **The day is a fixed set** *(fixed 3 Sep, Incident #68)*. The queue is
  rebuilt on every page load, and a floor-backfill made that deal MORE cards
  each time — 97 per seat against a ceiling of 70, a list that could never be
  finished. The rebuild now reads today's `sales_opportunity`: cards closed
  today drop out (this is what makes a skip stick), carried cards stay, and
  rotation only tops up to the day's target counting what it already spent.
  Signals are the exception and still arrive live — a promise or an abandoned
  checkout at 6pm is real new work.
- **Intent expires** *(fixed 4 Sep, Incident #71)*. `buddy_cta_clicks` never
  resets, so "tapped the buddy option" was a permanent flag: 136 students held
  it, 32 had tapped inside a fortnight, the oldest was 21 July, and the lane
  took two thirds of a day while rotation got zero. The lane now needs intent
  we can DATE and that is still fresh, and an undateable tap is not fresh. A
  stale-intent student is not lost — rotation reaches them with a true reason.
- **A ceiling counts the DAY, not the screen** *(fixed 5 Sep, Incident #72)*.
  Every ceiling — each lane's, the day's, and rotation's target — was measured
  against the cards still visible. Work a card and it leaves the queue, so the
  lane had "room" again and the next page load dealt a fresh full allowance:
  111 and 174 cards against a ceiling of 70, attention alone at 45 and 64. The
  first assembly of the day had been exactly right. `DayContext.usedToday` is
  now the day's ledger — cards DEALT today, in every state — and nothing may be
  measured against anything else. Incident #68 found this defect and fixed it
  for rotation alone; the hole stayed open in every other lane.
- **A closed day is not re-dealt** *(fixed 5 Sep, Incident #72)*. The sweep
  closed 5 Sep at 21:45 and the deck dealt 20 more cards at 22:00. Past
  `SHIFT_END_HOUR_IST` the deck shows what was already dealt, so a late marking
  still lands, and deals nothing new — a card dealt after the shift is not
  work, it is noise in tomorrow's leakage count.
- **A day closes the night its shift ends** *(Incident #68)*. The sweep's
  newest closable day is today once past `SHIFT_END_HOUR_IST` (21:00), and
  yesterday before it — so a hand-run at 11am cannot close a live day.

## What each person sees

- **Counsellor** (`/sales`): "N marked · N still to mark" at the top, the deck in sections with counts, a channel pill
  per card, the journey stage and next step, a prefilled WhatsApp message, and
  a one-tap **Messaged** outcome. The headline stays coverage of what the
  system gave.
- **Founder** (`/admin/sales/tower`): per counsellor — book, touched in 21
  days, never touched, today's day by section, worked, **skipped, unmarked**, called, messaged. The
  daily intake line above it says whether new students entered books.

## Where the patterns come from

- **Sequences with a touch as the unit, one owner per student** — Outreach,
  Salesloft, LeadSquared. Here: lanes + cooldown + rotation, and ownership
  never changes because of temperature (§15.11).
- **Speed to lead** — new arrivals are called the day after signup (a call
  within hours reads as surveillance; the 1-day grace stands).
- **WhatsApp-first in India** — half the day is a message; reply rates on
  WhatsApp beat cold calls, and a message costs a minute.
- **Coverage and aging as the manager's view** — "untouched leads" and "days
  since last touch" are the two numbers every CRM manager screen carries; the
  tower now carries them.
- **No lead without a next step** — rotation is the guarantee.

## Constants (`lib/os/scale-config.ts`)

`DAY_FLOOR 50 · DAY_CEILING 70 · ROTATION_FLOOR 15 · ROTATION_SILENT_DAYS 21 ·
TOUCH_COOLDOWN_DAYS 7 · ATTENTION_CEILING 20 · NEW_ARRIVAL_CEILING 15 ·
ATTENTION_WINDOW_DAYS 2 · DAY_ANCHOR_HOUR_IST 4 · ROTATION_CALL_EVERY 4 ·
SHIFT_END_HOUR_IST 21 · CONVERSION_INTENT_DAYS 14 · CONVERSION_CEILING 12`

## Proof

`lib/sales-day.test.ts` (the band, ceilings, order, channel, determinism),
`lib/sales-messages.test.ts` (journey and message rules),
`lib/sales-disposition.test.ts` (messaged), the queue doctrine tests
(`queue-no-padding`, `queue-daily-replenishment`, `sales-lanes`,
`sales-conversion-truth`) amended to the 2 Sep rule.
