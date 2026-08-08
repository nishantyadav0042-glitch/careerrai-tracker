# The coaching student's cycle — research before building

Founder, 8 Aug: *"जिसने coaching ले रखी है और जिसके पास timetable है, वह upload
करेगा तो उसकी पूरी cycle कैसी होगी? हर weekly plan कैसे change होगा? क्या वह एक
महीने का दे सकता है? मैं try कर रहा था तब maximum दो week का बना पाए थे through
Excel. इस पर research करो… founder की तरह."*

No code was written for this document. Everything below is either read out of
the repository or queried from the live database on 8 Aug 2026.

---

## PART 1 — What is actually live

### 82 coaching students. 2 uploads. Both broken.

```sql
coaching_enrolled = true                     82
  · coaching + first attempt                 67
  · coaching + repeater                      15
self-prep + first attempt                   151
self-prep + repeater                         25
                                     total  258

student_timetables rows                       2   (2.4% of coaching students)
profiles.plan_source = 'coaching'             2
```

Now look at what those two rows contain. This is the part that matters.

**Upload A — Abhishek.** 16 blocks. **1 topic matched.** Every block is
`day: 0` — Monday. The labels:

```
PLANNING · SLEEP · GYM · FRESH + BREAKFAST · REVISION/FORMULA/VOCABULARY
POWER NAP · QUANT DPP · LUNCH · VARC DPP · LRDI DPP · BREAK · STUDY SESSION
CRICKET · DINNER · EXTRA STUDY TIME · LECTURE (1 DAILY)
```

This is not a coaching timetable. **It is his own daily routine** — sleep, gym,
cricket. He answered the question we asked ("send a photo of your timetable")
completely correctly, and the thing he had to send was not the thing we were
built to read. One topic ("Vocabulary") got a priority flag. That is the entire
value he received.

**Upload B — Riya.** 48 blocks, 47 topics matched. Excellent extraction — and
**all 48 are also `day: 0`**. It is a *syllabus topic list*, not a weekly
grid, flattened onto Monday.

The consequence is precise and bad. `todaysTaughtTopics` returns blocks whose
`day` equals today's weekday. So for Riya:

- **Monday:** all 48 topics come back "taught today" → every candidate in every
  section gets the +45 class bonus → the bonus differentiates *nothing*.
- **Tuesday to Sunday:** zero topics → no alignment at all.

**A bonus applied to everything is a bonus applied to nothing.** The coaching
alignment we shipped on 7 Aug has never once worked correctly for a real
student. Not because the code is wrong — the code does exactly what it says —
but because no real upload has ever had the shape the code expects.

### And she was told a lie about it

One of Riya's 48 blocks carries a stray date, `2023-10-16` — almost certainly a
sample row printed on the sheet. `timetableHorizon` takes the max date it can
find, gets a date three years in the past, and `horizonDaysLeft` returns 0.

```
notifications | 2026-08-07 | Riya Chakrabarty | timetable_refresh
              | "Your timetable has run out"
```

Her timetable is recurring-weekly. It cannot run out. **One stray parsed date
turned a never-expiring sheet into an expired one, and we pushed that to her
phone yesterday.**

### Nobody else ever gets asked to refresh

The horizon cron only fires for timetables with dates. Both real uploads are
weekday-based, so for them the refresh nudge is either silent forever
(Abhishek) or wrong (Riya). A coaching course changes topics every single week.
**A recurring weekly grid has no expiry, so we never ask for the next sheet.**

---

## PART 2 — The modelling error underneath all of it

We model "timetable" as **one object a student owns**. Coaching is not an
object. It is **a stream**. And four genuinely different documents are being
forced through one pipe:

| # | Document | Shape | Expires? | What it tells us |
|---|---|---|---|---|
| 1 | **Class grid** | recurring weekday | never | *When* they are in class, and roughly what |
| 2 | **Dated day-plan** | dated rows | yes, has a last day | *What* is taught on *which* day |
| 3 | **Target list** | quotas + deadlines | at the deadline | *How much* work is expected |
| 4 | **Own routine** | one day, hour by hour | never | Their real free hours — **not coaching at all** |

