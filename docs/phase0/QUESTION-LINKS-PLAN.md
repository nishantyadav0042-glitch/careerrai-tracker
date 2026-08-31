# Attaching question links to tasks — the plan

**31 August 2026.** Founder: *plan first; stop running to build everything.*
So: no code in this document. This is what I found in our own system, and the
smallest change that gets a question link under every practice task.

---

## The headline

**Almost none of this needs building. Your five levels already exist in the
code, the student's position on them is already stored, the task already knows
how many questions it wants, and the hook to hang a link on is already written
and already called.**

One lookup table returns the wrong *kind* of thing. That is the defect.

---

## 1. Your levels are already in the code, by name

`src/lib/coverage-status.ts`:

```
CoverageStatus = 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready'
```

That is exactly what you described — learn the topic, then mastery, then
exam ready. It is stored per student per topic in the `topic_coverage` table,
and the student updates it themselves.

## 2. The level already decides the phase

`phaseForTopic()` in `routine-engine.ts` converts one student's status on one
topic into the verb for today's task:

| Student's status on the topic | Phase | What they need |
|---|---|---|
| `not_started`, `learning` | `foundation` | **the concept video** |
| `practicing` | `intensive` | **questions** |
| `revising`, `exam_ready` | `revision` | **questions, harder** |

The comment above it records why it exists: a real student complained on 5 Aug
that a topic he had already marked practising was still telling him to "Learn"
it. So the engine already refuses to re-teach a topic the student is past.

## 3. The task already knows how many questions

`taskVolume()` prices the slot: minutes ÷ minutes-per-unit, capped so a day is
completable. It returns `{ count, unit }` where unit is `question`, `set` or
`passage` — QA in questions, DILR in sets, RC in passages.

**That is where "15 questions" comes from.** It is already computed, already
on the task as `target`, already derived from the hours that student gave us.
We do not need to invent a number; we need to point it somewhere.

## 4. The hook is already written, and in the right place

`routine-engine.ts` has exactly one entry point:

```
resourceForTask(topic, topicPhase) -> resource | null
```

One function. One call site. Keyed on `(topic, phase)` — which is precisely the
pair that should decide "video or questions". Whoever wrote it put it in the
right place.

## 5. Your five tasks are five different topics

`day-topics.ts` picks one lead topic per section (VARC, DILR, QA) plus extras,
capped by `MAX_TOPIC_BLOCKS_PER_SECTION`. So a day of 4–5 tasks is 4–5
**distinct topics**, each carrying its own topic + phase + count.

So the answer to *"where do my five tasks' links come from?"* is: **not five
links from one place — five lookups into one table, one per topic.** Same as the
concept video works today.

---

## The defect: one table returns the wrong kind of thing

```
const RESOURCE_PREFERENCE: Record<Phase, readonly ResourceIntent[]> = {
  foundation: ['concept', 'practice_easy'],
  intensive:  ['practice_cat', 'practice_easy', 'concept'],
  revision:   ['exam_ready', 'practice_cat', 'practice_easy'],
};
```

Every phase resolves to a **video**. A student in `intensive` — told to solve 15
questions — is handed a video of someone else solving questions. That is the
whole bug, and it is nine lines.

---

## The change

`resourceForTask` returns a union instead of one type:

| Phase | Returns | Row under the task reads |
|---|---|---|
| `foundation` | concept video | *"Learn this first — 18 min, Rodha"* |
| `intensive` | question set | *"Practise 15 questions here — 2IIM, free"* |
| `revision` | question set, CAT-level | *"15 CAT-level questions here"* |

Plus one new data file, the same discipline as `topic-resources.ts` — static,
reviewed in a PR, not a database until volume demands one:

```
QUESTION_SOURCES: Record<topic, { level, url, publisher, questionCount, verifiedOn }[]>
```

That is the entire build. No new ladder, no per-task authoring, no schema
migration on the plan engine.

---

## Why the student experience comes out smooth for free

You wanted the student to see a concept video once or twice, not on every task.
**That already happens by itself**, because the switch is driven by the
student's own coverage status:

- **Day 1, Percentages.** Status `learning` → phase `foundation` → the row shows
  the concept video.
- **Student marks it `practicing`.** Next time Percentages comes up — and
  `day-topics.ts` spaces topics out, so that is days later, not tomorrow — the
  phase is now `intensive` and **the same row is now a question link.**
- **Later, `revising`.** The row becomes CAT-level questions.

Nobody writes a rule saying "show the video twice then stop". It stops being
foundation. The engine already does this for the *label* on the task; we are
just letting the *link* follow the same rule.

Which also means: **max two videos per topic**, exactly as you said — one
concept, and optionally one exam-technique — because those are the only two
phases where a video is the right shape.

---

## What we do NOT do

- **No four videos per topic.** 11 of our 22 shipped topics carry 3–5 videos
  today; the extras are always the practice ones. Those slots become question
  links.
- **No new level system.** `CoverageStatus` is it. Five statuses, already
  written down once, in a file whose header explicitly forbids declaring a
  sixth copy of the ladder anywhere else.
- **We do not delete the 48 practice videos.** They demonstrably solve questions
  on screen. Park them — they are the "stuck on this question?" surface later,
  shown *after* an attempt. That is a separate, later feature.

---

## The one decision that is yours

**Where does a question link point?**

`resourceForTask` returns null for most topics today — the comment says so:
*"Null whenever we have nothing verified for this topic, which is the common
case."* So whatever we choose has to be fillable for ~40 topics.

- **(a) Link out** to free topic-wise question pages (2IIM, Cracku, iQuanta all
  publish them). Fastest — could be populated this week. **Cost: the attempt
  happens on someone else's page, so we learn nothing about it.** We get
  `resource_opened` and silence.
- **(b) Our own question bank.** Slow to build, but the attempt happens in-app:
  which question, how long, right or wrong. That is behaviour → problem →
  diagnosis → outcome, the thing `MISSION.md` calls the only compounding asset.
- **(c) Community-contributed**, the way Daily Pick already takes student
  submissions. Cheap, and it deepens as we grow.

**My recommendation: (a) now, (b) as the real answer.** Ship the links out this
week so no task is ever again a naked instruction, and treat it explicitly as
scaffolding — because practice is the one place where linking out costs us the
data the whole company is for. Concept can link out forever; teaching is
teaching wherever it happens. Practice is where we learn about the student.

**A second, smaller decision:** your *"tap here to search resource"* idea is a
good fallback for topics with no verified link. But it sends a student to
unverified content, which is the one thing our four guard tests currently
forbid. Worth deciding whether the fallback is allowed to be unverified, or
whether a topic with no link simply shows no row.

---

## Suggested order

1. **You answer the source question above.** Nothing else can start.
2. Fill `QUESTION_SOURCES` for the ~22 topics that already ship, easy + CAT level.
3. Change `RESOURCE_PREFERENCE` and the return type. Nine lines plus a union.
4. Surface renders one row, wording by kind — the four existing guard tests
   (never hosted, never mandatory, one link never a list, source always named)
   apply unchanged.
5. Only then: the `solutions` surface for the parked 48.
