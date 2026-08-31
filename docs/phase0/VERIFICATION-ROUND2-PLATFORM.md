# Round 2, verified against the platform

**31 August 2026, 18:40 IST.** Method: `vidIQ.vidiq_get_videos_by_ids`, two batch
calls, all 71 candidate ids. Data: `docs/phase0/round2-verified.json`.

This supersedes `VERIFICATION-ROUND2-SEARCH.md`. That document was the best that
could be done without platform access; three of its conclusions were wrong, and
the reason they were wrong matters more than the corrections themselves.

---

## What changed

The blocker recorded last night was environmental, not analytical: vidIQ, Exa and
Firecrawl were authenticated on the account but reported `enabledInChat: false`,
and a connector toggled on mid-session does not enter a session already running.
They are present in this session. The batch call that had been queued since
06:30 ran in under a minute.

## The result

| | |
|---|---|
| Candidates checked | 71 |
| Real, with a platform-read runtime | **60** |
| Do not exist | **11** |
| Topics entirely clean | 17 |
| Topics entirely fabricated | **4** |

Every one of the 60 now carries the thing `topic-resources.ts` requires and
could not have: an actual runtime, read from the platform. The gate that held
all 71 out is open for 60 of them.

## Finding 1 — fabrication is topic-shaped, not scattered

The eleven non-existent ids are not spread across the corpus. They are four
whole topics, and those four topics contain nothing else:

| Topic | Real | Ghost |
|---|---|---|
| Remainders | 0 | 4 |
| Circles | 0 | 3 |
| Coordinate Geometry | 0 | 2 |
| Permutation & Combination | 0 | 2 |

The other seventeen topics returned 60 for 60. This is the useful shape: the
failure is per-response, not per-link. A response either did the work or
invented the whole answer. It changes the remedy from "audit every link" to
"re-run four prompts", and it means the clean topics need no further doubt cast
on them.

## Finding 2 — the durations were honest

Of 57 candidates carrying a numeric claimed duration, **56 were within two
minutes of the truth**; the worst error in the entire round is three minutes
(`-me6rKm0AcA`, 66:42 claimed against 63:44 real). Round 1 had twenty-two wrong
durations, one by more than twenty minutes.

The runtime check was ranked third in last night's queue on the assumption it
was a live risk. It was not. It was cheap, it was necessary for the gate, and it
passed. Ranking it third was right for a different reason than the one given.

## Finding 3 — three "contradictions" were false, and the method caused it

Search-based verification produced three false negatives. All three are real
videos, correctly filed, that the search method reported as wrong:

- **`uC87E_QC_14`** — reported as "the Bottle Neck video is `uz9vTOTgxkU`".
  Its real title is `LRDI for CAT | Bottle Neck approach`, ELITES GRID, 10:35.
  Exact match to the claim.
- **`Ky5lzMv_1ns`** — reported as "College Accreditation is Slot 2 *Set 1*, at a
  different id". Its real title is
  `CAT 2018 DILR Solutions | Slot 2 Set 8 | College Accreditation | Logical DI | Di`.
  Set 8, as claimed.
- **`JU-b_Zu-z7U`** — reported as "real video is *Numbers 3 || Number Systems*, a
  general lecture, not a divisibility drill". Its real title is
  `Numbers 3: Prime Composite Numbers Divisibility | Number System for CAT 2026 | Ravi Prakash Rodha`.
  The claim was right; the search returned a *different Rodha video* from the
  same series and the mismatch was attributed to the corpus instead of the tool.

That last one was the headline example in this morning's standing report. It is
withdrawn.

The pattern underneath all three: **a search engine returns something for every
query, so it cannot express "this does not exist" — only "here is the nearest
thing".** Whenever the nearest thing differed, the method read it as a
contradiction. A direct id lookup has an empty answer available to it, which is
exactly why it can refute and search cannot. This is now the third distinct
wrong conclusion drawn from search in two days (the bare-id fabrication finding
and the paid-push count were the first two, both already withdrawn).

**Rule going forward: existence, title, channel and runtime are established by
platform lookup only. Search is for discovery, never for verification.**

## Finding 4 — the ladder level is still the open question

Nothing here settles it. Of 60 real videos, 55 matched their claimed title
exactly or by prefix. Of the five that did not, four are punctuation or
truncation differences (`||` for `I`, a dropped trailing `| CAT Preparation`).
Only one is a genuinely different video from the one described:

- **`IgEKyxYTXDg`**, filed Set Theory L1 as `SET THEORY 1 || BASIC CONCEPTS || CAT LRDI`.
  Real title: `CAT 2025 I INTRODUCTION TO VENN Diagrams I LRDI I SWAPANIL SIR`.

So the round-1 diagnosis — invented subtitles implying invented levels — does
**not** reproduce in round 2's real videos. Their titles are, with one
exception, genuine. That removes the evidence for the level defect in round 2;
it does not remove the defect. The level was still assigned by a model reading a
title, and no platform field can grade difficulty. It stays at the top of the
queue as a judgement problem, not a data problem.

## Finding 5 — the corpus is old, and that is fine

**57 of 60 uploads predate 2025**; the median is 2019. Many carry a
"for CAT 2026" suffix the channel itself applies to an evergreen back catalogue —
Rodha genuinely renames and re-fronts its own series. Mathematics does not
decay, so age is not a defect. It is worth knowing only because a student who
opens a 2019 video from a card that says CAT 2026 will notice, and we should be
the ones who told them first.

## Where this leaves the corpus

- 52 live, verified.
- 60 verified and clearable, pending the level re-grade.
- 11 dead, and their four topics need re-running.
- 3 prompts never run: #13 Sentence Completion, #14 Binary Logic, #29 Pipes & Cisterns.

Four topics to re-run plus three never run is **seven prompts**, not the three
recorded this morning.
