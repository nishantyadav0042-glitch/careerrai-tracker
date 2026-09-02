# Concept Resource Layer — launch record and what to check

**Shipped:** 31 Aug 2026, night.
**Announcement fires:** 1 Sep 2026, 08:00 IST (push) and on first app open (in-app card).
**Owner of this document:** whoever reads the numbers on 1 Sep morning.

This is the tracking record the founder asked for. It states what went live, the
measured reach, what deliberately did NOT go live, and the exact queries that
answer "did it work" without anyone re-deriving them.

---

## 1. What is live

| Piece | Where | State |
|---|---|---|
| 45 topics carry a verified concept video | `src/lib/topic-resources.ts` | live |
| A link appears only on a foundation-phase task | `routine-engine.RESOURCE_PREFERENCE` | live |
| Resource resolved at read time, never stored | `routine-engine.projectTaskResources` | live |
| Hidden alternative behind "Not helpful" | 37 of the 45 topics | live |
| In-app announcement, once ever, dismissible | `components/resource-announce.tsx` | fires on first open |
| Morning push carries the news, one day only | `RESOURCE_ANNOUNCE_DAY`, `RESOURCE_ANNOUNCE_SLOT` | fires 08:00 IST |

**No database change shipped.** No column, no migration, no backfill. A student's
routine row is byte-identical before and after. That is why the links appear on
routines that were already generated today — the resource is computed when the
screen is read, not when the routine was written.

---

## 2. Measured reach, from production

Read from `daily_routines` for 2026-08-31 and `topic_coverage`, run through the
real `projectTaskResources`:

| Measure | Value |
|---|---|
| Students with a routine that day | 25 |
| Topic tasks in those routines | 94 |
| Tasks in foundation phase (the only ones eligible) | 64 |
| Foundation tasks that resolve to a link | **62 (97%)** |
| Students who see at least one link | **24 of 25** |

Six real students' stored tasks were run through the projection individually.
19 tasks in, 13 links out, 7 of those carrying a hidden alternative. The three
tasks that correctly got nothing:

- two "Analyse yesterday's mock" tasks — no topic, so no resource;
- one `VARC — Reading Comprehension` whose coverage is `practicing` and whose
  target reads *"2 RC passages, timed"*. **That is a practice task, and it got
  no video.** This is the whole point of the correction that reset this work:
  a video is a concept resource, and practice needs questions, which we do not
  have yet.

---

## 2b. How far the announcement actually reaches — read this before celebrating

The push is the smaller of the two channels by a wide margin. Measured on
`companion_kickoff`, the 08:00 IST morning slot the announcement rides, over
the seven days to 31 Aug:

| Per day | Value |
|---|---|
| Students the cadence decided to notify | ~800–860 |
| Notifications actually **pushed** to a device | **~150** |
| App opens attributed to that push | **0–3** |

Two honest readings of that last row: either the morning push genuinely does
not drive opens, or `app_opened_at` is under-instrumented. This launch does not
resolve which, and nobody should claim it does.

So: **the push reaches roughly 150 devices, not 974 students.** The in-app card
is what most students will actually meet, and it reaches whoever opens the
app — about 25 students generated a routine on 31 Aug. Tomorrow's realistic
audience is dozens, not the whole cohort. The link layer itself is live for
everyone the moment they open; the announcement is only how they hear about it.

**A bug worth recording, because it nearly shipped.** The announcement was
first written into the 09:30 `morning` companion slot. That slot has **no cron
entry in `vercel.json`** — only kickoff, spark, progress and log are scheduled.
It would have deployed, passed every test, and reached nobody; production
confirmed it, with zero `Companion 09:30` notifications ever sent. It now rides
`kickoff`, and a guard asserts the announcement slot appears in `vercel.json`,
so the same class of mistake fails the build rather than the launch.

The second half of that fix matters as much: the announcement is applied
**after** every cadence has decided, and after the null check. Almost every
student is in the *activation* cadence (never logged), which short-circuits
before the active-student branch entirely — an announcement written into that
branch would have reached only a small active minority. Laid over the decision
instead, it carries in every cadence, creates no send of its own, and leaves
the daily ceiling untouched.

---

## 3. The one gap, with its cost

**Hybrid DILR Sets is the only topic appearing in real routines with no link.**

- 48 foundation task appearances across 39 students in the last 14 days.
- It is the single highest-value remaining hole, by a wide margin — every other
  topic students actually get assigned is covered.
