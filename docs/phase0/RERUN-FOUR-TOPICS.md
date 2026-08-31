# The four fabricated topics, re-run

**31 August 2026, 19:20 IST.** Data: `docs/phase0/round2-rerun-verified.json`.
Replaces every round-2 candidate for Remainders, Circles, Coordinate Geometry
and Permutation & Combination — all eleven were fabricated
(`VERIFICATION-ROUND2-PLATFORM.md`).

## The method changed, and that is the point

Round 2 asked a model for videos and got plausible ids that did not exist. This
run never asks anything to produce an id. It asks the platform which videos
exist, and takes ids out of the answer:

1. **Discovery** — `vidiq_youtube_search`, eight queries across the four topics.
   Every id returned comes out of YouTube's own index, so **a fabricated id is
   structurally impossible**. There is no step at which a title could be
   invented and an id attached to it.
2. **Verification** — `vidiq_get_videos_by_ids`, one batch call over all
   fourteen chosen ids. All fourteen confirmed. This is redundant by design: it
   proves the ids were transcribed correctly and keeps every row's provenance
   identical to the other 60.

Title, channel, runtime, upload date and view count are platform-read. Nothing
below is a research claim.

## Result: 14 of 16 slots filled

| Topic | Filled | Was |
|---|---|---|
| Remainders | 4 / 4 | 0 of 4 real |
| Permutation & Combination | 4 / 4 | 0 of 2 real, 2 gaps |
| Circles | 3 / 4 | 0 of 3 real, 1 gap |
| Coordinate Geometry | 3 / 4 | 0 of 2 real, 2 gaps |

Net: **11 dead ids replaced by 14 live ones**, and the corpus is better covered
than the fabricated version claimed to be — round 2 declared five gaps it could
not fill; this run fills three of them.

### Remainders
- **L1 concept** — `taNnRLuS4pk` · *Remainder Theorem l Quant Number System 06 | CAT 2024* · MBA Wallah · 70.5 min · 179k views
- **L2 practice_easy** — `VSFs3JuKafY` · *Remainders 3: Euler's Theorem Cyclicity* · Rodha · 34.5 min · 178k views
- **L3 practice_cat** — `QCOjb5FT-lM` · *Remainders Revision | CAT 2025 Quants Revision Marathon | Euler, Fermat and Chinese Remainder theorem* · Point99 · 127.2 min
- **L4 exam_ready** — `Ic8NMOiavXE` · *Trick to Solve Remainder Questions in 30 Seconds* · Cracku · 5.0 min · 53k views

### Circles
- **L1 concept** — `4vj3U-tEjYE` · *Circles 1 Basic Terms + Angle Properties | Quant Geometry 07* · MBA Wallah · 44.9 min · 78k views
- **L2 practice_easy** — `IqfBailsqTk` · *CAT 2026 Easy Geometry Circles and Polygons* · Cracku · 67.3 min
- **L3 practice_cat** — `EzT5E9BZrTw` · *Circles || CAT All PYQs 2017-23 One Shot* · Mathological · 37.5 min
- **L4** — gap, see below

### Coordinate Geometry
- **L1 concept** — `9t7cKr-KZ8U` · *Coordinate Geometry 1 | Quant Geometry L10* · MBA Wallah · 67.7 min · 85k views
- **L2 practice_easy** — `0GNr5I019-I` · *Coordinate Geometry- 2 | Equations of line* · MBA Wallah · 75.8 min · 65k views
- **L3 practice_cat** — `MxioaLGqbqM` · *Coordinate Geometry CAT Questions - 01 | Target 99%ile+* · Career Launcher MBA · 23.7 min
- **L4** — gap, see below

### Permutation & Combination
- **L1 concept** — `8kvqSY1-W5Y` · *Permutations and Combinations 1: Fundamental Principle of Counting* · Rodha · 26.9 min · **381k views**
- **L2 practice_easy** — `fnFjdi4XbTQ` · *Permutations And Combinations - 1 | Quant Modern Maths 04* · MBA Wallah · 58.8 min · 159k views
- **L3 practice_cat** — `Wjz0YSv8Oj4` · *Permutations and Combinations CAT PYQs 2017-23 | One Shot* · Mathological · 76.8 min
- **L4 exam_ready** — `Kpmk4-d94f0` · *CAT 2026 Quant Revision — Permutations and Combinations by Sayali Ma'am (2-time CAT 99.97%iler)* · Cracku · 117.2 min

## The two gaps are real, and I am leaving them empty

Circles L4 and Coordinate Geometry L4 both want an exam-technique video for that
topic alone. What exists instead is whole-geometry revision — a CAT 100%iler
covering triangles, circles, quadrilaterals and coordinates in one two-hour
session. Attaching that to a circles task breaks the task-resource contract as
surely as a dead link does: the task names circles, the video delivers all of
geometry. Round 2 filled gaps like these by inventing something. Leaving them
empty is the correction.

## What I have NOT established: the level

Every level above is **provisional**. This is the same limit from this
morning's finding, and it has not moved: no platform field grades difficulty.

What is better here than in round 2 is the evidence the level rests on. Round 2
assigned levels from subtitles a model had generated. These are assigned from
the real title, the real runtime, and the publisher's own framing — "Basic
Video of Geometry", "Easy Geometry Circles and Polygons", "CAT PYQs 2017-23 One
Shot", "Revision by a 2-time 99.97%iler". A publisher calling its own video
basic is not proof it is L1, but it is a claim made by someone who watched it,
which is more than we had.

The ladder still needs your hand-check before any of this ships. Four spot
checks would settle most of it: `QCOjb5FT-lM` (is a 127-minute marathon really
L3, or is it L4?), `Ic8NMOiavXE` (5 minutes for an exam_ready slot — enough?),
`MxioaLGqbqM` (392 views; low reach, unverified quality), and `IqfBailsqTk`
(does "Easy" mean easy for a beginner or easy for a CAT aspirant?).

## Channel note

Eleven of fourteen come from four channels already trusted in the corpus —
Rodha, MBA Wallah, Cracku, Mathological. The three new ones are Point99, Career
Launcher MBA and Cracku's revision series. None is a platform class behind a
login; all fourteen are free YouTube videos, which was the failure mode of the
fabricated `FjC3L4s3C2A` "Unacademy CAT" entry.

## One tell worth recording

The fabricated rows carried `"dur": "NOT CONFIRMED"` — seven of the eleven — and
invented channel names that are near-misses for real ones: "Takshzila Shikshak"
and "Takshzila Shiksha" for **Takshzila**, "Elite's Grid" for **ELITES GRID**.
Both patterns appear *only* in the four fabricated topics and nowhere in the 60
real ones. Either would have flagged these four responses before a single id was
looked up. Worth a cheap grep on any future research round.
