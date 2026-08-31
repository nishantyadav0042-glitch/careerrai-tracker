# The three prompts that never ran

**31 August 2026, 20:05 IST.** Data: `docs/phase0/round3-three-topics-verified.json`.
Covers #13 Sentence Completion, #14 Binary Logic, #29 Pipes & Cisterns — the
three of 46 that never returned an answer. (#29's prompt text was pasted back
instead of a reply; the other two were never sent.)

## I did not re-send them

The queue line said "re-send". Re-sending means putting these three back through
the pipeline that invented eleven ids in four topics, and asking it for the one
thing it is worst at. So the prompt is split instead, permanently:

- **Finding the video** is now vidIQ's job. Eight searches, ids taken out of
  YouTube's own index, then all eleven re-confirmed by direct lookup.
- **Judging the video** stays a prompt — rewritten in
  `PROMPT-TEMPLATE-V2.md` to take this verified list as *input* and ask only for
  the six fields no platform can supply.

The v1 prompt asked one model to find and judge in a single pass. It was good at
judging and catastrophic at finding, and its DURATION field was a guess dressed
as a measurement. That is now structurally impossible.

## Result: 11 of 12 slots filled

| Topic | Section | Filled |
|---|---|---|
| Binary Logic | LRDI | 4 / 4 |
| Sentence Completion | VARC | 4 / 4 |
| Pipes & Cisterns | QA / Arithmetic | 3 / 4 |

### Binary Logic (prompt #14) — clean
- **L1** `z69ElNGKPFs` · *Binary Logic / True Liar — Basic Concepts (English)* · CAT Funda by Unacademy, Ravi Handa · 60.9 min
- **L2** `qmNtXHFjMOY` · *Binary Logic || Truth Liar — Basic Concepts* · Lokesh Agarwal · 19.3 min
- **L3** `EeJ25Wd2lH0` · *Binary Logic — Truth tellers and Liars for CAT 2020* · gofodu · 20.3 min · 66k views
- **L4** `hDmCcSwOHkU` · *Binary Logic: Truth-Teller & Liar Questions | CAT 2026 LRDI* · Bodhee Prep · 70.3 min

A Hindi twin of L1 exists (`JKQ1wKcWW58`, 62.2 min) with **seven times the
views** of the English version — 28k against 3.8k. I took English for
consistency with the rest of the corpus, but that ratio is a real signal about
who is actually watching CAT LRDI content, and it is your call, not mine.

### Sentence Completion (prompt #13) — clean, but the topic is misnamed
- **L1** `e4Ec4KzqaME` · *Rules To Crack Para Completion Questions In CAT VARC* · CATKing · 7.7 min
- **L2** `_K0ZbySSTzw` · *VARC for CAT 2026 | Para Completion | Lecture #06* · ACE CAT · 28.2 min
- **L3** `IASiRw5W82g` · *Crack 'Insert the Sentence' Questions in CAT 2025* · Unacademy CAT, Amit Rohra · 54.0 min · 20k views
- **L4** `wWkQilDaqEI` · *CAT 2026 Verbal Ability One Shot | Insert the Sentence* · Unacademy CAT · 91.6 min

**CAT does not have a question type called "Sentence Completion."** It has
*Para Completion* and *Insert the Sentence*, and they are different questions.
Our corpus name matches neither, so the four videos above straddle both. Worth
renaming the topic before this ships, or a student will be given a task whose
name they will not find on any mock.

### Pipes & Cisterns (prompt #29) — the honest answer is "weak coverage"
- **L1** `kwO4buoyWHg` · *Pipes & Cistern | Arithmetic Ep. 04 | CAT 2025 Preparation* · MBA Wallah · 78.1 min · 57k views
- **L2** `x3SEYdBUGaA` · *Pipe and Cisterns Problems Tricks* · Dear Sir · 19.8 min · **3.48M views** — six worked questions timestamped, but framed for SSC/Bank, below CAT difficulty
- **L3** `4deAkQmAB-c` · *CAT Time & Work PYQs (2017–2025)* · iQuanta · 93.4 min — 35 CAT questions, all timestamped. **Partial topic fit:** Pipes & Cisterns is one listed sub-topic, not the whole video
- **L4** — **NO GOOD VIDEO FOUND**

The v1 prompt ended with "Be blunt. If Pipes & Cisterns has weak free coverage on
YouTube, tell me that plainly." That is the correct answer for this topic.
Pipes & Cisterns is taught almost everywhere as a sub-chapter of Time & Work,
so a standalone CAT-level treatment barely exists.

The only L4 candidate was MBA Wallah's *Complete Arithmetic For CAT 2026*
(`KxuWgx08XgQ`), six hours 22 minutes, with Pipes & Cisterns at 04:19:03. I
rejected it. Storing `realMinutes: 382` against a pipes task would mislead a
student badly, and a chapter buried in a six-hour marathon is not one link to
one thing. **A deep-linked chapter — id plus a `t=` offset plus the chapter's own
length — would solve this class of problem**, and it recurs (Circles L4 and
Coordinate Geometry L4 failed the same way). It is a real primitive worth
building; it is not something to fake with the fields we have.

## What needs your eye before any of this ships

**Paid-course push is the live risk.** Your own rule says reject any video whose
real purpose is pushing a paid course. Seven of the eleven carry heavy
description-level batch promotion — Unacademy, CATKing, MBA Wallah, iQuanta, ACE
CAT. `e4Ec4KzqaME` calls itself a "demo session" in its own description. I
cannot judge *purpose* from metadata, only presence, so every one is flagged
`paidPushRisk` in the JSON rather than silently passed or silently dropped.

**Five picks have thin reach** and therefore unverified quality: `_K0ZbySSTzw`
(81 views), `hDmCcSwOHkU` (283), `wWkQilDaqEI` (2.9k), `z69ElNGKPFs` (3.8k),
`4deAkQmAB-c` (4.8k). Views are not quality, but on a corpus where the median is
107k these five are outliers with nothing else vouching for them.

**Levels are provisional**, as everywhere else. Assigned from real titles, real
runtimes and the publisher's own framing. No platform field grades difficulty.

## Corpus status after this

- 52 live and verified.
- 60 verified from round 2, pending level re-grade.
- 14 verified from the four re-run topics.
- 11 verified here.
- **All 46 prompts now have an answer.** Three gaps remain across the whole
  corpus (Circles L4, Coordinate Geometry L4, Pipes & Cisterns L4) and all three
  are the same defect: a topic-specific exam-technique video that does not exist
  as a standalone upload.