Document 4 is not in our model and it is **50% of what students actually
uploaded.** That is not a student error. It is us asking an ambiguous question.

The second structural problem: `applyCoachingTimetable` does an **upsert on
`student_id`**. One row per student, whole `blocks` array replaced. So when a
student uploads week 2, **week 1 is destroyed** — and with it the only record
of what their coaching already taught. The single most valuable asset a
coaching student could give us, deleted on every upload.

---

## PART 3 — Can we take a month? A whole course?

The founder's own experience: *"maximum दो week का बना पाए थे through Excel."*
That was not a model limitation. **It was our own setting.**

```ts
// lib/workbook-text.ts
export const DATED_WINDOW_DAYS = 21;       // we send only 3 weeks of rows
export const DATED_WINDOW_THRESHOLD = 30;  // ...if the sheet has >30 dated rows

// api/timetable/parse/route.ts
maxTokens: isSpreadsheet ? 8192 : 4096
```

And the prompt itself instructs the model to window: *"If the plan spans MORE
than 30 dated days, output blocks ONLY for dates from today through 21 days
later."*

Both limits exist for a real reason. `salvageTruncatedJson` was written after
the model hit MAX_TOKENS on a live file and died mid-array at
`"label": "3 hrs: Functions, ..."},` — 60 perfect blocks thrown away for two
missing characters.

### The actual ceiling, in numbers

A block serialises to roughly 45–55 output tokens (10 fields, one topic string,
one label). Call it 50.

| Path | Output budget | Blocks that fit |
|---|---|---|
| Spreadsheet | 8,192 | **~160** |
| Photo / PDF | 4,096 | **~80** |

A dated day-plan with one task per section = **3 blocks per day**:

| Span | Blocks | Fits in 8,192? |
|---|---|---|
| 2 weeks | 42 | ✅ comfortably |
| **1 month** | **90** | ✅ **yes — with room to spare** |
| 6 weeks | 126 | ✅ just |
| 2 months | 180 | ❌ truncates |
| Full course (4 months) | 360 | ❌ badly |

**So: a month is absolutely feasible today. We are choosing 21 days.** The
window can go to ~35 days on the spreadsheet path with no other change.

**A full course cannot be done in one pass** — and should not be, for a reason
better than tokens: a coaching institute's month-4 plan is fiction. It changes.
Extracting it in August and planning against it in November would make us
confidently wrong.

**The honest answer to "can we take the whole course?" is: take the whole
document, extract it in chunks, but only *plan* against the near window.** A
90-day sheet becomes 3 sequential extractions of 30 days each, merged. Cost is
~3× a single call — on flash-lite that is still well under ₹0.50 per upload.

---

## PART 4 — The cycle, designed

Six stages. The two marked **NEW** are what is missing today.

```
   ┌─ 1 INGEST ──────────────────────────────────────────────┐
   │  photo · PDF · Excel · CSV · (NEW) forwarded WhatsApp    │
   │  ASK THE RIGHT QUESTION FIRST — see Part 4.1             │
   └──────────────────────┬──────────────────────────────────┘
                          ▼
   ┌─ 2 CLASSIFY (NEW) ──────────────────────────────────────┐
   │  Which of the four documents is this?                    │
   │  class grid / dated plan / target list / own routine     │
   │  Each takes a DIFFERENT path. Today all four take one.   │
   └──────────────────────┬──────────────────────────────────┘
                          ▼
   ┌─ 3 ANCHOR ──────────────────────────────────────────────┐
   │  Undated weekday grid + upload date → real dates for     │
   │  the coming weeks. This is the fix for "everything on    │
   │  Monday": a topic LIST with no weekdays must become a    │
   │  SEQUENCE, not 48 blocks on day 0.                       │
   └──────────────────────┬──────────────────────────────────┘
                          ▼
   ┌─ 4 MERGE, NEVER REPLACE (NEW) ──────────────────────────┐
   │  Append to a dated coaching_sessions log. Week 2 does    │
   │  not erase week 1. What coaching TAUGHT becomes          │
   │  permanent memory — the moat, not the feature.           │
   └──────────────────────┬──────────────────────────────────┘
                          ▼
   ┌─ 5 PLAN ────────────────────────────────────────────────┐
   │  today's class topics lead (+45, already built and       │
   │  correct) · self-study hours size the budget ·           │
   │  the floor sizes the day                                 │
   └──────────────────────┬──────────────────────────────────┘
                          ▼
   ┌─ 6 REFRESH ─────────────────────────────────────────────┐
   │  dated → nudge before the horizon (built; fix the        │
   │  stray-date bug)                                         │
   │  weekly grid → nudge on a CADENCE, because a class grid  │
   │  never expires but its topics change every week (MISSING)│
   └──────────────────────────────────────────────────────────┘
```

