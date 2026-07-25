# Topic mapping — founder review (needed before section plans can launch)

**What this is:** the section plans (QA / DILR / VARC daily engines) use their
own topic names. The main syllabus — the one the ring, hours, and coverage
matrix run on — uses different names. Until every plan topic maps to exactly
one syllabus topic, the engines stay locked (the drift guard blocks them).

**What I need from you:** go section by section. Each line is my proposed
mapping. Mark ✅ if right, ✏️ with a correction if wrong. The ❓ lines are the
ones I genuinely can't decide — those need your call. Nothing ships until you
approve; this is a Type 1 decision (it writes into student history, expensive
to undo later).

**How hours work after this:** the syllabus hours stay the boss. Each syllabus
topic's hours get split across its plan sub-topics in proportion to their
session counts. Example: Charts (10h) split across Bar/Line/Pie/Mixed ≈
2.4h + 2.4h + 2.4h + 2.9h. No new totals are invented; 397 stays 397.

---

## QA — 40 plan topics → 28 syllabus topics

### Exact name matches — 25 (just confirm the block)
Percentages · Ratio & Proportion · Average · Profit & Loss · SI & CI ·
Mixtures · Time & Work · Pipes & Cisterns · Time Speed Distance ·
Linear Equations · Quadratic Equations · Inequalities · Functions ·
Logarithms · Progressions · Lines & Angles · Triangles · Circles ·
Coordinate Geometry · Mensuration · Divisibility · HCF & LCM · Remainders ·
Permutation & Combination · Probability

- [ ] ✅ all 25 confirmed

### Near matches — my proposal (confirm each)
| Plan topic | → Syllabus topic | My reasoning |
|---|---|---|
| Quadrilaterals & Polygons | Quadrilaterals | Same content, longer name |
| Base Systems | Base System | Plural only |
| Set Theory & Venn Diagrams | Set Theory | Venn logic sets live in DILR; QA venn = set formulas |

- [ ] ✅ / ✏️ corrections: ______

### Sub-topics that fold INTO a syllabus topic (they'd share its hours)
| Plan topic | → folds into | My reasoning |
|---|---|---|
| Relative Speed | Time Speed Distance | It's a TSD technique, not a separate topic |
| Boats & Streams | Time Speed Distance | Standard TSD variant |
| Races | Time Speed Distance | TSD variant |
| Escalators | Time Speed Distance | TSD variant |
| Partnership | Profit & Loss | Ratio-split of profits |
| Surds & Indices | Logarithms | Same exponent machinery — **or** should this go under Number System? ❓ |
| Polynomials | Quadratic Equations | Remainder/factor theorem sits next to quadratics ❓ |
| Maxima & Minima | Functions | CAT tests it through functions/AM-GM ❓ |
| Number Properties | Divisibility | Odd/even, primes, digits ❓ |
| Cyclicity & Unit Digit | Remainders | It IS a remainder technique |
| Factorials & Trailing Zeroes | Remainders | Highest-power-in-factorial = divisibility/remainder work ❓ |
| Clocks & Calendars | ❓ **no home** | Not in the syllabus list. Options: (a) fold into Time Speed Distance, (b) add as new syllabus topic (+3h), (c) drop — rarely tested in CAT |

- [ ] ✅ / ✏️ corrections: ______
- [ ] Clocks & Calendars decision: (a) / (b) / (c)

---

## DILR — 18 plan topics → 9 syllabus topics

| Plan topic | → Syllabus topic |
|---|---|
| Tables | Tables |
| Bar Charts, Line Graphs, Pie Charts, Mixed Graphs | Charts (10h split across the four) |
| DI Caselets | Caselets |
| Linear Arrangements, Circular Arrangements, Seating Arrangements | Arrangements (12h split across the three) |
| Games & Tournaments | Games & Tournaments |
| Distribution & Assignment, Scheduling | Selection & Distribution (10h split) ❓ is Scheduling closer to Arrangements? |
| Binary Logic | Binary Logic |
| Ordering & Ranking | Arrangements ❓ or Selection & Distribution? |
| Networks & Routes | ❓ **no clean home** — Venn / Sets is the only syllabus topic left uncovered. Options: (a) map Networks→Venn / Sets (wrong-ish but keeps 1:1), (b) add "Networks & Routes" to syllabus (+8h), (c) fold into Hybrid DILR Sets |
| Matrix-Based Sets, Hybrid Puzzle Sets | Hybrid DILR Sets (12h split) |
| Data Sufficiency | ❓ fold into Caselets, or drop (CAT hasn't tested standalone DS in years)? |

- [ ] ✅ / ✏️ corrections: ______
- [ ] Networks & Routes decision: (a) / (b) / (c)
- [ ] Data Sufficiency decision: fold / drop

**Note:** nothing in the DILR plan maps to **Venn / Sets** today. Either the
plan gains a Venn puzzle topic, or Venn stays syllabus-only (matrix +
self-study). Your call: ______

---

## VARC — 16 plan topics → 9 syllabus topics

| Plan topic | → Syllabus topic |
|---|---|
| RC Fundamentals + all 10 "RC · genre" topics | Reading Comprehension (30h split: Fundamentals gets the biggest share, genres split the rest) |
| Para Jumbles | Para Jumbles |
| Para Summary | Para Summary |
| Odd Sentence Out | Odd One Out |
| Sentence Insertion | Sentence Completion ❓ these are different question types — same skill family though |
| Critical Reasoning | ❓ **no home**. Options: (a) fold into Reading Comprehension (CR appears inside RC sets in CAT), (b) fold into Para Summary, (c) add as new syllabus topic (+8h) |

- [ ] ✅ / ✏️ corrections: ______
- [ ] Critical Reasoning decision: (a) / (b) / (c)

**Note:** three syllabus topics have no plan coverage: **Vocabulary, Grammar,
Editorial Reading**. They're habit/feeder skills, not session topics. Proposal:
they stay syllabus-only (counted in hours, tracked in the matrix, never
scheduled by the section engine — Editorial Reading is a daily habit, not a
40-minute block). Agree? ______

---

## After you approve

1. I encode the approved mapping as a table in code (deterministic, testable —
   same pattern as the coaching-vocab aliases).
2. Graph session counts get re-costed top-down so each section's implied hours
   land within 10% of syllabus hours — the drift guard then goes green.
3. Section engines become launchable per-student via the existing flags.
4. Evidence logged on a plan topic counts toward its syllabus topic's rungs —
   one progress record, both views.

Estimated founder time: 30–60 minutes. The ❓ items are the only hard thinking.