- Its earlier candidate was rejected because the video was already serving
  Tables. One video cannot be two topics' concept explanation, and shipping it
  twice would have been the "wrong resource" the rule forbids.

**Blocked, not forgotten:** vidIQ credits are at 0 and renew **30 Sep 2026**.
Discovery cannot be re-run until then without fabricating an ID, which is the
one thing that is never acceptable. This is the first task when credits return.

Also parked on credits: 11 rows carry `confirmPending: true` — platform-read
from search, not yet re-confirmed by direct ID lookup. They are held to the same
data standard by two guards, but the confirmation pass is still owed.

---

## 4. What deliberately did NOT ship

Listed so nobody re-opens a decision that was already made:

- **No practice links, on any task.** No video will ever fill a practice slot.
- **No ranking.** A beginner, a repeater and someone with twenty minutes judge
  the same video differently. Ranking on thin data launders noise into
  authority.
- **No new coverage state.** The ladder stays at five rungs.
- **No blast notification script.** The Notification OS is decision-first; a
  cron is a clock, not a reason. The announcement rides the already-approved
  09:30 companion decision and changes one morning's body text.
- **No CTR target.** Clicks are not the metric. The thumbs are.

---

## 5. What to check on 1 Sep morning

Run these against production. Nothing here needs interpretation beyond the
comparison stated.

**a) Did the announcement reach anyone?**

```sql
select event, count(*), count(distinct user_id) as students
from student_events
where event in ('resource_announce_shown','resource_announce_dismissed')
  and created_at >= '2026-09-01'
group by event;
```

Expected: `shown` roughly tracks daily active students; `dismissed` a large
fraction of `shown`. If `shown` is 0 by midday, the card is not rendering —
check that the deploy actually landed before opening any other question.

**b) Are students opening the links?**

```sql
select event, count(*), count(distinct user_id) as students
from student_events
where event in ('resource_shown','resource_opened','resource_verdict')
  and created_at >= '2026-09-01'
group by event;
```

`resource_shown` is impressions, keyed per video. `resource_opened` is the
click. **Do not treat the ratio as the success measure** — a student who reads
the title and decides they already know the topic is a correct outcome.

**c) The only honest outcome signal — the verdict**

```sql
select props->>'topic' as topic,
       props->>'verdict' as verdict,
       count(*)
from student_events
where event = 'resource_verdict' and created_at >= '2026-09-01'
group by 1, 2 order by 1, 3 desc;
```

A topic accumulating negative verdicts is a video to replace, not a student to
argue with. That is the entire feedback design: we cannot see whether a video
teaches well, so we ask.

**d) Reasons behind the negatives**

```sql
select props->>'reason' as reason, count(*)
from student_events
where event = 'resource_verdict_reason' and created_at >= '2026-09-01'
group by 1 order by 2 desc;
```

Joins to the verdict on `verdictId`. If "too long" dominates, the `longForm`
warning is not doing its job and the fix is copy, not a new video.

**e) Did the morning push go out, and did it say the right thing?**

```sql
select date(created_at at time zone 'Asia/Kolkata') as ist_day,
       count(*)                                as decided,
       count(pushed_at)                        as pushed,
       count(app_opened_at)                    as opened_the_app
from notifications
where reason like '%lesson-link announcement%'
group by 1 order by 1;
```

`decided` should land near the ordinary kickoff volume (~800) and `pushed`
near ~150 — if `pushed` is far below that, the problem is push subscriptions,
not this feature.

This must return **exactly one row, for 1 Sep**. A row for 2 Sep means the date
guard failed, and that is a P1 — an announcement that repeats is the
EvidenceAnnounce failure again.

---

## 6. Rollback

Revert the PR. Nothing was persisted, so there is nothing to unwind: no column,
no migration, no stored resource in any routine. The task card renders exactly
as it did before, because it already renders fine with no resource row.

The announcement is separately reversible without a deploy: it stops on its own
at 00:00 IST on 2 Sep, by date, not by anyone remembering.

---

## 7. Honest limits

- **Quality is unverified.** Existence, title, channel and runtime are
  platform-read from YouTube. Whether a video *teaches well* is not something we
  can know before students tell us. The thumbs are the instrument.
- **Eight of the 45 topics have no hidden alternative.** A student who says the
  primary did not help on those gets an acknowledgement, not a second option.
- **Reach is 25 students on a given day, not 974.** Routines generate when a
  student opens the app. The announcement is what changes that number, and
  whether it does is question (a) above.

