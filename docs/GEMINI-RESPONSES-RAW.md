# Gemini responses — raw collection log (46 topics)

> Collection in progress. Responses are logged here verbatim-in-substance as
> they arrive from the founder's Gemini runs (`docs/GEMINI-PROMPT-FACTORY.md`).
> **Nothing here is verified yet.** Verification (vidIQ metadata cross-check,
> duration/channel/availability confirmation) and the consolidated report
> happen once all 46 are in — per the founder's instruction to consume the
> full batch before reporting.
>
> Treat every claim below as an untrusted external research claim until the
> verification pass marks it otherwise.

## Status

| # | Topic | Received | Notes |
|---|---|---|---|
| 1 | Reading Comprehension | ✅ | 4/4 levels filled |
| 2 | Percentages | ✅ | 4/4 levels filled |
| 3 | Arrangements | ✅ | 3/4 levels + 1 honest "NO GOOD VIDEO FOUND" (L4) |
| 4 | Editorial Reading | ✅ | 1/4 levels + 3 structural "NO GOOD VIDEO FOUND" — see the habit-track finding below |
| 5 | Tables | ✅ | 3/4 levels + 1 "NO GOOD VIDEO FOUND" (L4) |
| 6–46 | — | pending | |

---

## Prompt 2 — Percentages (QA / Arithmetic)

| Level | Title | Channel | Video ID | Stated duration | Worked Qs claimed | Difficulty claimed | Paid push | Student time claimed |
|---|---|---|---|---|---|---|---|---|
| L1 CONCEPT | Percentages 1: Fractions to Percentages | Rodha | `x-k8iSNr85g` | 26:19 | 9 | basic | none | 45–60 min |
| L2 EASY PRACTICE | Percentages 2: Successive Percentage Change | Rodha | `lzI_bpPpezE` | 22:46 | 5 | basic–medium | none | 40–50 min |
| L3 CAT-LEVEL | All CAT Questions from Percentages, CAT 2017–2021 (Blitzkrieg) | 2IIM CAT Preparation | `BaBpzV3DwEE` | 1:09:09 | 8 | CAT-level | **mild** | 90–120 min |
| L4 EXAM-READY | Speed Maths 1: Percentage of a Number | Rodha | `VT9-jeEmlJ8` | 31:22 | 6 | medium | none | 50–60 min |

**Open items for the verification pass:**
- `lzI_bpPpezE` and `BaBpzV3DwEE` are NEW — never seen in earlier passes. Both
  need vidIQ metadata verification (duration, channel ownership, availability).
- **Cross-run inconsistency (important):** an earlier Gemini run recommended
  `3ox1DwbOOx0` ("Percentages 3: Percentage Increase Decrease", 20:16,
  verified) as the middle-difficulty gap-filler. This run recommends
  `lzI_bpPpezE` ("Percentages 2") for the same L2 slot and does not mention
  Percentages 3. Two runs, two different answers for one slot — exactly what
  the v3 protocol's "consensus is not proof" rule anticipates. Both are from
  the same Rodha playlist; the curator picks one on hand-check, or we keep
  one as the backup.
- **Worked-question count drift on the SAME video:** earlier run said
  `x-k8iSNr85g` has 7 worked examples; this run says 9. Neither is verifiable
  by metadata. Treat all Gemini question-counts as approximate, never as the
  number we print on a task card (this is precisely why the target-resource
  contract phrases counts in time when unverified).
