# MOAT Research — August 2026

> The founder's question: **"What information can CareerRai know about a student
> after 180 days that no coaching, no mock platform, no YouTube channel, no
> Telegram group, and not even the student themselves can reliably know?"**
>
> Research ran 3 Aug 2026: four parallel external streams (offline giants
> TIME/IMS/CL · online platforms Rodha/Cracku/2IIM/iQuanta/CATKing/Elites
> Grid/Unacademy · aspirant daily reality · adversarial kill-the-hypothesis) plus
> a full internal data audit. Method caveat: Reddit/Quora/Pagalguy were
> network-blocked in the research sandbox; complaint evidence is from search-index
> snippets and aggregators, tagged [Certain]/[Likely]/[Guessing] throughout the
> agent reports. This document is the synthesis; raw findings live in the session
> transcripts.

---

## 0. The finding that outranks every other finding

**Our current product is architecturally the thing the research proves dies.**

The strongest, best-triangulated result of the whole study is the answer to
"why do planners die in 3 days while mock dashboards get opened all season":

| Surfaces students keep opening | Surfaces students abandon |
|---|---|
| Fresh, **externally generated** information (a new score, a percentile, solutions) | Self-reported input (the plan you wrote is the plan you see) |
| Social comparison (AIR, score threads, leaderboards) | No new information on open |
| Stakes / fear (cutoff risk, "am I safe") | Guilt as the dominant emotion on reopen |
| **Zero self-report** — the system already has the data | A ritual required before the surface says anything |

Journaling apps: 87% abandoned within 7 days. Study timetables: "the third or
fourth day… the timetable is soon ignored." **Our own data reproduces the curve
exactly: median 2 logged days, 7% of students active in the last week.** Pagalguy
has hosted a thriving thread for every single AIMCAT and SimCAT for over a
decade — students voluntarily return after every mock, every season.

The conclusion is not "add a decision layer to the log." It is: **any moat whose
fuel is a daily self-report ritual is dead on arrival. The moat must run on data
generated as a side effect of things the student was going to do anyway.**

There is exactly one such artifact in every serious aspirant's week, coaching or
not: **the mock.** 1×/week in August rising to 2–3×/week by November, externally
scheduled, emotionally charged, already habitual. The mock is the metronome. We
don't have to create the habit — we have to attach to it.

---

## 1. The seven questions, answered

### Q1. What job is the student actually hiring CareerRai for?

Not "plan my studies" — planning is abundant and free. The job, in the student's
own words across hundreds of posts, is:

> **"Tell me what my last mock means, and exactly what to do about it before the
> next one."**

Sub-jobs: "is my panic warranted?" (the 148→101 SimCAT drop with no context),
"am I actually on track?", and for professionals, "what's the best use of the 2
depleted hours I have tonight?"

### Q2. The top daily decisions a CAT aspirant makes

From the decision-regret corpus, ranked by regret intensity (not frequency):

1. **Analyze this mock properly, or just note the score and move on** ← the #1
   regret in 8+ independent sources; "completing 20 mocks without learning from
   them is just wasted effort"
2. Take the scheduled mock, or skip it out of fear of a low score
3. Watch another lecture, or solve questions (the "illusion of learning")
4. Start VARC now, or keep postponing it because it feels unpredictable
5. Continue current topic, or switch (comfort-zone repetition)
6. Revise old material, or cover new
7. Keep the error log, or skip it "just today"
8. Trust my current resources, or buy another course (Aditya Singh bought CL
   *and* IMS for attempt three)