### 4.1 The question is the bug

We ask: *"Send a photo of your coaching timetable."*
Abhishek sent his own routine, correctly.

Ask instead — one screen, three buttons:

> **What does your coaching give you?**
> · A weekly class schedule (days + timings)
> · A day-by-day study plan (dated)
> · A list of targets ("200 LRDI sets by September")
> · I'll send my own daily routine instead

The fourth option is not a consolation prize. A student's own routine tells us
their **real free hours** — the number Part 5 is entirely about — and it is the
only document a self-prep student has. Today we accept it silently and extract
almost nothing from it.

---

## PART 5 — How the hours break down

Three numbers, and they must never be confused. The class grid does **not**
give us study hours.

```
  CLASS TIME          from the timetable        — when they CANNOT study
  SELF-STUDY HOURS    asked at signup           — the budget for OUR plan
  BAD-DAY FLOOR       asked at signup           — the size of today's plan
```

A coaching student in class 3h/day who says "6 hours of self-study" has a
**9-hour day**. If we read the class grid as their study time we plan the same
day for a 6-hour student and a 9-hour one.

There is already a check for exactly this — `timetableDailyHours` computes the
median hours a sheet plans and offers a mismatch prompt. Two problems:

1. It needs **≥3 days with minutes**. Both live uploads have one day. It has
   never fired.
2. `hoursMismatch` requires an existing `currentHours`, which is null for every
   Stage-A student. So even when it could fire, it cannot.

**The split, stated once:**

| Question | Source | Drives |
|---|---|---|
| What is taught today? | class grid / dated plan | which topic leads |
| How long is today's plan? | bad-day floor | task count + minutes |
| Will I finish by my date? | self-study hours × days | the finish date, the Sunday reconcile |
| How much has coaching demanded? | target list | the Coaching Progress Mirror |

---

## PART 6 — Mocks and revision

### Revision already works, and works per student

`prep-memory` marks a topic overdue when
`daysSinceLastTouched > meta.revisionFrequencyDays × archetypeRevisionMultiplier`,
with the multiplier at **0.7 for repeaters** (tighter cycle) and **1.4 for
working professionals** (looser). That is real per-student revision and it is
sound. Nothing to rebuild — it needs *surfacing*, not redesigning.

### Mocks are a COUNT, not a CALENDAR

```ts
recommendedMockCount(remaining) = clamp(round(remaining / 33), 4, 15)
remainingMockHours = count × 4h
```

So a student is told *how many* mocks their remaining syllabus implies, and the
hours are reserved in the finish-date maths. **There is no schedule.** Nothing
says "your next mock is Sunday 14th." Mock Intensive starts the day after their
syllabus target date and that is the extent of mock timing.

For a coaching student this gets worse: **coaching already runs mocks.** If we
schedule our own on top without reading their target list, we double-book a
student who is already sitting a proctored mock every Sunday.

### What a mock plan should key off, per branch

