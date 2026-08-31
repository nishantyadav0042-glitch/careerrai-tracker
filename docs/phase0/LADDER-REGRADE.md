# The ladder re-grade — and the error it exposed

**31 August 2026, 21:10 IST.** Data: `docs/phase0/ladder-regrade.json`, 137 rows.

I started re-grading difficulty. The founder stopped it mid-run with one
sentence: **a video is not practice — for practice there are questions.** That
is correct, and it means the thing I was grading was the wrong thing.

## The error

The ladder has four rungs:

| Rung | Intent | Is a video the right shape? |
|---|---|---|
| L1 | `concept` | **Yes** — you learn a concept by watching |
| L2 | `practice_easy` | **No** — practice is something you *do* |
| L3 | `practice_cat` | **No** — same |
| L4 | `exam_ready` | **Yes** — technique and traps are watchable |

Two of four rungs are video-shaped. The other two ask a video to stand in for
the student attempting questions, and it cannot. Watching someone solve six
questions is not six questions attempted; it is six questions *witnessed*. The
student who watches finishes with the pleasant feeling of having practised and
none of the retrieval that makes practice work.

**70 of 137 assignments — 51% of the corpus — sit in a practice rung filled by
a video.**

## Why this hid for so long

It hid inside a field I had been treating as a quality metric. WORKED QUESTIONS
SOLVED was described as the sufficiency test: does this video solve enough
questions to count as practice? The count was never the problem. **The question
was.** No count makes a video into practice; it only makes it a better or worse
walkthrough.

It also explains why the level re-grade kept coming back unresolvable across
three verification rounds. I was trying to grade the difficulty of practice
videos when practice was never a video slot. The grading was fine. The shelf
was wrong.

And it is the more expensive defect. A wrong level gives a student one video
that is too hard; they bounce and pick another task. A practice rung filled by
a video means **half the corpus quietly teaches passive study** — the exact
habit CAT punishes.

## Against the mission filter

`docs/MISSION.md` question 2: *does it deepen what we learn about how this
student studies?*

A student who watches a solutions video leaves us `resource_opened` and nothing
else. A student who *attempts* questions leaves behaviour → problem → diagnosis
→ outcome, which is the only compounding asset we have. So the practice rungs
are simultaneously the largest half of the corpus and the half that teaches us
least. That is exactly backwards.

## The fix

Three video intents, not four, plus one that is not a video:

- **`concept`** — teach it from scratch. Video is right.
- **`exam_ready`** — technique, traps, pace. Video is right.
- **`solutions`** *(new)* — a worked walkthrough shown **after** the student
  attempts, never instead of attempting. This is where the good "practice"
  videos actually belong, and it is a genuinely useful surface: the student
  attempts, gets it wrong, and *then* watches someone do it properly.
- **`practice`** — removed as a video slot. It must be questions the student
  attempts.

Where those questions come from is a founder decision, not mine. The plan engine
already issues question targets; there is a question bank question, and Daily
Pick already has students contributing content. I am not picking between those.

## What the 70 practice slots actually are

| | Count | What to do |
|---|---|---|
| Demonstrably solve questions on screen | **48** | Re-shelve as `solutions` — they are good, just mislabelled |
| A concept video sitting in a practice slot | **8** | Move to `concept` |
| No evidence of solving anything | **14** | Watch or drop |

The 48 are not wasted work. They are the whole `solutions` shelf, already
verified, already runtime-checked — the new intent arrives populated.

### The 8 mis-shelved concept videos
`spET6FqiBZ8` Arrangements · `7AKFH60Jiik` Para Jumbles · `MYud15DuP6s` Average ·
`rUI1bbCvk7E` Lines & Angles · `9H2CftySPkI` Triangles · `17lfsV7IbR0` Mensuration ·
`mp1A85pK6YQ` Base System · `qmNtXHFjMOY` Binary Logic

Two are self-evident: `rUI1bbCvk7E` is titled *"Geometry Introduction"* and
`mp1A85pK6YQ` is *"Base System for CAT: Part 1 (Introduction)"* — five minutes
long, filed as easy practice. A student sent there to practise gets a
five-minute introduction.

**Caveat on this list:** the rubric reads series numbering, and "Set - 1" or
"Part 1" can false-positive as concept. `spET6FqiBZ8` (*Linear Arrangement I Set
- 1*) is probably a solved set, not a concept video. Eyeball these eight; do not
bulk-move them.

## The re-grade proper, on the 67 rungs that survive

Of the 67 genuinely video-shaped assignments: **24 match**, **9 look
mis-graded**, **34 gave no signal** (no description chapters, no title lexicon —
which means unproven, not wrong).

The nine to look at:

| Video | Topic | Filed | Looks like |
|---|---|---|---|
| `TBhanaOLNvc` | Average | concept | exam_ready |
| `NTxJBUAnAq0` | Coordinate Geometry | exam_ready | concept |
| `zIrr1lkvyBY` | Inequalities | concept | exam_ready |
| `8TygSoo-4Ig` | Progressions | exam_ready | concept |
| `X3c60CCB18U` | Quadratic Equations | concept | exam_ready |
| `CKiP208avbc` | Time Speed Distance | concept | exam_ready |
| `Kblu48aZ7bA` | Time Speed Distance | exam_ready | concept |
| `6FEnbG2Ux5o` | Functions | concept | exam_ready |
| `HhtLt2JZKu4` | Mensuration | concept | exam_ready |

Most are the same shape: a Rodha/ELITES numbered lecture whose title carries
both a concept word and a technique word. These are close calls and low stakes
next to the structural finding above.

## One more thing, and it is worse than the nine

**Three topics have no concept video at all** — Para Jumbles, Progressions,
Ratio & Proportion. A student meeting Para Jumbles for the first time is handed
a practice video and never taught the thing. Under the corrected model, Para
Jumbles and Ratio & Proportion have *nothing shippable*: their only rung is a
practice slot that should not exist.

That is the first gap to close, ahead of every level question in this document.
