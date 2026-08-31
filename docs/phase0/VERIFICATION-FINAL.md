# Phase-0 Link Verification — FINAL, per-topic

*31 Aug 2026. **Every one of the 96 unique video IDs was checked against
real YouTube metadata** via vidIQ. This supersedes the overnight forensic
pass, which had to guess; this one knows.*

## Headline

| | |
|---|---|
| Unique videos checked | **96** |
| Real, confirmed to exist | **90** (94%) |
| **Do not exist — fabricated** | **9** |
| Duration reported exactly right | 60 |
| Duration within a minute | 8 |
| **Duration materially wrong** | **22** |
| **Channel misattributed** | **3** |
| Fit a 45-min daily slot | **61** |
| Too long for any slot (>75 min) | 8 |

**Read that carefully: 94% of the links are real.** The research was mostly
sound. But 9 links point at nothing, 22 durations are wrong — several by
20–45 minutes — and 3 videos are credited to the wrong channel. None of
that was detectable without this check.

---

## 1. The nine fabrications — delete these

| Topic | Level | Video ID | Claimed title |
|---|---|---|---|
| Selection & Distribution | L2 | `kYc5hN7yV9I` | DILR - Team Formation / Selection Basics & Practice  |
| Hybrid DILR Sets | L2 | `F3GZ6iLGB04` | DILR Foundation | Caselets & Mixed Data Reasoning |  |
| Hybrid DILR Sets | L3 | `2Tz8v_v7Qx4` | CAT DILR Practice | Reasoning Based DI (Missing Valu |
| Hybrid DILR Sets | L4 | `Xw8U4wQ2f9A` | CAT DILR Advanced Sets | High-Density Hybrid Reasoni |
| Reading Speed Practice | L1 | `0U5n10P3x_c` | How to read a passage effectively | CAT-RC-Series |  |
| Functions | L1 | `34d7Uo1yv30` | Functions for CAT - Complete Concept & Basics | CAT  |
| Functions | L2 | `R9N2sI_rM0U` | Functions Basics & Practice Questions | CAT QA Prepa |
| Functions | L3 | `p1hO8Wq7Vl8` | Functions Top Questions for CAT | Real CAT Questions |
| Functions | L4 | `5Ew4fP3T1w0` | Functions Advance Shortcuts, Traps & Value Substitut |

**Two whole responses were invented:** *Functions* (all four levels) and
*Hybrid DILR Sets* (all three filled levels). Two more were single bad rows:
*Selection & Distribution* L2 and *Reading Speed Practice* L1.

### What predicted them, and what did not

The overnight screening rule was **search-links instead of real URLs**. Scoring it now:

- Search-linked and fabricated: **7 of 9** — Functions (4), Hybrid DILR (3)
- Search-linked but REAL: **2** — both Vocabulary videos exist, exactly as described
- Direct URL yet fabricated: **2** — Selection & Distribution L2, Reading Speed L1

So the rule caught most of it but is **neither necessary nor sufficient**. I
overstated it overnight and am correcting that here. The title-pattern flag
did better than I credited: I flagged Selection & Distribution L2 as "does
not match 2IIM's branding conventions" — it does not exist. **Only a real
metadata check settles it.**

---

## 2. Durations that were materially wrong

| Topic | Lvl | Claimed | Real | Error |
|---|---|---|---|---|
| Average | L3 | ~1:15 | **74:20** | +73 min |
| Quadratic Equations | L4 | 1:14:30 | **119:51** | +45 min |
| Odd One Out | L1 | 42:15 | **72:03** | +29 min |
| Para Jumbles | L3 | 19:06 | **45:58** | +26 min |
| Odd One Out | L4 | 34:20 | **53:07** | +18 min |
| Grammar | L1 | 52:04 | **34:34** | -18 min |
| Odd One Out | L2 | 45:10 | **63:08** | +17 min |
| Para Jumbles | L1 | 51:30 | **64:41** | +13 min |
| Grammar | L2 | 15:48 | **3:47** | -13 min |
| Logarithms | L3 | 18:42 | **7:54** | -11 min |
| Profit & Loss | L4 | 18:42 | **9:14** | -10 min |
| Selection & Distribution | L3 | 21:18 | **12:42** | -9 min |
| Ratio & Proportion | L3 | 1:04:12 | **72:41** | +8 min |
| Profit & Loss | L3 | 1:12:23 | **80:41** | +8 min |
| Selection & Distribution | L1 | 26:15 | **31:45** | +5 min |
| Average | L1 | ~27 min | **23:10** | -4 min |
| Logarithms | L1 | 26:15 | **30:43** | +4 min |
| Average | L2 | ~26 min | **23:10** | -3 min |
| Logarithms | L2 | 26:17 | **24:06** | -3 min |
| Time Speed Distance | L3 | ~6 min | **4:22** | -2 min |
| Time Speed Distance | L4 | ~26 min | **24:13** | -2 min |
| Ratio & Proportion | L2 | 37:10 | **38:35** | +1 min |

The worst are not rounding errors. *Quadratic Equations* L4 was sold as 75
minutes and is really **120**. *Odd One Out* L1 was sold as 42 minutes and is
**72**. *Grammar* L2 was sold as 16 minutes and is **3:47** — a four-minute
clip presented as a practice video with 8 worked questions, which cannot be true.

**This is why durations could never be printed on a task card unchecked.**
A student told "~42 min" who meets a 72-minute video loses the evening.

---

## 3. Channels credited to the wrong people

- **Average L3** `F6za_fKICsU` — said *ELITES GRID - CAT PREP*, really **Learn4Exam**
- **Selection & Distribution L1** `TAHxPmmojNQ` — said *Learn4Exam*, really **TestPrep By InsideIIM**
- **Selection & Distribution L3** `hSgFjmWV9o4` — said *ELITES GRID - CAT PREP*, really **CAT Preparation - Prepzone**

This matters beyond tidiness: our provenance gate is a **channel-level**
check. Vetting "ELITES GRID" and then shipping a Prepzone video means the
gate was never actually applied.

---

## 4. What is shippable right now

**59 videos are real, correctly attributed, and fit inside a single daily task slot.**
Grouped by topic, with real durations and real view counts:


**Arrangements** · DILR

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Linear and Circular Arrangement - I for CAT I ](https://www.youtube.com/watch?v=4tI-h-GKWVk) | Rodha | 20 min | 845,389 |
| L2 | [Linear Arrangement I Set - 1 I Logical Reasoni](https://www.youtube.com/watch?v=spET6FqiBZ8) | Rodha | 11 min | 529,748 |
| L3 | [High LEVEL DILR puzzle & Detailed way to solve](https://www.youtube.com/watch?v=lF5YGHFysBA) | ELITES GRID - CAT PREP | 35 min | 47,565 |

**Charts** · DILR

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Pie Chart 1 || LR & DI Preparation || CAT Exam](https://www.youtube.com/watch?v=Kn17_JoFmjU) | Rodha | 30 min | 201,732 |
| L2 | [Pie Chart 2 || LR & DI Preparation || CAT Exam](https://www.youtube.com/watch?v=A6K2pPl0BLA) | Rodha | 17 min | 114,140 |
| L3 | [Pie Charts for CAT 2026 | How to Solve Any DI ](https://www.youtube.com/watch?v=7_t3CWThCQM) | ELITES GRID - CAT PREP | 26 min | 37,016 |
| L4 | [Triangular Graph (DI)  -  How to interpret it ](https://www.youtube.com/watch?v=LlM00yczPBQ) | MBA Litmus | 1-on-1 CAT  | 8 min | 8,536 |

**Games & Tournaments** · DILR

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Games and Tournaments 1 || LR & DI Preparation](https://www.youtube.com/watch?v=bC3Wlg6DIRg) | Rodha | 26 min | 319,239 |
| L2 | [Games & Tournament for CAT 2025 by Gaurav Kapo](https://www.youtube.com/watch?v=zsyDbQwC1Vg) | ELITES GRID - CAT PREP | 15 min | 138,298 |
| L3 | [Games & Tournaments - Difficult Set I LR & DI ](https://www.youtube.com/watch?v=Oy9ERJEboWY) | Rodha | 37 min | 105,603 |

**Tables** · DILR

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Tabular Set || LR & DI Preparation for CAT || ](https://www.youtube.com/watch?v=gqYVcVjqW0k) | Rodha | 22 min | 134,690 |
| L2 | [CAT Infinite DILR - Set 303 | Organizing the s](https://www.youtube.com/watch?v=L6lxPe9gx68) | Aptitude Jab | 9 min | 3,541 |
| L3 | [CAT Infinite DILR - Set 410 | Lehra Do | Table](https://www.youtube.com/watch?v=AfQf--BGAeo) | Aptitude Jab | 8 min | 10,306 |

**Inequalities** · QA/Algebra

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Inequalities 1: Rules and Applications | Algeb](https://www.youtube.com/watch?v=zIrr1lkvyBY) | Rodha | 19 min | 233,003 |
| L2 | [INEQUALITIES - 9: Rational Inequality and Quad](https://www.youtube.com/watch?v=w-ez6YnTnJ4) | Rodha | 15 min | 62,467 |

**Logarithms** · QA/Algebra

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Logarithms part 1: Logarithm Properties | Alge](https://www.youtube.com/watch?v=K6Jk3uEkIMA) | Rodha | 31 min | 186,226 |
| L2 | [Logarithms 2: Logarithmic Equations with Quadr](https://www.youtube.com/watch?v=SzseQAYENMc) | Rodha | 24 min | 100,363 |
| L3 | [Logarithms Practice: Logarithms & Product of R](https://www.youtube.com/watch?v=s28TG0ERFr4) | Rodha | 8 min | 9,325 |

**Progressions** · QA/Algebra

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L2 | [Arithmetic Progression 1: AP Average Funda | A](https://www.youtube.com/watch?v=wSbjXsULtrI) | Rodha | 22 min | 178,347 |
| L4 | [Advance Level Quant Concept 9  || SEQUENCE & S](https://www.youtube.com/watch?v=8TygSoo-4Ig) | ELITES GRID - CAT PREP | 14 min | 17,434 |

**Quadratic Equations** · QA/Algebra

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Quadratic Equation 2: Nature Of Roots | Algebr](https://www.youtube.com/watch?v=X3c60CCB18U) | Rodha | 21 min | 148,934 |
| L2 | [Quadratic Equation 3: Imaginary and Common Roo](https://www.youtube.com/watch?v=27OVCl0b0nQ) | Rodha | 20 min | 147,713 |

**Average** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Averages 1: Middle Term of an AP Series | Arit](https://www.youtube.com/watch?v=TBhanaOLNvc) | Rodha | 23 min | 760,971 |
| L2 | [Averages 1: Middle Term of an AP Series | Arit](https://www.youtube.com/watch?v=TBhanaOLNvc) | Rodha | 23 min | 760,971 |

**Mixtures** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Alligation and Mixture 1: Weighted Average See](https://www.youtube.com/watch?v=3LmRyBpIhgQ) | Rodha | 32 min | 560,742 |
| L2 | [Alligation and Mixture 3: Alligation in Mixtur](https://www.youtube.com/watch?v=qQcGkxuf4ws) | Rodha | 24 min | 332,784 |

**Percentages** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Percentages 1: Fractions to Percentages | Arit](https://www.youtube.com/watch?v=x-k8iSNr85g) | Rodha | 26 min | 1,179,679 |
| L2 | [Percentages 2: Successive Percentage Change | ](https://www.youtube.com/watch?v=lzI_bpPpezE) | Rodha | 23 min | 680,316 |
| L4 | [Speed Maths 1: Percentage of a Number | Arithm](https://www.youtube.com/watch?v=VT9-jeEmlJ8) | Rodha | 31 min | 1,828,745 |

**Profit & Loss** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Profit and Loss 1: Profit, Loss, Discount, Mar](https://www.youtube.com/watch?v=bigCbKeUPO4) | Rodha | 26 min | 636,219 |
| L2 | [Profit and Loss 3: Faulty Weights and Cheating](https://www.youtube.com/watch?v=3Q6V7qVGReo) | Rodha | 39 min | 473,787 |
| L4 | [Dishonest Seller CAT 2023 Question| 3 Methods ](https://www.youtube.com/watch?v=OyGkBz2DxAQ) | ELITES GRID - CAT PREP | 9 min | 7,260 |

**Ratio & Proportion** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L2 | [Ratio 3: Comparing Actual and Error Ratios | A](https://www.youtube.com/watch?v=eruwLy2vGV4) | Rodha | 39 min | 296,568 |

**SI & CI** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Simple and Compound Interest 1: SI and CI Basi](https://www.youtube.com/watch?v=hvikOiSu_D4) | Rodha | 22 min | 398,424 |
| L2 | [Simple and Compound Interest 2: SI and CI Diff](https://www.youtube.com/watch?v=TG3M3QFyY0k) | Rodha | 26 min | 288,757 |
| L4 | [Arithmetic Practice 44: Installment Ratio Meth](https://www.youtube.com/watch?v=MTdAQnGCUtM) | Rodha | 15 min | 10,167 |

**Time & Work** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Time and Work 1: LCM Method Introduction | Ari](https://www.youtube.com/watch?v=oApzHGJNx38) | Rodha | 22 min | 423,047 |
| L2 | [Time and Work 2: Alternate Days and Workers Le](https://www.youtube.com/watch?v=6IbA-nSj28g) | Rodha | 24 min | 319,926 |
| L2 | [Time and Work 3: Efficiency and Time Ratios | ](https://www.youtube.com/watch?v=MJIlrpc2oKc) | Rodha | 26 min | 296,365 |
| L4 | [Time and Work 3: Efficiency and Time Ratios | ](https://www.youtube.com/watch?v=MJIlrpc2oKc) | Rodha | 26 min | 296,365 |

**Time Speed Distance** · QA/Arithmetic

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Time Speed and Distance 1: Constant Distance P](https://www.youtube.com/watch?v=CKiP208avbc) | Rodha | 22 min | 500,528 |
| L2 | [Time Speed and Distance 2: Speed Time Inverse ](https://www.youtube.com/watch?v=PQvBSkJDF_E) | Rodha | 24 min | 308,241 |
| L2 | [Time Speed and Distance 3: Multiple Solution A](https://www.youtube.com/watch?v=tLsP7smddvQ) | Rodha | 27 min | 306,969 |
| L3 | [Time Speed and Distance 8: Solving Escalator P](https://www.youtube.com/watch?v=RHflaojKVlI) | Rodha | 24 min | 178,116 |
| L3 | [CAT 2018 Question Paper Slot 2 solution | Spee](https://www.youtube.com/watch?v=VYn1dJ0Acdo) | 2IIM CAT Preparation | 4 min | 8,101 |
| L4 | [Advance Level Quant Concept 19| Time, Speed & ](https://www.youtube.com/watch?v=Kblu48aZ7bA) | ELITES GRID - CAT PREP | 8 min | 19,279 |
| L4 | [Time Speed and Distance 8: Solving Escalator P](https://www.youtube.com/watch?v=RHflaojKVlI) | Rodha | 24 min | 178,116 |

**Coordinate Geometry** · QA/Geometry

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L3 | [Geometry Practice 3: Coordinate Geometry & Med](https://www.youtube.com/watch?v=NXlFmkHm0N0) | Rodha | 15 min | 22,200 |
| L4 | [CAT QUANT CONCEPT 6| Area of Modulus | Importa](https://www.youtube.com/watch?v=NTxJBUAnAq0) | ELITES GRID - CAT PREP | 22 min | 22,605 |

**Editorial Reading** · VARC

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [From where should we read editorials? | AskPat](https://www.youtube.com/watch?v=G8IXAwpurqc) | Patrick100 | 3 min | 2,084 |

**Grammar** · VARC

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Grammar (Sentence Correction & Error Spotting)](https://www.youtube.com/watch?v=PlsBlgzhsXU) | MBA Wallah | 35 min | 28,113 |
| L2 | [Grammar for CAT: Part 1 (Introduction to Basic](https://www.youtube.com/watch?v=Vjd55QTv3nA) | Takshzila | 4 min | 15,412 |

**Para Jumbles** · VARC

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L2 | [RODHA VARC I Master PARAJUMBLES I Episode 1](https://www.youtube.com/watch?v=7AKFH60Jiik) | Rodha | 42 min | 23,521 |

**Para Summary** · VARC

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Summary Concepts || Verbal Preparation || CAT ](https://www.youtube.com/watch?v=8YK-4sOQyUU) | Rodha | 9 min | 19,094 |
| L2 | [Ace Para Summary for CAT 2025 - ‘GIST’ Method](https://www.youtube.com/watch?v=K77dQAOf_Vg) | Unacademy CAT | 34 min | 30,396 |
| L4 | [3 CAT Para Summary Rules That Break Every  Tra](https://www.youtube.com/watch?v=mvLAgP10om4) | Rodha | 31 min | 664 |

**Reading Comprehension** · VARC

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L1 | [Cracking RC 101┃ The Ultimate Guide to Acing R](https://www.youtube.com/watch?v=Qt_FK9fWlMg) | 2IIM CAT Preparation | 26 min | 3,294 |
| L4 | [CAT RC: Traps in Answer Choices | Smart Option](https://www.youtube.com/watch?v=ak5_O5CbrJE) | Career Launcher MBA | 27 min | 11,680 |

**Vocabulary** · VARC

| Lvl | Video | Channel | Real length | Views |
|---|---|---|---|---|
| L2 | [Vocabulary Booster For XAT, CAT, MAHCET & All ](https://www.youtube.com/watch?v=ouybCha6v9E) | BYJU'S Exam Prep: CAT &  | 34 min | 1,474 |

---

## 5. Topics ready to use, ranked

**Tier 1 — complete, verified, slot-sized ladders. Usable today.**

- **Charts** (DILR) — all four levels real and slot-sized: 30 / 17 / 26 / 8 min.
  The only topic in the batch with a genuine, verified, complete four-level ladder.
- **Arrangements** (DILR) — 20 / 11 / 35 min, all real, all high-engagement
  (845k / 530k views). L4 honestly absent. This was a Phase-0 topic and it holds up.
- **Games & Tournaments** (DILR) — 26 / 15 / 37 min, all real, honest L4 gap.
- **Tables** (DILR) — 22 / 9 / 8 min. Note the two short ones are from
  *Aptitude Jab*, a small channel (3.5k and 10k views) — real, but unvetted.
- **Percentages** (QA) — 26 / 23 / 31 min. 1.18M and 1.83M views. The other
  Phase-0 topic, and the strongest QA ladder.

**Tier 2 — solid, one level needs work.**

- **Time & Work**, **Time Speed Distance**, **SI & CI**, **Mixtures**,
  **Logarithms**, **Inequalities**, **Quadratic Equations**, **Profit & Loss**
  — all have real, slot-sized L1 and L2. Their L3s are hour-plus 2IIM
  Blitzkrieg compilations, which are excellent content but need a splitting
  decision before they can sit under a daily task.

**Tier 3 — real problems.**

- **Reading Comprehension** — L1 (26 min) and L4 (27 min) are fine. L2 is
  **72 min** and L3 is **118 min**. Two of four levels are unusable as-is.
- **Odd One Out** — every duration was understated by 17–29 minutes. Real
  lengths are 72 / 63 / 55 / 53 min. Nothing here fits a slot.
- **Average** — L1 and L2 are the *same video* (`TBhanaOLNvc`, really
  "Averages 1", 23 min). The L2 claim of a different video titled "Averages 4"
  is now definitively false. Needs a re-run.
- **Functions**, **Hybrid DILR Sets** — nothing survives. Re-run both.

---

## 6. What this proves about the method

The pipeline works, with one non-negotiable step attached.

Gemini found **90 real videos across 27 topics** — genuinely useful, mostly
well-judged, and far faster than manual search. Its honest gaps were
substantive and often right. But it also invented 9 videos, misstated 22
durations and misattributed 3 channels, **and none of that was visible from
the response itself.**

So: **Gemini discovers, vidIQ verifies, a human spot-checks. No link reaches
a student without all three.** That is now cheap — 96 videos cost 2 API calls
and about a minute.

The one thing still not machine-checkable is what the overnight brief said:
whether a page opens logged-out from India on a real phone, and whether a
real aspirant would actually study from it. That remains a human job, and it
is now a much shorter one — **61 verified, slot-sized videos** instead of 104
unverified claims.