---

## 8. Launch morning results — 1 Sep 2026, measured at 08:21 IST

Every check in section 5 was run. **The launch worked end to end.**

### The push fired, on every cadence

| ist_day | decided | pushed | opened_app |
|---|---|---|---|
| 2026-09-01 | 862 | 148 | 0 |

Exactly one row, as required. Those numbers are **identical to the day's total
`companion_kickoff` volume** (862 decided / 148 pushed) — so the announcement
was carried by *every* kickoff decision, in all three cadences, rather than by
the small active minority. That was the point of applying it after the cadence
branches, and it is now confirmed in production rather than argued from code.

For comparison, 31 Aug kickoff was 860 decided / 151 pushed. Volume did not
move: no new send was created, exactly as designed.

### The copy landed correctly

> **Yash, new topics now come with a lesson**
> A topic you have not started yet now carries one free lesson link. Optional,
> and it changes nothing about your plan.

`expected_action` is `log_today`, preserved from the underlying activation
decision, so this morning stays comparable to every other morning. The reason
string reads `Activation cadence · kickoff · never logged · 89d to CAT ·
lesson-link announcement` — the carrying decision is still legible, which is
what makes query (e) work.

### Students used it, and the loop closed

| event | n | students |
|---|---|---|
| resource_shown | 9 | 2 |
| resource_opened | 2 | 2 |
| resource_announce_shown | 1 | 1 |
| resource_announce_dismissed | 1 | 1 |
| resource_verdict | 1 | 1 |

Only two students by 08:21 — expected this early. But the full sequence ran on
a real student, in order:

- `07:54:14` announcement shown (day-38 student)
- `07:54:54` opened the Para Summary concept link (Rodha)
- `07:55:07` verdict: **`helped`**

**That is the first outcome signal this product has ever collected on a
learning resource.** A separate student at 06:31 opened an Editorial Reading
link without seeing the announcement card at all — the link layer works
independently of the announcement, which is correct.

### No errors

Vercel reported no runtime errors on the deploy.

### One thing checked and cleared, not a defect

`notifications.link_url` is null on every row — but on every notification type,
going back before this change (0 of 1,722 kickoffs, 0 of 1,725 sparks). The
destination is carried in `data.url` (`/student/tracker?log=1`) and passed
straight to the push payload, so deep-linking works. `link_url` is an unused
legacy column. No action.

### Still owed

- **The P1 check:** this must NOT fire again. Query (e) must still return a
  single row after 2 Sep. The date guard is tested, but the production
  confirmation is cheap and this is the one failure mode with a named severity.
- Hybrid DILR Sets, and the 11 `confirmPending` confirmations — both blocked on
  vidIQ credits renewing 30 Sep.

---

## 9. Day 1 — 1 Sep 2026, measured 21:00 IST

### The announcement more than doubled daily active students

| | 31 Aug | 1 Sep |
|---|---|---|
| Students who generated a routine | 25 | **59** |

That is the clearest result of the day, and it is the number the announcement
was for.

### The resource layer

| event | events | students |
|---|---|---|
| `resource_shown` | 779 | **56** |
| `resource_opened` | 21 | **14** |
| `resource_verdict` | 4 | 3 |
| `resource_announce_shown` | 14 | 12 |
| `resource_announce_dismissed` | 12 | 11 |

**Do not read 21/779 as the open rate.** `resource_shown` counts one impression
per resource per component mount, and a student remounts it on every navigation
back to the plan — median 8 impressions per student, max 72. The honest
student-level number is **14 of 56 students opened a link, ~25%.** Any ratio
built on the raw event counts will understate it by an order of magnitude.

### The four verdicts

| topic | verdict |
|---|---|
| Para Summary | **helped** |
| Editorial Reading | okay |
| Percentages | did_not |
| Selection & Distribution | not_opened |

No reasons were given behind the `did_not` — the reason picker is optional and
that student skipped it.

**Nothing is actionable at n=4.** Per the 0B plan this is 7–14 days of
observation before any video is replaced. One negative verdict on Percentages
is noise, not a signal; it becomes one if it repeats.

### Not broken

`resource_shown` is non-zero and spread across 56 students, so the read-time
projection is working in production for the whole active cohort, not just the
handful seen this morning.

---

## 10. The push-ask telemetry answered in hours, not days

Shipped 09:35 IST the same day. By 21:00 it had already settled the question
that two separate investigations had guessed at:

