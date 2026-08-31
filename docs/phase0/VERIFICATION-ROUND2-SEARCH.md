# Round 2 verification — what a search engine could and could not establish

**Date:** 2026-08-31
**Verifier:** web search only. vidIQ, the YouTube oEmbed endpoint, and every
Invidious/Piped mirror are blocked by this environment's egress policy, so the
platform-read runtime that round 1 relied on was not available.

This document exists because the answer to "are the 71 round-2 links real?" is
**still no, we do not know** — and the reasons why are worth more than the
partial list of confirmations.

---

## 1. Two methods were tried. Only the second one works.

### Bare video-id search — useless, and it nearly produced a false report

Searching the quoted eleven-character id on its own looked like a clean
existence test. It is not. Four ids that vidIQ had already confirmed real in
round 1 — `m6EGM_UtY-Q`, `4tI-h-GKWVk`, `spET6FqiBZ8`, `TBhanaOLNvc` — all
return nothing on a bare-id query. Search engines tokenize the id and do not
index it as a term.

Before that calibration, eight round-2 ids had come back empty and were on
their way to being reported as fabricated. That reading was an artifact of the
method, not a finding, and it is withdrawn. **Nothing in this document rests on
an empty bare-id search.**

The lesson is the same one the round-1 audit taught in a different costume: a
verification step that has never been run against a known-good and a known-bad
case is not a verification step.

### Title + channel search, reading the id back out of the URL — works

Searching the claimed title and channel, then reading the video id out of the
returned `youtube.com/watch?v=…` URL, tests four things at once: the video
exists, the title is right, the channel is right, and the id we hold actually
belongs to that video. That is the method used below.

It has one asymmetry that governs how its output may be used: **it can confirm,
it cannot refute.** A miss means the search did not surface the video, which is
consistent with the video not existing and equally consistent with the title
being wrong. Only a confirmation is evidence.

---

## 2. The finding that matters most: real ids, invented titles

Round 1's failure was fabricated videos. Round 2's dominant failure is
different and, for the planner, worse in one specific way.

Several ids confirmed as real came back under titles that do not match what the
research claimed:

| id | claimed title | actual title |
|---|---|---|
| `q-ZUkah-xys` | Averages 2: Group Changes \| Arithmetic for CAT 2026 | Averages 2 \| CAT Exam Preparation \| Arithmetic \| Quantitative Aptitude |
| `TMOq7m_OKUw` | Inequalities 5: AM-HM Inequality Applications | Inequalities 5 \| CAT Preparation 2024 \| Algebra \| Quantitative Aptitude |
| `4Ns1jYVuJ7s` | CAT RC Tricks for 99 percentile \| How to eliminate options in RC | CAT Reading Comprehension Tricks for 99 percentile \| How to eliminate options in RC \| CAT Preparation |

The pattern is an invented descriptive subtitle after a colon — "Group
Changes", "AM-HM Inequality Applications" — attached to a real video whose real
title says no such thing.

This is not cosmetic. The ladder position (L1 concept, L2 easy practice, L3
CAT-level, L4 exam-ready) was assigned from those subtitles. If the subtitle
describing what a video covers was generated rather than read, then **the level
assignment is generated too**, and a student sent to "L2 easy practice" may
land on anything. A resource at the wrong rung breaks the target-resource
contract just as surely as a dead link does — the task says fifteen easy
questions and the video delivers a CAT-hard marathon.

It also explains the low confirmation rate below. Many misses are searches for
titles that were never real, so the search had nothing to match.

---

## 3. Confirmed real — id, title and channel all check out

Thirteen of seventy-one. Each was confirmed by a returned YouTube URL carrying
the exact id.

| id | topic / level | channel |
|---|---|---|
| `m6EGM_UtY-Q` | Average L1 | Takshzila |
| `0xvx3q17jZs` | Average L3 | 2IIM CAT Preparation |
| `q-ZUkah-xys` | Average L4 | Rodha — title mismatch |
| `DcX3oOYVDh0` | Selection & Distribution L1 | ELITES GRID |
| `d38v_cGG0Y0` | Selection & Distribution L2 | ELITES GRID |
| `bIMpphNLj4o` | Selection & Distribution L4 | ELITES GRID |
| `gqYVcVjqW0k` | Hybrid DILR L1 | Rodha |
| `IzzDC2qCYu0` | Reading Speed Practice L1 | Gejo Speaks |
| `4Ns1jYVuJ7s` | Reading Speed Practice L4 | Ananta Chhajer — title mismatch |
| `X_CpUw7JPnU` | Functions L4 | Cracku |
| `zIrr1lkvyBY` | Inequalities L2 | Rodha |
| `-me6rKm0AcA` | Inequalities L3 | 2IIM CAT Preparation |
| `TMOq7m_OKUw` | Inequalities L4 | Rodha — title mismatch |

**None of these carries a verified runtime.** Every one is still barred from
`topic-resources.ts`, which requires a real `realMinutes` read off the platform.

---

## 4. Round 2 corrected a round-1 error

Round 1 gave Reading Speed Practice L1 as `0U5n10P3x_c` — one of the nine ids
the round-1 audit found did not exist. The video itself is real: "How to read a
passage effectively | CAT-RC-Series | GejoSpeaks" lives at `IzzDC2qCYu0`, and
that is exactly what round 2 returned.

So the round-1 fabrication was an id error attached to a real, correctly named
video, not an invented video. Worth recording because it is the first case
where a re-run repaired a known fabrication rather than producing a new one.

---

## 5. Two round-2 ids are contradicted by the search

Not proof of fabrication, but the claimed content demonstrably lives elsewhere.

- **`uC87E_QC_14`** — Hybrid DILR L4, claimed as "LRDI for CAT | Bottle Neck
  approach" (ELITES GRID). The Bottle Neck approach video is `uz9vTOTgxkU`.
- **`Ky5lzMv_1ns`** — Hybrid DILR L3, claimed as "CAT 2018 DILR Solutions |
  Slot 2 Set 8 | College Accreditation" (Aptitude Jab). College Accreditation
  is CAT 2018 Slot 2 **Set 1**, and appears at `AXTDqYeyRpI` and `ie3Ipz-EizQ`.
  Both the id and the set number are wrong.

---

## 6. Where this leaves the corpus

Unchanged, and that is the correct outcome. The standing rule holds:

> Gemini discovers, the platform verifies, a human spot-checks. No link reaches
> a student without all three.

Search has now done part of the platform's job — existence, title, channel — for
thirteen ids. It cannot do the rest. **Runtime remains unverified for all
seventy-one**, so none of them may enter `topic-resources.ts`, and the fifty-two
resources already shipped there are untouched by this round.

What is needed to close it out:

1. vidIQ reconnected — one batch call covers all 71 ids and returns ISO-8601
   durations, which is the only field still missing.
2. A re-grade of every ladder level, because section 2 shows the level came from
   an invented subtitle. Confirmed-real is not the same as
   confirmed-at-the-right-rung.
3. The three prompts still never run: #13 Sentence Completion, #14 Binary Logic,
   #29 Pipes & Cisterns.
