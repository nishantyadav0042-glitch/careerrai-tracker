# What was in the inputs that never made it into the logs

**Date:** 31 Aug 2026
**Trigger:** founder — *"just consume all the inputs without a single word miss."*

Rebuilt from the session transcript: 40 founder messages, 289,888 characters,
of which 15 messages carry Gemini research responses.

---

## 1. No link was lost. Five fields per link were.

Every one of the **165 video ids** the founder ever pasted is present in one of
the existing logs. Nothing was dropped at the link level.

The loss was one level down. Each response carries eleven fields; the round-2
log stored six:

| Field | Round 1 | Round 2 | Recovered |
|---|---|---|---|
| TITLE, CHANNEL, URL, DURATION | kept | kept | — |
| REAL STUDENT TIME | kept | kept | — |
| **WORKED QUESTIONS SOLVED** | kept | **dropped** | ✅ |
| **PAID-COURSE PUSH** | kept | **dropped** | ✅ |
| **WATCHED FULLY?** | kept | **dropped** | ✅ |
| **REAL DIFFICULTY** | kept | **dropped** | ✅ |
| **WHY THIS ONE** | **dropped** | **dropped** | ✅ |

`WORKED QUESTIONS SOLVED` is the one that matters most, because it is the
founder's own sufficiency test: *if the task says solve fifteen questions, the
link has to actually contain them.* Dropping it removed the only evidence for
the single judgement the whole feature rests on.

Everything is now recovered into `docs/phase0/RESPONSES-COMPLETE.json` — 250
level blocks, every field, every block attributed to a topic — with the
unedited source in `docs/phase0/GEMINI-RESPONSES-VERBATIM.md`. A guard test
(`research-record-complete.guard.test.ts`) fails if the structured record ever
falls behind the archive again.

---

## 2. The sufficiency gap, now that it is measurable

Of the **34 shipped rows carrying a practice intent**, ten claim to work
**fewer than four questions**:

| Video | Topic | Shipped as | Questions worked |
|---|---|---|---|
| `MTdAQnGCUtM` | SI & CI | exam_ready | **1** |
| `8TygSoo-4Ig` | Progressions | exam_ready | **1** |
| `PQvBSkJDF_E` | Time Speed Distance | practice_easy | 2 |
| `Kblu48aZ7bA` | Time Speed Distance | exam_ready | 2 |
| `wSbjXsULtrI` | Progressions | practice_easy | 2 |
| `OyGkBz2DxAQ` | Profit & Loss | exam_ready | 2 |
| `qQcGkxuf4ws` | Mixtures | practice_easy | 2 |
| `NXlFmkHm0N0` | Coordinate Geometry | practice_cat | 2 |
| `6IbA-nSj28g` | Time & Work | practice_easy | 3 |
| `TG3M3QFyY0k` | SI & CI | practice_easy | 3 |

A further ten practice rows carry **no question count at all** — Arrangements,
Tables, Charts, Games & Tournaments, and RC. That is defensible rather than
alarming: for DILR the unit is a set and for RC a passage, so "questions
worked" is the wrong measure there, exactly as `routine-engine.unitFor()`
already says.

**This is a review list, not a verdict** — see §3 for why the numbers cannot be
trusted individually. What it is good for is ordering the human spot-check: a
task that says "solve 15 questions" pointing at a video that works one is the
precise failure the founder described, and these ten are where to look first.

---

## 3. The recovered numbers disagree with themselves

Thirty-three videos appear in more than one response. Comparing a video against
its own other appearance:

- **question count drifts in 8**
- **duration drifts in 8**
- **assigned ladder level drifts in 5**

Worked examples: `CKiP208avbc` is 1 question in one run and 4 in another.
`K6Jk3uEkIMA` is 26:15 in one run and 28:04 in another — the real runtime is
30:43, so both are wrong. `TBhanaOLNvc` is graded L1 in one run and L2 in
another, and `RHflaojKVlI` L3 then L4.

Two things follow.

First, the earlier decision **not** to store question counts in
`topic-resources.ts` was right, and is now proven rather than asserted. A field
that contradicts itself in a quarter of the cases it can be checked against is
not a fact about a video; it is a guess. It stays in the research record and
out of the product.

Second, and more important: **level drift in 5 of 33 independently confirms the
round-2 finding.** That finding came from a completely different method —
searching titles and reading ids back out of URLs — and said the ladder level
was generated from an invented subtitle rather than read off the video. Two
unrelated lines of evidence now agree that the L1–L4 assignment is the least
trustworthy thing in the corpus. The re-grade owed on round 2 is owed on round 1
as well.

---

## 4. Two smaller findings

**Paid-course push.** Only three blocks are genuinely marked `heavy` — the
Unacademy Coordinate Geometry L2 candidate and Remainders L4 (`M2_xYx3L71k`).
**None of them is shipped.** An earlier reading of this field counted fifteen,
because the unfilled template string `(none / mild / heavy)` matched a naive
search for the word; correcting that is what took the number from alarming to
routine.

**Watch status.** Twelve of the fifty-two shipped rows do not carry a clean
"yes": seven say `partly` and five returned the answer with the template
prefix still attached. `partly` matters because every other field in those
blocks — question count, difficulty, runtime — is then a claim about a video
that was, by its own account, not watched to the end.

---

## 5. What this changes

Nothing ships or un-ships on the strength of this. The 52 live resources stay
live: they were verified for existence, channel and runtime against the
platform, which is the check that protects a student from a dead or wrong link,
and none of them carries a heavy paid push.

What it changes is the queue. When verification resumes, the order is:

1. **Re-grade ladder levels** — round 1 and round 2 both. This is now the
   best-evidenced defect in the corpus and it is the one that puts a student
   in front of the wrong difficulty.
2. **Spot-check the ten low-question practice rows** by hand, hardest cases
   first, against the actual video.
3. **Then** the 71 round-2 runtimes, which is the only thing vidIQ is needed
   for.

And the standing rule gains a clause: research inputs are archived verbatim
before they are summarised. A summary is a decision about what mattered, and
this one was made wrong once already.