9. Mock-day strategy: which sets to attempt, when to abandon one (the "10
   minutes sunk in one DILR set" class of error)
10. Study tonight at all, or write today off (professionals, after an 11-hour day)

Plus ~10 lower-stakes daily ones (order of sections, sectional vs full mock,
morning vs night slot, group vs alone…). The high-regret list is dominated by
**decision failures, not effort failures** [Likely — corpus is
coaching-adjacent; Reddit's December regret threads were unreachable].

### Q3. Which decisions does every major player leave unsupported?

Effectively all ten. The structural evidence:

- **TIME**: 16 books, 5 classes/week, ~25 AIMCATs, a Telegram group — and the
  nightly question "given my last 3 AIMCAT percentiles, which book do I open
  tomorrow?" is answered by strangers on Quora.
- **IMS**: best-in-class mock *analysis*, plus 7 one-on-one mentor sessions —
  one conversation per 6 weeks. Their own content head runs a personal blog
  absorbing the anxiety the product creates.
- **CL**: the most feature-listed digital layer, the least loved (2.33/5
  MouthShut); "personalized study path" in marketing, no independent account of
  it working. Sells a ₹25K personal coach — for *after* CAT (GDPI).
- **Cracku**: the only real daily loop in the market (Daily Targets + streak +
  T-shirt) — and it's the same 15 questions for every student in India.
- **2IIM**: a genuinely good schedule *generator* — one-shot, never re-plans.
  "The schedule is only a guide, and every aspirant should design their own."
- **iQuanta**: real personalization — for 200 human-mentored seats
  ("99%ile or refund"). Its daily instrument for everyone else is a
  downloadable **Excel spreadsheet**.

The pattern: **the incumbents ship the daily-decision job as a lead magnet
(generator PDFs, tracker spreadsheets), not as product.** The advice universally
ends with "customize per your strengths and weaknesses" — the job handed back.

### Q4. Which decisions can only CareerRai support, because of data?

The ones requiring **your longitudinal record crossed with neutrality**:

- "Your percentile dropped 9 points — here's the base rate for week-3 drops,
  you're fine / you're not" → needs cross-student context the student lacks and
  the institute won't give (their incentive is enrollment, not calibration).
- "You've repeated this same error type across 4 consecutive mocks" → needs an
  error ledger that survives across mocks; every platform's analysis resets
  per-mock.
- "Stop watching; you're 3 lectures ahead of your solve-rate" → needs
  consumption *and* performance in one place; PW knows one side, mock platforms
  the other, nobody both.
- "Your coaching's batch is on Modern Math this week, but your last two mocks
  say Arithmetic is bleeding more marks — do class, then 30 min Arithmetic" →
  requires reading *across* providers. **TIME cannot coordinate IMS's mocks.
  Structural neutrality is the one advantage no incumbent can copy without
  self-harm.**

### Q5. What would PW/TIME/IMS/CL/Cracku/Rodha struggle to replicate?

Ranked by defensibility:

1. **Neutral cross-provider orchestration** — copying it requires promoting
   rivals' content. Structurally impossible for content owners. [Strongest]
2. **The longitudinal decision ledger** — error-pattern history, plan-adherence
   history, recovery patterns. Accumulates per student; a copier starts at zero
   *with that student*. Weak on day 1, compounding by mock 5.
3. **Anti-ritual capture architecture** — being built around side-effect data
   (scorecard photo, mock calendar) rather than the self-report their portals
   assume.
4. The one who *could* copy fastest: **Cracku** (they have the habit loop and
   analytics DNA). Watch them, not the giants — the giants' apps can't render a
   login page in portrait.

### Q6. How should the experience differ by segment?

| Segment | Mode | The daily sentence |
|---|---|---|
| Coaching + 1st attempt (62) | **Shadow** — defer to batch pace, repair gaps around it | "Your class covers X this week. Your mocks say Y is leaking marks — here's the 30-min patch." |
| Coaching + repeater (15) | **Audit** — attack illusion of competence | "You 'know' Geometry. Your last 46 Geometry questions: 41% accuracy." |
| Self-study + 1st attempt (154) | **Direct** — we are the pace-setter | Full plan ownership (closest to today's product) |
| Self-study + repeater (25) | **Rebuild** — skip basics, weakness-first sequencing | "Not the syllabus again — the 9 topics that cost you last year." |
| Working professional (cuts across) | **Salvage** — energy-aware, interruption-tolerant | "11-hour day? Here's the 40-minute version. Weekend rebalanced." |

One engine, five voices. The segmentation key is two onboarding taps we don't
currently capture: *who paces you* (coaching/me/nobody) and *which coaching* —
plus `is_repeater`, which we have.

### Q7. The daily habit loop that makes it indispensable

```
MOCK DAY (external, scheduled, already habitual)
  → 2-minute debrief: photo of scorecard / 4 taps      [the only input, weekly not daily]
  → verdict + context: "here's what it means; panic unwarranted; base rate says X"
  → the 6-day micro-plan to the next mock, re-sequenced from THIS mock

EVERY OTHER DAY (zero input required)
  → open → "today's move" + one fresh, slightly fear-tinged delta
    ("Arithmetic error rate ↓ 8% since mock 6" / "VARC untouched 11 days — mock in 3")
  → notification carries the DELTA, not a nag. The news is the product;
    the app is where you act on it.
```

The open pays fresh external information daily; input is demanded once a week,
attached to an event the student already performs. That is the inverse of the
planner death loop, point for point.

---

## 2. The moat options

Scored 1–5 (5 = best). *Cold-start* = value on day 1 with zero history.
*Season fit* = works within the 115 days to CAT 2026, and survives the
December cliff (every user's clock ends at the exam — the Spotify analogy fails;
compounding must happen within one season, cross-season only via repeaters).

| # | Option | Student value | Defensibility | Cold-start | Eng. lift (wks) | Season fit | Both segments? |
|---|---|---|---|---|---|---|---|
| **A** | **Mock-to-Plan Compiler** — after every mock: verdict, context, error ledger, next-6-days plan | **5** — the #1 regret and #1 pain, fused | 4 — ledger compounds per mock; neutrality | **5** — full value from mock #1 | ~3–4 (debrief schema, photo-parse pipeline, topic graph all exist) | **5** — mock season IS Aug–Nov | **Yes** — the mock is the one universal artifact |
| **B** | Percentile Truth Engine — daily projection + "is my panic warranted" base rates | 4 — absorbs the season's dominant emotion | 2 — benchmarking is the giants' home turf; needs cohort scale we lack (260 students vs AIMCAT's lakhs) | 2 | ~2 | 4 | Yes |
| **C** | Decision-History Behavioral Model — "knows how you learn/decide/recover" (the founder's 180-day asset) | 5 later, ~0 in week 1 | **5** — the true long-term moat | **1** — needs weeks of data; 93% of students are gone by day 7 | ~6+ | 2 — season is 115 days, not 180 | Yes |
| **D** | Coaching Shadow Mode — know the coaching, preload its public mock calendar, defer pace, patch gaps | 4 for the 79; 0 for the 181 | 3 — public calendars are copyable; the *stance* (defer, don't compete) is positioning gold | 4 | ~2 | 5 | **No** — coaching only |
| **E** | Accountability Product — evolve buddy/streak into watched-by-default | 3 — WTP proven (₹500–15K, human-capped incumbents) | 2 — mechanics are copyable; human layer doesn't scale | 3 | ~2 | 4 | Yes |

### Recommendation: A is the wedge. D is A's coaching voice. C is A's exhaust. B and E are features, not moats.

- **Build A** — "After every mock, CareerRai." It attaches to the strongest
  existing habit instead of fighting to create one, delivers full value from the
  first mock (solves our retention crisis *and* the cold start), works
  identically for a TIME student (AIMCAT scorecard) and a self-study student
  (free Cracku/iQuanta mock scorecard), and every debrief quietly writes the
  error ledger and adherence record — **which IS Option C accumulating as a side
  effect.** By mock 6 the product knows things about the student nobody else
  does, without ever having asked for a daily journal.
- **D ships inside A** as the coaching-segment voice: one onboarding tap
  ("Which coaching? TIME/IMS/CL/PW/Rodha/Cracku/2IIM/iQuanta/CATKing/other/none"),
  preloaded AIMCAT/SimCAT/CDC calendars (public), plan defers to batch pace.
  This also delivers the founder's requested post-onboarding fork for coaching
  students — "build my plan around my coaching" vs "upload my coaching's plan" —
  with the upload path kept but demoted (3 uploads in 6 weeks; the data voted).
- **B's context line lives inside A's verdict** ("a 9-point drop in week 3 is
  the 60th percentile of drops — recoverable"), built from our cohort as it
  grows; never sold as a standalone predictor against AIMCAT's lakhs.
- **E stays what it is** — the buddy is the premium human layer on top; software
  accountability ties to *mock attendance* (external, verifiable), never to
  log-streaks.

### What this kills or demotes

- The daily self-report log as the product's spine. It stays as an optional
  artifact, but nothing important may depend on it ever again. (Its data quality
  indicts it too: the hours-corruption incident of 2 Aug came from exactly this
  ritual.)
- The "lecture planner" direction — content sequencing is the incumbents' turf
  and the wrong layer. Stage/mastery machinery can resurface later inside A's
  between-mock plans.
- The upload-first coaching flow as the primary door.

### Honest risks, stated plainly

1. **Scorecard entry is still input.** Weekly, event-attached, 2 minutes,
   photo-first (parse pipeline exists) — but if students won't do even that, A
   fails. *This is the single riskiest assumption, and it's testable in a week
   (see experiment below).*
2. **Cracku could copy the loop.** Their counter is content-locked
   (their mocks only); our neutrality holds *only if we stay content-neutral*.
   The moment we sell content, the moat inverts.
3. **Cohort context needs bodies.** Base rates from 260 students are thin;
   early copy must lean on the student's own trajectory, not cohort claims, or
   we ship confident lies (Playbook rule).
4. **December cliff.** The season ends for everyone; retention past CAT is a
   repeater/next-cohort question, not a product flaw. Plan for it in November
   (result-prediction, GDPI hand-off, refer-a-junior) — not now.
5. All evidence tagged [Likely] or worse above inherits the network-block
   caveat: Reddit/Pagalguy primary threads were unreachable. The regret ranking
   and lecture-overconsumption prevalence are the two calls most likely to move
   with primary data.

### The one-week falsification test (before any real build)

The founder's kill-your-hypothesis standard, applied to ourselves:

> Message the ~20 students who logged a mock or debrief. Offer manually:
> "Send a photo of your next mock scorecard; within 2 hours you'll get back
> what it means + exactly what to do until your next mock." Run it by hand
> (founder + me) for one week.
>
> **Measure:** how many send a second scorecard unprompted. That number is the
> product's survival curve in miniature. >50% → build A at full speed.
> <20% → the input assumption is dead and we go back to this document.

---

*Written 3 Aug 2026, on branch `claude/study-report` (Play review freeze —
nothing here ships until clearance). Decision owner: Nishant.*
