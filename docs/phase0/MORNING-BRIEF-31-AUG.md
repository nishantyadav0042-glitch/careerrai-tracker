# Morning brief — Phase-0 resource research

*Written overnight, 31 Aug 2026, under founder authority. Everything is
committed and pushed to `claude/cat-prep-free-content-5k73d4`.*

---

## What I did while you slept

1. **Logged the last three responses** (Quadratic Equations, Inequalities,
   Logarithms re-run) — 29 of 46 topics now collected.
2. **Built safe custody** — `docs/phase0/resource-corpus.json`. Every link,
   every claim, every honest gap, in structured machine-readable form.
   **104 video links and 24 recorded gaps are preserved and pushed.**
   Nothing from the research can be lost now.
3. **Analysed all 104 links one by one** —
   `docs/phase0/PHASE0-LINK-ANALYSIS.md`, a per-topic report with a
   verification tier, task-fit judgment and reading for every single link.
4. **Found the most serious defect of the whole batch** (below).

## First, the honest caveat — I could not verify live

`youtube.com` is policy-denied at this session's gateway (403 on CONNECT),
and vidIQ, Exa and Firecrawl all disconnected during the night. So I could
not open a single video to confirm it exists.

I did not let that stop the work, and I did not fake it either. Instead I ran
a **forensic** analysis using five things that need no network:
- the **hard vidIQ ground truth for 7 videos** captured earlier in this session
- **cross-run comparison** (four topics were answered twice — a natural control)
- **link-format screening** (search-link vs real URL)
- **title-pattern comparison** against titles we know are real
- **internal contradiction detection**

Every link now carries an explicit tier, so you always know what is fact and
what is still a claim.

---

## The headline finding — and it is a bad one

**The same video was reported with two different durations.**

Logarithms was answered twice. Both runs returned video `K6Jk3uEkIMA`:
run 1 said **26:15**, run 2 said **28:04**. The second video `SzseQAYENMc`:
run 1 said **24:06**, run 2 said **26:17**.

A video's duration is an objective, immutable fact. Two different answers for
the same video ID means **Gemini is not reading real metadata — it is
generating plausible numbers.** Not always, and not for everything, but it is
doing it somewhere.

This reframes the whole dataset. Until now I had recorded that "video ID,
title and channel are stable; level and question count drift". Duration was
the field I still trusted. It is now the field that proves the mechanism.

**What survives:** for the 7 videos I verified against real metadata, every
single duration Gemini gave was **exact to the second**. So the model is
genuinely accurate on real videos it has really seen. The fabrication is a
*separate mode*, not general sloppiness — which is good news, because it
means the corpus is salvageable by verification rather than worthless.

---

## The numbers

| Tier | What it means | Count |
|---|---|---|
| **A** | Ground truth, verified via vidIQ | **4** |
| **B** | Same video across 2+ runs, consistent | **6** |
| **C** | Single run, direct URL, nothing suspicious | **75** |
| **D** | Same video, **conflicting** metadata | **10** |
| **E** | Search-link instead of a real URL → **reject** | **9** |
| GAP | Honest "no good video found" | 24 |

**9 links must be thrown away outright. 10 have data we cannot trust. 75 are
plausible but unverified. Only 10 are solid.**

## Two responses are fabricated, and one of them is alarming

- **Hybrid DILR Sets** — 3 of 3 filled levels are search-links with invented
  titles, all claiming "watched fully".
- **Functions** — **all four** levels, same pattern. This is the alarming one:
  Functions is a *mainstream* CAT algebra topic with abundant real coverage.
  Rodha's own numbered Algebra series produced our verified Logarithms
  videos. There was no scarcity to explain the invention.

That killed my last theory. Fabrication is not limited to obscure topics, not
limited to a section, and cannot be spotted from the shape of a response —
Caselets refused three levels honestly on an equally thin topic.

**Across 29 responses the only reliable discriminator is the link format.**
A `google.com/search` href instead of a `youtube.com/watch` href caught every
single fabricated response and raised no false alarms. That one check is now
the first gate on everything.

---

## The finding that matters most for the product (not the research)

Four VARC units each returned an independent structural verdict that they are
**not CAT question types at all**:

| Unit | Verdict |
|---|---|
| **Grammar** | **Removed from CAT after 2014.** Modern VARC tests only RC, Para Jumbles, Para Summary, Odd One Out, Sentence Placement. |
| Vocabulary | No standalone vocab questions since ~2015; tested only inside RC |
| Editorial Reading | A reading habit, not a question type |
| Reading Speed Practice | A skill, exists only inside RC passages |

