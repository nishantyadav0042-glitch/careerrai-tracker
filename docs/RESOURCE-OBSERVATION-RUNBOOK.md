# Resource layer — observation runbook

The corpus is frozen at 78 verified resources. From here the question stops
being "can we trust the links?" and becomes "do students benefit from them?".
This is how to answer that without asking anyone to remember a query.

**78 is not a target.** It is the current verified corpus. If 78 works, stay at
78; if 60 works better, go to 60. Expansion is demand-driven — a student
hitting a real gap — never inventory-driven.

---

## Where things live

| | |
|---|---|
| Production database | `pobhpszlsozeonejtzqy` — [dashboard](https://supabase.com/dashboard/project/pobhpszlsozeonejtzqy) |
| Test database | `endycmkdphymmhzniaih` — [dashboard](https://supabase.com/dashboard/project/endycmkdphymmhzniaih) |
| SQL editor | [/sql/new](https://supabase.com/dashboard/project/pobhpszlsozeonejtzqy/sql/new) |
| Events table | `student_events` — `event` text, `props` jsonb |
| The corpus | `src/lib/topic-resources.ts` |
| Platform ledger | `docs/phase0/VERIFIED-IDS.json` (machine-written) |
| Language evidence | `docs/phase0/RESOURCE-LANGUAGES.json` |

Both databases are in `ap-southeast-1`.

---

## The three events

A student sees a card (`resource_shown`), taps through to YouTube
(`resource_opened`), and answers one question on return (`resource_verdict`).

`resource_verdict` is the **only** outcome signal that exists. We can see
nothing on YouTube — no watch time, no completion, no drop-off — so it is
self-reported by whoever chooses to answer. Read it as an opinion from a
self-selected subset, never as a completion rate.

Every event carries `topic`, `taskId`, `videoId`, `intent` and `channel` in
`props`, so any number below drills down to the exact rows behind it.

---

## The funnel

```sql
with e as (
  select event,
         props->>'topic'   as topic,
         props->>'intent'  as intent,
         props->>'videoId' as vid,
         props->>'verdict' as verdict,
         user_id
  from student_events
  where event in ('resource_shown','resource_opened','resource_verdict')
    and created_at >= now() - interval '7 days'
)
select
  count(*) filter (where event='resource_shown')                        as shown,
  count(distinct user_id) filter (where event='resource_shown')         as students_shown,
  count(*) filter (where event='resource_opened')                       as opened,
  count(distinct user_id) filter (where event='resource_opened')        as students_opened,
  count(*) filter (where event='resource_verdict' and verdict='helped') as helped,
  count(*) filter (where event='resource_verdict' and verdict='did_not') as did_not
from e;
```

## Which individual resources earn their place

The question that matters once there is enough traffic. A row nobody opens, or
one people open and mark unhelpful, should come out — that is how the corpus
improves without another research pass.

```sql
select props->>'videoId' as vid,
       props->>'topic'   as topic,
       props->>'intent'  as intent,
       count(*) filter (where event='resource_shown')  as shown,
       count(*) filter (where event='resource_opened') as opened,
       round(100.0 * count(*) filter (where event='resource_opened')
                   / nullif(count(*) filter (where event='resource_shown'),0), 1) as open_pct
from student_events
where event in ('resource_shown','resource_opened')
  and created_at >= now() - interval '30 days'
group by 1,2,3
having count(*) filter (where event='resource_shown') >= 20
order by open_pct asc nulls last;
```

Read the BOTTOM of that list, not the top. A row shown 50 times and opened
twice is the one to look at.

## Does the Hindi label change behaviour

Nineteen of the 78 videos are Hindi-medium and, until 1 Sep, were unlabelled.
The card now says so before the tap. Compare open rates on those rows before
and after that date. A drop means students were opening them by accident and
the label is saving them wasted minutes; a rise means Hindi was a hidden
feature worth surfacing deliberately. Either is a finding about our students,
not a bug.

```sql
select case when created_at < timestamp '2026-09-01' then 'before label' else 'after label' end as period,
       count(*) filter (where event='resource_shown')  as shown,
       count(*) filter (where event='resource_opened') as opened
from student_events
where event in ('resource_shown','resource_opened')
  and props->>'videoId' in (
    -- fill from RESOURCE-LANGUAGES.json where language = 'hi'
    select jsonb_object_keys('{}'::jsonb)
  )
group by 1;
```

## Where the corpus genuinely has no answer

Tasks served with no resource at all. If one topic dominates this list AND
students are working it, that is a real gap worth researching — and the only
justification for adding to the corpus.

```sql
select props->>'topic' as topic, count(*) as tasks_without_resource
from student_events
where event = 'next_action_started'
  and props->>'topic' is not null
  and props->>'topic' not in (
    select distinct props->>'topic' from student_events where event='resource_shown'
  )
group by 1 order by 2 desc;
```

---

## Refreshing the platform ledger

Run monthly, or after changing any resource row:

```bash
YOUTUBE_API_KEY=... node scripts/verify-resources.mjs
```

Two API calls, ~2 units of a free 10,000/day quota. If a video has been
deleted or made private the script exits non-zero and names it; remove the row
and re-run.

**The key is not stored in this repo and must never be.** Tests read the
committed ledger and never touch the network, so CI needs no key — only a
refresh does. To avoid pasting it each time, set `YOUTUBE_API_KEY` as an
environment variable on the Claude Code environment; the script already reads
it from there. Create one in Google Cloud Console → enable *YouTube Data API
v3* → API key → restrict it to that single API.

## Known gaps, deliberately open

- **Coordinate Geometry** has no genuine worked example. Candidates existed but
  one ran 67 minutes and the others were different topics wearing a similar
  name. Left insufficient rather than filled with a weak source.
- **Base System, Binary Logic, Lines & Angles, Triangles** have a concept row
  and no worked example. Each previously had one — a second concept video in
  the wrong slot — removed on 1 Sep. Fill only if the telemetry above says
  students want it.
- **One row carries no language** (`J9ccMZAG01o`). Three transcript attempts
  returned page metadata only. Unlabelled beats guessed.