- `BaBpzV3DwEE` — first non-Rodha video candidate (2IIM's own channel) and
  the first "past CAT questions solved" video found. Potentially high value,
  but 69 min stated / 90–120 min claimed student time overshoots any single
  task slot; likely needs to be split across days or used at a coarser
  granularity. Also carries a self-reported "mild" paid push.

---

## Prompt 3 — Arrangements (DILR)

| Level | Title | Channel | Video ID | Stated duration | Worked sets claimed | Difficulty claimed | Paid push | Student time claimed |
|---|---|---|---|---|---|---|---|---|
| L1 CONCEPT | Linear and Circular Arrangement - I | Rodha | `4tI-h-GKWVk` | 20:11 | **0** | basic | none | 35–45 min |
| L2 EASY PRACTICE | Linear Arrangement I Set - 1 | Rodha | `spET6FqiBZ8` | 10:57 | 1 | basic | none | 20–30 min |
| L3 CAT-LEVEL | High LEVEL DILR puzzle & Detailed way to solve these puzzles | ELITES GRID - CAT PREP | `lF5YGHFysBA` | 34:36 | 1 | CAT-level | **mild** | 50–65 min |
| L4 EXAM-READY | — | — | — | — | — | — | — | **NO GOOD VIDEO FOUND** |

**Notes:**
- **L1 and L2 independently reproduce our own verified picks**, including the
  key detail that L1 solves **zero** sets (matches the earlier full-watch
  review exactly) and L2 solves one. Two independent Gemini runs converging
  on the same two videos, with the same structural read, is the strongest
  signal we have so far on this topic — though still not proof.
- `lF5YGHFysBA` is NEW and the **first candidate from a channel other than
  Rodha or 2IIM** (ELITES GRID - CAT PREP). Channel legitimacy is therefore
  unverified and must be checked properly — this is exactly the Tier-1/2/3
  provenance gate, and an unfamiliar channel gets no benefit of the doubt.
- **The L4 "NO GOOD VIDEO FOUND" is a high-quality answer, not a failure.**
  The stated reasoning — that CAT Arrangements has no genuine formulaic
  shortcuts, and YouTube videos claiming them typically teach Banking/SSC
  circular tricks that do not transfer to CAT's reasoning-heavy sets — is a
  substantive domain judgment, and it matches our own finding that
  Arrangements speed comes from case-elimination discipline built through
  solved sets. This is the honest-gap behaviour the prompt was written to
  elicit; it should be treated as a finding, not a hole to be filled.

---

## Prompt 1 — Reading Comprehension (VARC)

| Level | Title | Channel | Video ID | Stated duration | Passages claimed | Difficulty claimed | Paid push | Student time claimed |
|---|---|---|---|---|---|---|---|---|
| L1 CONCEPT | Cracking RC 101 — The Ultimate Guide to Acing Reading Comprehension | 2IIM CAT Preparation | `Qt_FK9fWlMg` | 25:55 | 0 | basic | none | 35–45 min |
| L2 EASY PRACTICE | RODHA VARC — RC Practice Session, CAT 2023, Episode 1 | Rodha | `iYr1qM9D69M` | **1:12:14** | 1 | medium | mild | 75–90 min |
| L3 CAT-LEVEL | CAT 2025 Slot 3 VARC Marathon — RC Video Solutions | 2IIM CAT Preparation | `Ky8gB3a26nw` | **1:58:09** | 4 | CAT-level | none | 130–150 min |
| L4 EXAM-READY | CAT RC: Traps in Answer Choices — Smart Option Elimination | Career Launcher MBA | `ak5_O5CbrJE` | 27:20 | 1 | CAT-level | none | 45–60 min |

**Open items for the verification pass:**
- **This closes the RC video gap.** Earlier passes found only text resources
  for RC (Bodhee article, 2IIM passage bank) and flagged the absence of any
  RC video as a real hole. All four levels now have candidates.
- **Duration problem, and it is serious.** L2 is 72 min and L3 is 118 min
  stated; claimed student time is 75–90 and 130–150 min. Our RC task shapes
  are "Read + solve 2–3 passages" (foundation) and "3–5 passages, timed"
  (practising). A 118-minute video cannot sit under a single day's task —
  it is 2–3 days of a student's entire study slot. This is the same
  overshoot pattern that got the 57-minute Percentages live-class rejected
  earlier, and it needs an explicit decision: reject, or split across days
  with timestamped entry points (which the "no playlist-position / no
  timestamp dependence" stability gate currently discourages).
- **Two new channels to vet:** `Career Launcher MBA` (L4) is the third
  non-Rodha/2IIM source to appear. Provenance and tier assignment unverified.
- `Ky8gB3a26nw` is a **CAT 2025 Slot 3** solution video — genuine past-paper
  content, high value in principle. Worth checking whether shorter
  single-passage cuts of the same material exist on the same channel.

---

## Prompt 4 — Editorial Reading (VARC)

| Level | Title | Channel | Video ID | Stated duration | Qs claimed | Difficulty claimed | Paid push | Student time claimed |
|---|---|---|---|---|---|---|---|---|
| L1 CONCEPT | From where should we read editorials? (AskPatrick) | Patrick100 | `G8IXAwpurqc` | **3:02** | 0 | basic | none | 10–15 min |
| L2 EASY PRACTICE | — | — | — | — | — | — | — | **NO GOOD VIDEO FOUND** |
| L3 CAT-LEVEL | — | — | — | — | — | — | — | **NO GOOD VIDEO FOUND** |
| L4 EXAM-READY | — | — | — | — | — | — | — | **NO GOOD VIDEO FOUND** |

### STRUCTURAL FINDING — this one is about the research design, not the topic

Gemini's stated reason for three empty levels: Editorial Reading is a
**reading habit, not an exam question-unit**. CAT never asks "editorial
questions" — it asks standardised RC. Anything that solves exam-style
questions is therefore filed under Reading Comprehension, and channels
that label editorial videos as "practice questions" are almost always
Banking/SSC current-affairs or translation classes, i.e. wrong pedagogy.

**Our own codebase already agrees with this, and that matters.**
`src/lib/topics-constants.ts` separates `READING_HABIT_UNITS` (Daily
Editorials, Business & Economy Reading, Long-form Reading) from the exam
topics, with the comment: *"habit tracks — declared in the Blueprint like
everything else, but not exam topics: no weightage/prerequisite metadata,
engines skip them."* The file even notes that `Daily Editorials` (habit)
is deliberately named differently from VARC's `Editorial Reading` (skill
unit) because unit names must be globally unique.

So there is a real tension worth deciding in the report: `Editorial
Reading` currently sits inside `VERBAL_TOPICS` (an exam section) but
behaves like a habit unit — and Gemini, with no knowledge of our schema,
independently arrived at the same read.

**Consequence for the remaining 42 prompts:** the uniform 4-level template
does not fit every unit. Habit-shaped and skill-shaped units
(Editorial Reading, Reading Speed Practice, Vocabulary, Grammar, and the
Mock/Reading habit tracks if they are ever run) will legitimately return
L1-only with three honest "NO GOOD VIDEO FOUND"s. **That is a correct
result, not a failed prompt — do not re-run those.** The report should
classify every unit as ladder-shaped (4 levels apply) or habit-shaped
(L1 only), rather than treating empty levels as coverage failures.

**Other open items:**
- `Patrick100` is the fourth new channel; provenance unverified.
- `G8IXAwpurqc` is only **3:02** long, with 10–15 min claimed student time
  (a ~4× multiplier, plausible for "go and read these sources" advice but
  well outside the 1.0–2.5× band the effort model assumes for instructional
  video). A 3-minute video is also an odd fit for a daily task slot — more
  a one-time setup pointer than a recurring resource. Flag for the report.

---

## Prompt 5 — Tables (DILR)

| Level | Title | Channel | Video ID | Stated duration | Sets claimed | Difficulty claimed | Paid push | Student time claimed |
|---|---|---|---|---|---|---|---|---|
| L1 CONCEPT | Tabular Set — LR & DI Preparation for CAT | Rodha | `gqYVcVjqW0k` | 21:38 | 1 | basic | none | 35–45 min |
| L2 EASY PRACTICE | CAT Infinite DILR Set 303 — Organizing the scholarship test | Aptitude Jab | `L6lxPe9gx68` | **9:24** | 1 | medium | none | 20–30 min |
| L3 CAT-LEVEL | CAT Infinite DILR Set 410 — Lehra Do, Table Mapping | Aptitude Jab | `AfQf--BGAeo` | **7:51** | 1 | CAT-level | none | 25–35 min |
| L4 EXAM-READY | — | — | — | — | — | — | — | **NO GOOD VIDEO FOUND** |

**Open items for the verification pass:**
- **`Aptitude Jab` is the fifth new channel** and the first to supply TWO
  levels for one topic. Provenance entirely unverified — an unfamiliar
  channel carrying two of a topic's three filled levels is a concentration
  risk, so this one needs a real tier assignment before either link ships.
- **Durations here are the opposite problem from RC.** 9:24 and 7:51 are the
  shortest practice candidates seen so far, and their claimed student times
  (20–30, 25–35 min) imply ~2.7–4.5× multipliers — well above the effort
  model's 1.0–2.5× band. Plausible for a single DILR set (the student
  attempts the set themselves before watching the walkthrough, which is
  most of the time), but it means **the video-effort multiplier probably
  needs a separate, higher band for "one worked set" videos than for
  expository concept videos.** Worth recording in the effort model.
- **A second structural finding, and it mirrors prompt 3's.** Gemini's
  opening note claims calculation-heavy tabular DI has largely been phased
  out of CAT in favour of logical/constraint-based table sets, and that
  "speed calculation shortcut" videos for tables are mostly clickbait
  funnels into paid coaching. That is the same shape of answer as the
  Arrangements L4 refusal: **the L4 "exam-ready shortcuts" level appears to
  be structurally empty for DILR topics**, because DILR speed comes from
  set-selection and elimination discipline, not from tricks. Two DILR
  topics, two independent L4 refusals with the same reasoning. If this
  repeats for Charts/Caselets/etc., the report should conclude that the
  4-level ladder is a QA/VARC shape and DILR is a 3-level shape — a finding
  about the model, not a gap in coverage.
- Unverified as always: durations, channel ownership, whether these open
  logged-out from India, and the set counts.
