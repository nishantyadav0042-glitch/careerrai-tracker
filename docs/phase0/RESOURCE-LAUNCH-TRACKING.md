# Concept Resource Layer — launch record and what to check

**Shipped:** 31 Aug 2026, night.
**Announcement fires:** 1 Sep 2026, 09:30 IST (push) and on first app open (in-app card).
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
| Morning push carries the news, one day only | `RESOURCE_ANNOUNCE_DAY = 2026-09-01` | fires 09:30 IST |

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

This must be non-zero on 1 Sep and **zero on every later day**. If it is
non-zero on 2 Sep, the date guard failed and that is a P1 — an announcement
that repeats is the EvidenceAnnounce failure again.

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
