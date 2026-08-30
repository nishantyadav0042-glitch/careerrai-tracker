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
| 1 | Reading Comprehension | ❌ MISSING | prompt text was pasted back instead of Gemini's answer — needs re-run |
| 2 | Percentages | ✅ | 4/4 levels filled |
| 3 | Arrangements | ✅ | 3/4 levels + 1 honest "NO GOOD VIDEO FOUND" (L4) |
| 4–46 | — | pending | |

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