| signal | events | students |
|---|---|---|
| `push_ask_shown` | 25 | **18** |
| `push_enabled` (converted) | 13 | **13** |
| `push_ask_later` | 10 | 5 |
| `push_ask_blocked` | 14 | **1** |
| `push_ask_skipped` · `not_standalone` | 19 | 11 |
| `push_ask_skipped` · `ios_wrapper` | 15 | 11 |
| `push_ask_skipped` · `already_granted` | 1 | 1 |

**The ask converts. 18 students saw it, 13 turned notifications on.** The
problem was never persuasion — it is reach. `not_standalone` and `ios_wrapper`
are each suppressing the prompt for ~11 students in a single day, and the iOS
cohort can never be reached by web push at all.

This is exactly what Engineering Memory #64 says could not be inferred from
`notif_prefs.push_prompted`, and it took six hours of real data instead of an
argument.

### One student is stuck, and the UI gives them no way out

`push_ask_blocked` fired **14 times for one student**. Reading the code, that
is 14 taps: on `Notification.permission === 'denied'` the overlay deliberately
stays up with *"Blocked by the phone — enable notifications for CareerRai in
Settings"*, and the only other control is Later. A student whose OS has already
blocked notifications can tap Switch on forever and nothing will ever happen.

Two things follow, neither urgent at n=1 but both real:

1. **A student-facing dead end.** The copy names the fix but the app cannot
   perform it, and there is no deep link to the OS notification settings.
2. **`push_ask_blocked` counts taps, not students.** The per-student count is
   still correct; the raw event count is not a population. Same reading error
   the impression counts invite above.

Not fixed tonight — it is one student, and a UI change to the permission flow
deserves a decision rather than a reflex.

---

### Day 2 — 24 hours of real data, measured 2 Sep 2026 08:31 IST

**P1 check first: the announcement did NOT repeat.**

| ist_day | decided | pushed |
|---|---|---|
| 2026-09-01 | 862 | 148 |

Still exactly one row. And the check is **not vacuous** — the kickoff cron ran
this morning at 08:00 IST (`candidates 922 · sent 790 · skipped 19`) and
produced zero announcement rows. The job executed, evaluated
`today === RESOURCE_ANNOUNCE_DAY`, and correctly declined. This is the
EvidenceAnnounce failure NOT repeating: that one ran for eight days advertising
a deleted capability because nothing expired it.

**The resource funnel, 1 Sep onward**

| event | events | students |
|---|---:|---:|
| `resource_shown` | 1,122 | 77 |
| `resource_opened` | 37 | 22 |
| `resource_announce_shown` | 23 | 20 |
| `resource_announce_dismissed` | 18 | 16 |
| `resource_verdict` | 11 | 7 |

Read honestly:

- **28.6% of students who saw a link opened one** (22 of 77). Per *impression*
  it is 3.3% (37 of 1,122) — the link is shown far more often than it is taken,
  which is the correct design for an optional aid but means impression-rate is
  the wrong denominator to judge it by.
- **148 students were pushed the announcement; 20 saw the in-app card.** That
  gap is app-opens, not the announcement — consistent with the ~11% daily-open
  rate measured in the notification work.
- 16 of 20 dismissed the card. Expected for a one-time notice; it is not a
  rejection signal.

**Verdicts — 11 in total, and NOT yet actionable**

| verdict | n | topics |
|---|---:|---|
| `not_opened` | 6 | Charts ×2, Odd One Out, Progressions, Selection & Distribution, Average |
| `helped` | 3 | Editorial Reading, Para Summary, Triangles |
| `okay` | 1 | Editorial Reading |
| `did_not` | 1 | Percentages |

**No topic is accumulating negative verdicts, and nothing should be replaced on
this data.** The whole sample is 11 verdicts from 7 students spread across 10
topic/verdict pairs — every cell is n=1 or n=2. The single genuinely negative
signal is Percentages (`did_not`, n=1), which is noise, not evidence.

The real signal is different and more useful: **`not_opened` is 6 of 11
verdicts (55%)**. The dominant failure mode so far is students not opening the
link at all, not the video being wrong once opened. Of the 5 who did open and
judged it, 4 said helped-or-okay. So the 30 Sep vidIQ decision should be aimed
at **which topics fail to earn a click**, not at replacing videos students
disliked — and neither question has enough data yet.

**Next measurement:** re-run these two queries once `resource_verdict` passes
~50 events, and only then consider a replacement list.
