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
| 3 | Buddy intent | buddy option tapped, intent door | call | all |
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

## What each person sees

- **Counsellor** (`/sales`): the deck in sections with counts, a channel pill
  per card, the journey stage and next step, a prefilled WhatsApp message, and
  a one-tap **Messaged** outcome. The headline stays coverage of what the
  system gave.
- **Founder** (`/admin/sales/tower`): per counsellor — book, touched in 21
  days, never touched, today's day by section, worked, called, messaged. The
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
ATTENTION_WINDOW_DAYS 2 · DAY_ANCHOR_HOUR_IST 4 · ROTATION_CALL_EVERY 4`

## Proof

`lib/sales-day.test.ts` (the band, ceilings, order, channel, determinism),
`lib/sales-messages.test.ts` (journey and message rules),
`lib/sales-disposition.test.ts` (messaged), the queue doctrine tests
(`queue-no-padding`, `queue-daily-replenishment`, `sales-lanes`,
`sales-conversion-truth`) amended to the 2 Sep rule.