That is **four of VARC's nine units**. Our plan engine is scheduling daily
tasks against topics CAT does not test as question types. Our own
`topics-constants.ts` already half-knows this — it separates
`READING_HABIT_UNITS` from exam topics — but `Editorial Reading`, `Vocabulary`
and `Grammar` all sit inside `VERBAL_TOPICS` regardless.

**This is a founder decision, not a research output.** I have not touched the
engine. Two questions for you:
1. Should the engine keep scheduling daily tasks on these units?
2. If yes, what should a task on "Grammar" even ask a student to do, given
   CAT has not tested it in a decade?

---

## The reframe that makes all of this simpler

We have been researching **four levels per topic**. But the product only ever
shows **ONE link per task**. That was the rule from the very first day:
*default one resource, at most two, never a list.*

So the real question was never "do we have four levels for all 46 topics".
It is: **"for the one task a student sees today, do we have one good link?"**

Measured that way the picture is much better than the tier table suggests.
Most topics deliver 2–3 solid, usable levels, and 2–3 is plenty — because a
student on any given day is in exactly one state, and needs exactly one link.

## What is genuinely usable right now

The three Phase-0 topics are in the best shape of anything in the corpus:

- **Percentages** — L1 and L4 are **Tier A ground truth** (26:19 and 31:22,
  1.18M and 1.83M views, both from Rodha's organised 65-part playlist), plus
  a verified gap-filler at 20:16. This is a complete, real, three-step ladder.
- **Arrangements** — L1 and L2 are **Tier A ground truth**, and both were
  independently reproduced across two separate Gemini sessions with an
  identical structural read (L1 solves zero sets; L2 solves one). That is the
  strongest corroboration anywhere in this research.
- **Reading Comprehension** — all four levels now have candidates, closing
  the RC video gap that earlier research flagged as a real hole. But L2 is 72
  minutes and L3 is 118 minutes, which no daily task slot can hold.

Also genuinely clean, and worth keeping: **Para Summary** (the best VARC
ladder found), **Logarithms** and **Inequalities** (best duration profiles —
16 to 26 minutes, they actually fit a task slot), **Games & Tournaments**,
and **Mixtures**.

## How this helps a student — concretely

Today the app says *"Solve 12 Percentages questions"* and the student has
nowhere to go. With this corpus, the same card can say:

> **Percentages · 12 questions**
> New to this? Start here — free, ~26 min *(Rodha, verified)*
> Already know it? Practice here instead — free, ~20 min

The student who would have closed the app now has a door. And because the
link is attached to *their* task at *their* level, it is the one thing no
YouTube channel and no coaching site can do: **the right resource, for this
person, today.**

That is the whole thesis, and the corpus can now support it for at least
6–8 topics without any further research.

---

## What needs your hand, in priority order

1. **Two re-runs** — *Pipes & Cisterns* (prompt echoed, no answer arrived)
   and *Average* (one video ID given for two different levels).
2. **Two rejections to confirm** — throw away the *Functions* and
   *Hybrid DILR* responses entirely rather than trying to salvage them.
3. **One policy decision** — roughly 15 candidates exceed an hour, several
   claiming 90–150 minutes of student time. Reject them, or split them across
   days with timestamps? One decision, not fifteen.
4. **One product decision** — the four VARC units above.
5. **One channel decision** — Cracku's *YouTube channel* appeared as a
   candidate, but we rejected Cracku's *website* on the logged-out access
   gate. Channel and website are different surfaces; don't let a blanket
   "Cracku rejected" carry over silently, or let it in silently.

## My recommendation

**Do not push for all 46 topics.** The corpus already covers the three
kill-test topics well, plus several more. The bottleneck was never discovery
— it is verification, and verification is currently blocked.

The highest-value next step is the one thing only you can do: **the phone
hand-check on the three Phase-0 topics.** Nine links, thirty minutes, on a
real Indian connection. That closes the kill-test and tells us whether any of
this reaches a student at all — which is the question we set out to answer,
and the only one that actually gates the build.

---

## Files

| File | What it is |
|---|---|
| `docs/phase0/resource-corpus.json` | **Safe custody.** Every link, claim and gap, machine-readable |
| `docs/phase0/PHASE0-LINK-ANALYSIS.md` | Per-topic report — every link analysed individually |
| `docs/GEMINI-RESPONSES-RAW.md` | The running collection log with findings as they emerged |
| `docs/GEMINI-PROMPT-FACTORY.md` | The 46 prompts (17 still to run) |