| Branch | Mock cadence | Revision emphasis |
|---|---|---|
| Self-prep, first attempt | Start sparse (1/fortnight), tighten near the date | Build-first; revision follows coverage |
| Self-prep, repeater | Dense from day 1 — they have the base, they need exam temperament | Heavy from day 1 (0.7 multiplier already does this) |
| Coaching, first attempt | **Read their sheet first.** Add only what coaching does not provide | Revision of *class* topics — coaching teaches, we make it stick |
| **Coaching + repeater (15 students)** | Coaching's mocks + our sectionals on their weak sections | Their last-year percentile picks the effort band; class topics pick the order |

That last row is the segment the founder asked about, and it is the most
valuable one in the product: **a repeater in coaching has both a syllabus
history and a live class schedule.** They are the only students for whom we
could genuinely say *"class does Geometry tomorrow; you scored 71 last year and
Geometry was your weakest — here are the three sets to do tonight."*

---

## PART 7 — What is broken right now, ranked

| # | Defect | Evidence | Blast radius |
|---|---|---|---|
| 1 | Topic lists flatten onto Monday | Riya, 48/48 blocks `day: 0` | Alignment does nothing 6 days a week, and nothing useful on the 7th |
| 2 | Stray date expires a never-expiring sheet | push sent 2026-08-07 | Every weekly-grid uploader |
| 3 | Upload replaces history | `upsert onConflict: student_id` | Every re-upload destroys what coaching taught |
| 4 | Weekly grids are never refreshed | horizon cron needs dates | All weekly-grid uploaders |
| 5 | We ask for the wrong document | Abhishek's routine | 50% of real uploads |
| 6 | The 21-day window is self-imposed | `DATED_WINDOW_DAYS = 21` | Monthly sheets truncated for no technical reason |
| 7 | Hours mismatch check cannot fire | needs ≥3 days AND existing hours | Every Stage-A coaching student |

Note the ordering. **Not one of these is an extraction-quality problem.** Riya's
extraction was 47/48 — near perfect. Every defect is in what we do with the
result.

---

## PART 8 — Build order I would propose

Each slice is independently shippable and independently testable.

**Slice 1 — Stop lying to students.** (small)
Only treat a timetable as expiring when *most* of its blocks are dated. One
stray date must not expire a weekly grid. Riya gets an apology-free correction.

**Slice 2 — Anchor the sequence.** (the big one)
A topic list with no weekdays becomes a dated sequence from the upload date,
paced by the student's own hours — not 48 blocks on Monday. This is what makes
alignment work for the first time.

**Slice 3 — Merge, never replace.**
A dated `coaching_sessions` log, appended per upload. Week 2 keeps week 1. This
is where the long-term moat lives: *what your coaching actually taught you, all
year.*

**Slice 4 — Ask the right question.**
The four-way classifier at upload, including "my own routine" as a first-class
answer that feeds the hours model.

**Slice 5 — The weekly rhythm.**
A cadence-based refresh for weekly grids: "new week — send this week's sheet",
tied to the day their coaching publishes.

**Slice 6 — Mocks get a calendar,** branch-aware, and reading the coaching
target list first so we never double-book.

**Deferred deliberately:** raising the window to 35 days and chunked
month-plus extraction. Both are easy, and both are worthless until Slice 2
makes a long plan usable at all.

---

## The three decisions I need

1. **Slice order.** I would do 1 → 2 → 3. Slice 2 is where a coaching student
   first feels anything real. Do you want the quick honesty fix (1) shipped on
   its own first, or all three together?

2. **When a coaching sheet and our plan disagree,** who wins? Say class did
   Geometry today but our engine says their weakest is VARC and revision is
   overdue on three QA topics. Options: class always leads · class leads on
   class days only · we blend (class topic + our top pick, both in the day).
   My recommendation is the third — it is the only one that keeps both promises.

3. **The routine upload.** If a student sends their own daily routine, do we
   (a) read their free hours from it and offer to set their self-study number,
   or (b) just say "that's not a coaching sheet"? (a) is more work and much
   more useful — it is the only path that helps the 151 self-prep first-timers
   too.
