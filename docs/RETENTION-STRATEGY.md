# CareerRai — Retention, Student Memory & Personalization: Research + Strategy

**Date: 17 Aug 2026.** Commissioned by the founder. Scope: two personas only — the
self-study student and the repeater. Objective: retention through the thesis
**Memory × Initiative** — CareerRai remembers the student's preparation and acts on it,
so the product is more valuable tomorrow because of what it learned today.

**Source discipline used throughout:**
- **[CR]** CAREERRAI EVIDENCE — verified this session against the production database,
  the repository, or `docs/PRODUCT-KNOWLEDGE-BASE.md` (the full mechanism map, same date).
- **[EXT]** EXTERNAL RESEARCH — peer-reviewed studies, company filings, or credible
  industry sources, cited inline.
- **[INF]** INFERENCE — reasoning from the evidence. Never presented as fact.
- **[REC]** RECOMMENDATION — a proposed product decision.

---

# PART I — Where retention actually stands (all [CR], pulled live today)

## I.1 The funnel, measured on the 30–60-day-old cohort (n=102, pre-ad-spike)

| Milestone | App opened | Actually logged |
|---|---|---|
| Day 0 | — | **16.7%** |
| Day 1 | **2.0%** | — |
| Day 3 | 13.7% | — |
| Day 7 | 9.8% | **3.9%** |
| Day 14 | 7.8% | — |
| Day 30 | 6.9% | **3.9%** |

Three facts stand out:
1. **Day-1 return is near zero (2.0%)** — students do not come back the day after
   signing up. Activity that exists at D3 (13.7%) is largely notification/campaign-driven
   resurrection, not a formed habit.
2. **Only 16.7% ever log on day 0** — five of six students complete signup and never do
   the one action the product is about, on the very first day.
3. **The ~4% who are still logging at D7 are the same ~4% at D30.** Whoever survives the
   first week stays. The war is entirely in days 0–7.

## I.2 The base today

457 real students. **64 repeaters (14%)**, 394 first-timers. 31 of 64 repeaters provided
last year's percentile. Daily logging: ~10 students/day (~2.2%). Streaks: 1 student above
7 days. WAU 214, MAU 353 — but opens without logs (45 opens vs 10 logs today).

## I.3 Mock memory is nearly empty

**18 students have ever logged a mock. 22 debriefs total. 8 in the last 14 days. Only 8
students have ever entered a percentile.** The entire Performance-Memory layer the
founder wants to build on currently has almost no data flowing into it. This is the
single biggest gap between the thesis and the current product — the plan engine's
mock-informed focus (`mock-informed-focus.ts`, fully built) is starving.

## I.4 Notification chain — verified, not assumed (founder's §20 audit)

| Check | Result |
|---|---|
| Total real students | 457 |
| Push preference ON | 170 (37%) |
| Explicit OFF | 287 (63%) |
| Never-asked / ambiguous | **0** — the consent backfill closed this; every student now has an explicit state |
| ON + live subscription | 115 |
| ON + live + receipt-verified | 110 |
| ON + flagged-dead subscription | 0 |
| **ON but NO subscription at all** | **55 (32% of opted-in)** — said yes, subscription never minted. The single biggest reachability repair group. |
| Verified receipts, last 7 days | 124 students |
| Duplicate push (same user+type+day), last 7d | 0 detected |

**One structural blind spot found:** the `notifications` table has recorded only **66
`channel='push'` rows in 30 days, none since 4 Aug**, while `in_app` recorded 40,220.
Push sends flow through `sendPushToUser` without writing a per-send push row, so
**"notification → app open → log" cannot currently be computed from the database.** The
receipt-verification system (`push_verified_at`) proves delivery *capability* for 124
students, but per-send outcome measurement doesn't exist. This is a P0 measurement fix
(one insert per send), not a delivery fix — delivery itself appears healthy.

[INF] The honest summary: consent is clean, delivery is alive for ~110–124 students,
duplicates are controlled — the 12-Aug audit's problems are genuinely fixed. What's
missing is (a) the 55 opted-in-but-unsubscribed students, and (b) a send-ledger that
would let us measure whether any of it drives logging.

---

# PART II — What the external evidence actually says

## II.1 Habit formation and early churn [EXT]

- **Habit takes weeks-to-months, not days**: median 66 days to automaticity, range
  18–254, half of subjects never got there in 84 days (Lally et al. 2010, EJSP). D0–D30
  is entirely pre-habit: the product must deliver *conscious, deliberate* value every
  day of the first weeks — habit is the reward of retention, not its cause.
- **Missing one day does not harm habit formation** (same study) — but *believing it
  ruined everything* does: the "what-the-hell effect" / abstinence-violation effect
  (Polivy & Herman; ten Broeke & Adriaanse 2023) shows guilt after a lapse triggers full
  abandonment via all-or-nothing framing. [CR] CareerRai's guilt-free recovery ladder
  and rest-day-counts-as-showing-up streak rule are exactly evidence-aligned. Keep them.
- **Duolingo's numbers put a ceiling on notification dreams** [EXT]: their KDD 2020
  bandit paper (200M notifications, world-class optimization) moved DAU by **+0.5%** and
  new-user retention by **+2%**. Notifications tune retention; they cannot create it.

## II.2 Perceived efficacy beats engagement [EXT]

- Self-monitoring alone changes behavior, with dose-response (Burke et al. 2011
  systematic review; Michie et al. 2009 meta-analysis: self-monitoring + self-regulation
  is the most effective technique cluster). **The log itself is an intervention** — [CR]
  which makes CareerRai's <17% day-0 logging rate the product's most expensive gap.
- The #1 stated reason people abandon tracking tools: *"the collected data was not
  useful"* (Epstein et al. 2016, CHI). Not boredom. Not friction. **Uselessness of the
  accumulated data.** This is the strongest single external validation of Memory ×
  Initiative — and its sharpest warning: memory that doesn't visibly change tomorrow is
  the documented abandonment cause.
- Learners are poorly calibrated about their own weaknesses (Roediger & Karpicke 2006;
  self-assessment r≈0.29 with ability — already encoded in [CR] `topic-selector.ts`'s
  confidence-cap design). An external system that reveals true weaknesses supplies value
  the student cannot self-generate. This is the self-studier's core unmet need stated in
  behavioral-science terms: *"who tells me whether I'm preparing correctly?"*

## II.3 Personalization and the "it knows me" effect [EXT]

- Personalized messaging outperforms generic (2025 J. Advertising meta-analysis), BUT
  high-accuracy *covert inference* backfires — surveillance perception, creepiness
  (J. Business Research 2025). The safe quadrant is **first-party, user-declared,
  purpose-aligned data, surfaced with receipts** ("your last 3 mocks show X — tap to see
  them"). [CR] CareerRai's Trust-OS rules (only the student's own numbers, drill-down
  always) already sit in the safe quadrant.
- **Feedback valence must be sequenced** (Finkelstein & Fishbach 2012, JCR): novices
  respond to positive feedback (builds commitment); invested users seek negative
  feedback (signals what's left). [REC] Weakness-bluntness should scale with tenure:
  week-1 students get encouragement + one gentle observation; week-4+ students get the
  blunt recurring-mistake card. Same engine, different thresholds by account age.

## II.4 India-specific CAT behavior [EXT — coaching-industry sources; forum layer partially blocked, labeled]

- Self-study stack is standardized: Arun Sharma + PYQs + free YouTube (Rodha, 2IIM,
  iQuanta) + **one paid test series** — the test series is the one thing even free-stack
  students buy. Mock scorecards are **web dashboards** (overall %ile, sectional %ile,
  score, attempts, accuracy, rank; percentile lands 24–48h after the window).
- **The mock-analysis gap is the industry's loudest theme**: "15 well-analysed mocks
  beat 50 without reflection"; students who skip analysis "plateau by August"; coaching
  blogs prescribe manual mock-tracker spreadsheets, and community Google-Sheets mock
  trackers genuinely circulate (LinkedIn/YouTube template evidence). **Serious aspirants
  already do manual score entry — into spreadsheets, weekly, not daily.** This is the
  key adoption evidence for mock entry: low-frequency, high-value transcription is a
  behavior that already exists; daily administrative logging is not.
- Repeater marketing converges on one hook: **"your first attempt was a diagnostic
  test."** Canonical self-diagnoses: shallow mock analysis, DILR set selection, time
  pressure, consistency collapse, weak-topic neglect. Whether repeater self-diagnosis is
  *accurate* is undocumented — treat self-report as a hypothesis to verify against
  observed data, never as ground truth.
- Telegram/WhatsApp comparison culture is real and skews toxic (documented accounts of
  percentile-comparison spirals). [INF] Peer features for this audience should compare a
  student to *their own past self* first, cohorts second, individuals never — which is
  [CR] exactly what Peer Pulse already implements.

## II.5 Accumulated-state products — what separates winners from graveyards [EXT]

| Product | What retains | The lesson for CareerRai |
|---|---|---|
| **Anki** | Scheduler *consumes* history to build today's session; deck = years of calibration | The winning design handles missed days by **rescheduling around them algorithmically, never showing raw debt** (FSRS). The failure mode — review-avalanche shame after gaps — is CAT backlog shame, exactly. [CR] CareerRai's no-backlog principle is correct; keep it absolute. |
| **Strava** | The log becomes identity; noticing (PRs, Fitness & Freshness) works only atop history | The log alone doesn't retain (Garmin has logs too) — **log + witness** does. CareerRai's witness today is the buddy, not a feed. |
| **WHOOP/Oura** | Months of baselines make insights personal; ~50% daily use at 18 months (claimed) | **One wrong-feeling insight costs more trust than ten right ones earn.** Every insight must show its receipts — [CR] already a Scale-Contract rule; apply it to noticing. |
| **CAT test-series dashboards** (IMS/TIME/CL/Cracku/2IIM) | Same-day per-mock analytics are **table stakes**; IMS claims AI insights | **None evidently track recurring mistakes ACROSS mocks or wire mock trends into a daily plan.** Cross-mock mistake-memory tied to tomorrow's plan appears genuinely open whitespace — verify IMS hands-on before claiming it publicly. |
| **AI study companions** (Khanmigo, YC 2025-26 cohort) | Persistent-learner-memory retention is **unproven industry-wide** — no published outcome/retention wins | The thesis is open ground, not a proven playbook. Edge must come from CAT-specific context, not "AI memory" generically. |
| **Graveyards** (wearables ~30% abandonment in 6 months, Mint) | Data-rich, action-poor | The separator is **action** (product changes what you do next) + **identity** (the record means something). A study log that reports yesterday without rescheduling tomorrow follows the habit-tracker curve, not the Anki curve. |

---

# PART III — The five hypotheses, challenged (founder's §34)

**H1 — "Remembering mistakes improves retention."** Partially supported, with sharp
conditions. Supported: Epstein 2016 (uselessness causes abandonment → useful memory
prevents it), Anki/WHOOP (consumed memory retains). Conditions: (a) memory must *change
tomorrow's plan*, not just display; (b) weakness-bluntness sequenced by tenure
(Finkelstein & Fishbach); (c) receipts always; (d) never identity-framing ("you're weak
at DILR" ✗; "DILR was lowest in your last 3 mocks" ✓). Harm case is real: wrong
diagnosis destroys trust asymmetrically (WHOOP lesson). Verdict: **build it, gate every
claim on evidence thresholds (Part V), frame observations not verdicts.**

**H2 — "Repeater onboarding should capture last year."** Supported, and [CR] mostly
already built (percentile + had-buddy are captured; percentile already reshapes the
hours math via the 0.55–0.90× effort multiplier). What's missing is not more questions —
it's the **Previous Attempt Snapshot** payoff screen and the "what will be different"
contract. Two additions earn their friction (Part VI); everything else should be
inferred later, not asked.

**H3 — "Mock scores should become memory."** Supported by the strongest India-specific
evidence found (spreadsheet mock-trackers already circulate; analysis-gap is the
loudest coaching theme) — AND by CareerRai's own gap (18 students ever entered a mock).
The friction risk is real but the behavior exists at ~1–2 entries/week among serious
aspirants. Manual-first, paste/screenshot as convenience layers (Part VII). The risk to
manage is not entry friction — it's **entering a mock and seeing nothing change.**

**H4 — "Personalized notifications increase retention."** True but bounded: Duolingo's
ceiling (+0.5% DAU at world-class execution) says notifications are a tuning layer.
State-triggered beats schedule-triggered (Mehrotra CHI 2016: receptivity predictable
from context). The differentiated version is **information-rich noticing** ("3 mocks
same DILR pattern — today's plan has 25 min targeted practice"), which no competitor
sends. But the send-ledger blind spot ([CR] Part I.4) means we currently can't measure
any of it — fix measurement before optimizing content.

**H5 — "CareerRai should notice things automatically."** Supported with the strictest
conditions of all five. The framework (Part V.3) must be a hard product law: silence is
the default; a notice fires only past evidence thresholds; every notice shows receipts;
observations never verdicts. False personalization at 457 students would be fatal —
there aren't enough students to survive a "this app doesn't actually know me" wave.

---

# PART IV — Memory architecture

## IV.1 Six memory layers, and their honest current state [CR]

| Layer | Contents | Current state |
|---|---|---|
| **A. Static** | exam, attempt year, target %ile, previous attempt, hours, archetype | **Built.** Captured at onboarding, drives real math. |
| **B. Dynamic** | current weak section, coverage states, revision dues, pace | **Built.** The coverage matrix + focus chain is the live core. |
| **C. Behavioural** | postponement patterns, comeback behavior, consistency, avoidance | **Partially built.** Postponed-topic bonus (+50), plan-avoidance detection in buddy briefing, recovery events exist — but scattered, not unified, and mostly surfaced to the *buddy*, not the student. |
| **D. Performance** | mocks, sectional trends, accuracy, attempts | **Built but starving** — 22 debriefs total. The pipe exists (`mock-informed-focus`), the water doesn't flow. |
| **E. Mistake** | recurring weaknesses with lifecycle status | **Does not exist.** The genuinely new build. |
| **F. Plan** | planned vs completed vs deferred, what plan changes worked | **Built** (daily_routines, completions, `study_action_log` closed loop). |

## IV.2 What CareerRai should know by day N [REC]

- **Day 1**: archetype, target, self-reported weakest section, coverage baseline, hours.
  (All exists.) Plus: one behavioral datum — did they log day 0?
- **Day 7**: real logging cadence vs stated hours; first postponement pattern; whether
  the weakest-section self-report matches early behavior. **First "I noticed" becomes
  legal here** — one observation, gently framed, only if evidence is clean.
- **Day 30**: reliable consistency profile; 2–4 mocks if entering; first mistake-memory
  candidates reach SUSPECTED/REPEATED; self-vs-observed hours gap is statable.
- **Day 60**: mistake lifecycle has real entries with trend directions; mock trend line
  means something; plan-response patterns known (which interventions this student acts on
  — `study_action_log` already accumulates this).
- **Day 90**: the ultimate-test answer (Part XIII) is fully cashable.

## IV.3 The Repeater Memory object [REC]

```
previous_attempt:
  year, percentile (self-reported), sectional if known
  self_reported_problems: [DILR selection, time pressure, ...]  ← hypothesis list, NOT truth
  had_support: boolean
current_evidence:
  mock_history: [...]
  observed_weaknesses: [...]     ← from mocks + behavior
  consistency_profile: {...}
reconciliation:
  confirmed: self-report ∩ observed
  refuted: self-reported but not observed   ← surface gently: "you said X; data shows Y"
  discovered: observed but never self-reported  ← the highest-value insight
target: percentile, gap_to_target
```
The reconciliation block is the repeater product. "Last year you thought time management
was the problem. Your 4 mocks this year show accuracy holding but DILR selection
repeating — that's a different problem than the one you were fixing." No coaching
institute, spreadsheet, or ChatGPT session can produce that sentence.

## IV.4 Self-study memory — learned, never asked [REC]

No previous attempt exists; the system learns from behavior alone on the Part IV.2
timeline. The one addition worth making at onboarding: a single self-studier-specific
moment naming their situation (mirror of the repeater pitch screen — [CR] currently
missing, flagged in the KB): *"No coaching? Then CareerRai is your answer to the one
question coaching students never have to ask — 'am I preparing correctly?' Here's how
we'll know: …"* — setting up the noticing engine as the promised payoff.

---

# PART V — The Mistake Lifecycle and the Noticing framework

## V.1 Lifecycle [REC]

```
SUSPECTED → REPEATED → TARGETED → IMPROVING → STABLE ⟲ REOPENED
```
(Dropped "NEW" — a single occurrence is not a mistake, it's a data point. Everything
enters as SUSPECTED or not at all.)

**Evidence thresholds (the anti-hallucination contract):**
- **SUSPECTED**: 2 independent occurrences of the same pattern (2 mocks same weakest
  section; topic postponed 3× in 14 days). Never surfaced to the student yet.
- **REPEATED**: 3+ occurrences across ≥3 distinct events, recency-weighted (nothing
  older than 45 days counts — matches [CR] `MAX_DEBRIEF_AGE_DAYS`). **First student
  visibility here**, as observation + receipts.
- **TARGETED**: student accepted an intervention (plan inserted targeted practice).
  Records what was tried — feeds "what worked" memory.
- **IMPROVING**: 2 consecutive events contradicting the pattern (2 mocks where DILR
  wasn't lowest; the postponed topic completed twice).
- **STABLE**: 3 consecutive clean events. Celebrated once, prominently: *"DILR selection
  — 3 mocks clean. This one's fixed."* [EXT] This is the perceived-efficacy moment the
  literature says drives return more than any streak.
- **REOPENED**: pattern recurs after STABLE. Framed as vigilance, not failure: *"DILR
  selection resurfaced in AIMCAT 14 — catching it early this time."*
- **DECAY**: SUSPECTED entries with no reinforcing evidence in 30 days are silently
  dropped. One bad mock must never permanently label a student.

## V.2 One bad mock must not swing the plan [REC]

A single mock can adjust *tomorrow* (already true via mock-informed focus). Only a
REPEATED-level pattern may adjust *the week*. Nothing below STABLE-reversal may change
the student's stated priorities without their consent.

## V.3 The Noticing framework — hard product law [REC]

```
FACT (a query, reproducible) → PATTERN (≥ threshold occurrences) →
HYPOTHESIS (one candidate explanation, held loosely) →
CONFIDENCE (low/med/high, from evidence count × recency × consistency) →
ACTION (silent plan-weight change | gentle observation | direct card | notification)
```
**Action escalates only with confidence.** Low = silent adjustment (topic-selector
weights — [CR] already how postponement works). Medium = in-app observation with
receipts. High = notification-worthy noticing. **Voice rules:** always "I noticed…" /
"your last 3 mocks show…"; never "you are…" / "your problem is…". Uncertainty is said
plainly: "might be set selection — worth checking in your next mock."

**Silence rules (as important as the notices):** never notice below threshold; never
two notices in one day; never a negative notice on a comeback day (recovery copy owns
that day); never anything the student can't drill into; never repeat an
un-acted-on notice within 7 days — repetition is the system nagging, not noticing.

---

# PART VI — Repeater onboarding (founder's §11)

[CR] Already captured: repeater?, last-year %ile (mandatory), had-buddy (mandatory),
target %ile, weakest section, coverage grid. The effort-multiplier already consumes the
percentile. **Verdict: the question set is nearly right already. Two additions, one
payoff screen, nothing else.**

| Question | Why | What it changes downstream |
|---|---|---|
| **[keep]** Last CAT %ile | Effort multiplier (0.55–0.90×) | Hours math, finish date, recovery dashboard baseline |
| **[keep]** Had buddy/guide? | Pitch personalization | Repeater-pitch copy; buddy matching context |
| **[ADD] Best mock %ile last season** (approx ok, skippable) | Separates exam-day collapse (mock ≫ CAT) from preparation ceiling (mock ≈ CAT) — different year-2 products | Collapse-profile → mock-cadence + exam-simulation emphasis; ceiling-profile → syllabus/weakness emphasis. Also calibrates whether current mocks are actually improvement. |
| **[ADD] "What do you think went wrong?"** — multi-select, max 2: DILR/section selection · time pressure · consistency broke · didn't analyze mocks · weak topics stayed weak · never found out | Seeds the reconciliation block (IV.3) with hypotheses to verify | Each maps to an observable: "consistency" → logging-cadence watch; "didn't analyze" → debrief-completion watch; "never found out" → the strongest personalization license there is |
| **[REJECT]** study-hours last year, materials used, coaching name, emotional state | No downstream consumer — pure friction | — |

**The payoff screen (the actual missing piece): "Previous Attempt Snapshot."** After
onboarding: last CAT %ile · their 1–2 stated problems · this year's target · and the
contract line: *"This year we won't just finish the syllabus. We'll watch [their stated
problems] continuously — and tell you if the data says the real problem is something
else."* That last clause is the honest version of the coaching industry's "your first
attempt was a diagnostic test" hook [EXT] — except CareerRai will actually run the
diagnostic all year.

**The recovery dashboard** (repeater home element): Last CAT 86.4 → current mock avg →
gap closed → distance to target. [EXT] Goal-gradient research (Kivetz 2006): visible
progress toward a goal accelerates effort — and this number is *meaningful* progress,
unlike a streak count. [CR] Buildable today for the 31 repeaters with percentiles;
starving only because mock entry is (I.3).

---

# PART VII — Mock integration

## VII.1 Options, scored (founder's §39)

| Option | Friction | Adoption likelihood | Eng. effort | Reliability | Verdict |
|---|---|---|---|---|---|
| **A. Manual entry (1 required field)** | Lowest | **Proven** — spreadsheet trackers circulate [EXT] | Tiny ([CR] debrief route exists) | High | **PRIMARY** |
| **B. Paste result** | Low | Plausible; scorecards are web dashboards → copy is natural | Medium (LLM extraction; [CR] Gemini wired) | Med-high w/ confirm step | **FALLBACK / phase 2** |
| C. Screenshot OCR | Medium | Unproven for *repeated* use | Medium-high | Medium | Phase 3, optional |
| D. PDF | Medium | Low — scorecards aren't PDFs [EXT] | Medium | Medium | Skip |
| E. Email import | High (privacy, setup) | Low | High | Low | Skip |
| F/G. Provider APIs/extension | — | — | Very high, per-provider, fragile | — | Skip until a provider partnership exists |

**[REC] The real spec for Manual entry:** one required field (overall %ile) + provider +
mock name; sectional %iles optional-but-encouraged; error-bucket taps optional. **20
seconds for minimum viable entry.** [CR] The current debrief form is close but buried
inside the daily-log flow — mock entry needs its own visible "+ Add Mock" door, usable
any time, not only while logging today.

**The adoption driver is not the form — it's what happens 10 seconds after submit.**
[EXT] Epstein: uselessness kills tracking. Every mock entry must immediately return:
(1) trend vs last mocks, (2) any lifecycle-state change ("DILR pattern — 2nd time"),
(3) one concrete plan change ("tomorrow: 25-min DILR set-selection drill"), (4) for
repeaters, the recovery-dashboard delta. Entry without visible consequence is the
documented abandonment path.

## VII.2 Mock → Memory → Plan pipeline [REC]

```
ENTRY → NORMALIZE (provider-agnostic record) → COMPARE (trend vs history, vs last-year baseline)
→ PATTERN CHECK (mistake-lifecycle thresholds, V.1) → CONFIDENCE → MEMORY UPDATE
→ PLAN ADJUSTMENT (via existing resolveFocusSections + topic-selector weights — no new planner!)
→ EXPLAIN (receipts on the plan card — [CR] focusBasis already does this)
→ OBSERVE NEXT MOCK → UPDATE LIFECYCLE
```

**Five concrete examples:**
1. *Mock 3, DILR lowest 3rd time* → REPEATED → notice + 2-week DILR selection block →
   mocks 4–5 clean → IMPROVING → STABLE → celebration card.
2. *Repeater said "time management"; 4 mocks show accuracy fine, attempts low only in
   DILR* → reconciliation card: "the data points at selection, not speed" — with all 4
   mocks tappable.
3. *Percentile up 88→92 but QA %ile flat* → improvement celebrated AND "QA is now the
   gap to 97" — target-gap framing, not weakness-shaming.
4. *First mock ever entered* → instant baseline card + "2 more mocks before patterns
   become visible" — setting the evidence-threshold expectation honestly.
5. *Mock after 3-week silence* → comeback framing only; mock data quietly enters memory;
   no weakness commentary that day (V.3 silence rule).

---

# PART VIII — Notifications and retention loops

## VIII.1 Notification engine [REC on top of CR]

[CR] Already right: state machine (active/slipping/inactive/dark), per-student daily
budgets, recovery ladder days 2/4/7/14, guilt-free copy. Keep all of it.

**The upgrade is content, not plumbing: every discretionary notification must pass the
test — does it tell the student something CareerRai *learned about them*?**
- ✗ "Today's plan is ready" (schedule-triggered, zero information)
- ✓ "Kal DILR skip hua — aaj 20-min lighter set rakha hai" (state + accommodation)
- ✓ "3 mocks, same DILR pattern — aaj targeted practice hai" (noticing, receipts behind it)
- ✓ "5 din QA consistent — aaj VARC ko priority di hai" (positive noticing; novices need this valence [EXT])

**No-notification conditions:** state says slipping+ (recovery ladder owns the channel);
budget exhausted; notice below confidence threshold; same notice un-acted-on within 7
days; comeback day (one message max, recovery-framed); mock day before score entry
(don't nag — congratulate after).

**Measurement first [P0]:** one row per push send (type, student, timestamp) restores
the send-ledger; then notification → open (existing `app_open` events) → same-day log
becomes a standing query. Without this, everything above is unmeasurable — the founder's
§20 checklist stays half-answerable forever.

## VIII.2 Five retention loops, ranked [REC]

1. **Mock → Mistake-memory → Plan-change → Next-mock verification** (repeater-first).
   Highest value: unique in market [EXT-II.5], serves the best persona, creates its own
   return reason (the next mock verifies the fix). Needs: mock-entry door + lifecycle.
2. **Log → tomorrow visibly shaped by today → morning notification names the shape.**
   The daily engine [CR] exists end-to-end; missing only the *visible* causality — the
   morning push should name yesterday's effect ("kal Algebra half hua — aaj continue").
   Cheapest loop to close.
3. **Silence → guilt-free recovery → comeback → "nothing lost" proof.** [CR] Built.
   Add the Anki lesson: on comeback, show the plan *already rescheduled around the gap*
   — "3 din gap. Plan adjust ho gaya. Aaj sirf 2 topics." Never the debt.
4. **Week → Progress Story → next-week focus.** Weekly proof-of-efficacy (VIII.3) —
   the screenshot-able artifact; for repeaters anchored to the recovery dashboard.
5. **Improvement detected → STABLE celebration → "what's next" handoff.** Lowest
   frequency, highest emotional payload: "you actually fixed a real mistake" is the
   strongest efficacy proof the literature recognizes [EXT-II.2].

## VIII.3 Weekly Progress Story [REC]

Not analytics — a narrative, 5 beats: what happened (days, hours, topics moved) → what
improved vs last week (one number) → what CareerRai noticed (one pattern, receipts) →
mistake-memory movement (anything REPEATED→IMPROVING→STABLE) → next week's one focus.
Repeater version leads with the recovery dashboard. [CR] Weekly Wrap already sits in the
backlog (task #8); this spec fills it. Rule: **maximum one "needs work" item per week** —
the story must be worth screenshotting, not dreading.

---

# PART IX — Metrics

**North star: Weekly Logging Consistency — % of students ≥4 logged days in trailing 7.**
Why not DAU (opens without logs are vanity — [CR] 45 opens, 10 logs today); why not
streaks (punishes the exact lapse the science says to forgive). ≥4/7 tolerates life,
demands habit, and is the direct product of Memory (something worth returning to) ×
Initiative (something that brought you back).

Supporting (8): D1 return (2.0% — most broken number in the funnel) · day-0 log rate
(16.7%) · D7 logged (3.9%) · mock entries/week + % of active students entering ≥1 mock
per 2 weeks (memory fuel gauge) · notice→action rate (% of noticing cards followed by
the referenced task within 48h — personalization quality) · comeback rate (% of
slipping/inactive returning within 7d — [CR] recovery_events makes this queryable) ·
push verified-reach (110/170 today) · weekly-story open rate.

---

# PART X — First 10 experiments [REC]

| # | Hypothesis | Treatment | Primary metric | Effort |
|---|---|---|---|---|
| 1 | Day-1 return is broken because day-1 has no reason | D1 morning push names one real fact from day-0 onboarding ("DILR weakest + 46 days — today's 3 tasks") vs generic | D1 return (2.0% baseline) | S |
| 2 | Visible causality drives logging | Plan card shows "because yesterday…" line (data exists in focusBasis) vs not | log rate | S |
| 3 | Mock entry needs a door, not a form | "+ Add Mock" on Home vs buried in log flow | mock entries/wk (n=~10 today) | S |
| 4 | Instant consequence drives repeat entry | Post-entry: trend+plan-change card vs plain "saved" | 2nd mock entry rate | M |
| 5 | Repeater snapshot raises repeater D7 | Snapshot+contract screen vs current flow (64 repeaters) | repeater D7 log | M |
| 6 | Noticing beats generic nudges | 1 evidence-backed notice/wk vs matched generic push | notice→action, opt-out | M |
| 7 | Comeback reschedule proof beats copy alone | "plan adjusted, nothing lost" card w/ visibly shortened day vs copy-only | comeback→log-again rate | M |
| 8 | Weekly Story lifts week-2 | Story on/off cohorts | next-week consistency | M |
| 9 | The 55 ON-no-sub students are recoverable | Targeted in-app re-mint flow on next open | live-sub count | S |
| 10 | Tenure-sequenced feedback valence | Week-1 encouragement-only vs immediate weakness-surfacing | week-1 retention + survey | M |

Sequencing: 1, 2, 3, 9 immediately (all small); 4–5 next (they build the memory fuel);
6–8, 10 after mock volume exists.

---

# PART XI — What NOT to build (founder's §48, ruthless)

- **Social feed / community expansion / leaderboards** — density isn't there ([CR] Peer
  Pulse population-proof correctly dark below 250 active/day); comparison culture skews
  toxic in this market [EXT-II.4]. Revisit at ~1,000 DAU.
- **Points/badges/gamification-deepening** — Duolingo's mechanics sit atop 4 years of
  retention engineering; at 2% D1 they're paint on a house with no door. Streak system
  [CR] is already right; stop there.
- **Content library / video lectures** — competes with free YouTube on their turf;
  violates the whole positioning ("we run your prep around whatever material you use").
- **Generic AI chatbot** — undifferentiated vs ChatGPT; memory belongs in the plan and
  the noticing, not in a chat window.
- **Provider API integrations** — per-provider, fragile, unnecessary while manual+paste
  is unproven at even 50 entries/week.
- **Long daily reflection / more log fields** — [CR] the 10-Aug reduction was correct;
  founder's own constraint, respected.
- **A second dashboard for memory** — memory surfaces *inside* existing surfaces (plan
  card, weekly story, mock-entry response), or it becomes Mint.

---

# PART XII — P0 / P1 / P2

**P0 (next 30 days):**
1. Push send-ledger row per send (measurement precondition, ~hours of work).
2. "+ Add Mock" door on Home + instant-consequence card (experiments 3–4).
3. Day-1 information-rich push (experiment 1).
4. "Because yesterday" line on the plan card (experiment 2).
5. Re-mint flow for the 55 ON-no-sub students (experiment 9).
6. Repeater Previous-Attempt Snapshot + recovery dashboard (64 repeaters, 31 with
   percentile, waiting today).

**P1:** Mistake lifecycle v1 (SUSPECTED→REPEATED→IMPROVING→STABLE on mock + postponement
data) · noticing engine with V.3 thresholds · Weekly Progress Story · paste-result
extraction · self-studier onboarding moment · best-mock question for repeaters.

**P2:** screenshot OCR · tenure-sequenced feedback valence tuning · cohort peer features
(post-density) · provider partnerships · notification bandit-style timing.

**DO NOT BUILD:** everything in Part XI.

---

# PART XIII — Founder verdict (§50, direct) and the ultimate test (§51)

1. **Biggest retention problem:** Day 0→1. 83% never log once; 98% don't return next
   day. Not a memory problem yet — a first-value problem. Memory × Initiative is the
   *retention* strategy; day-1 needs the *activation* fix (P0 #3–4) for memory to ever
   get data.
2. **Why students stop:** the product hasn't yet proven, inside the first session, that
   tomorrow will be different because of today. [EXT] uselessness-of-data is the
   documented abandonment driver — and with 3 logs, the data genuinely isn't useful yet.
   The fix is showing causality from the very first log.
3. **Biggest opportunity:** cross-mock mistake-memory wired into the daily plan — open
   whitespace in the CAT market [EXT-II.5], strongest persona fit (repeaters), and the
   pipe is already built and starving.
4. **Self-study student should experience:** the answer to "am I preparing correctly?"
   — behavioral noticing + self-vs-observed honesty, learned without being asked.
5. **Repeater should experience:** "what went wrong last time, verified against what's
   happening this time" — snapshot, contract, recovery dashboard, reconciliation.
6. **What CareerRai remembers:** the six layers (IV.1) — four exist, one starves (feed
   it), one is new (build it).
7. **How mistakes are remembered:** V.1 lifecycle, evidence-gated, observation-framed,
   receipts always, decay built in.
8. **How mocks enter:** manual-first (20-second minimum entry), paste second,
   screenshot third, APIs never (for now). The consequence, not the form, drives
   adoption.
9. **What CareerRai notices automatically:** postponement patterns, consistency shifts,
   cross-mock recurrences, self-report-vs-observed gaps, improvements — via V.3, silence
   as default.
10. **What triggers a notification:** new information about *this student* + a relevant
    action, within state + budget rules.
11. **What must NOT:** schedule-triggered content-free pings; anything below confidence
    threshold; repeats of un-acted-on notices; negative notices on comeback days.
12. **Weekly report's job:** proof of efficacy — the screenshot-able "this is working"
    artifact; recovery-dashboard-led for repeaters.
13. **Strongest moat:** the accumulated, acted-upon preparation record. Every week of
    logged history + verified mistake-fixes is switching cost no competitor can import —
    the Anki mechanism, applied to CAT prep.
14. **Build next 30 days:** the P0 list. Nothing else.
15. **Do NOT build next 30 days:** Part XI, especially community expansion, gamification
    deepening, and any API integration.

**§51 — The ultimate test.** After 90 days, CareerRai knows — that a generic app,
coaching institute, test series, ChatGPT, or spreadsheet does not — this student's:
actual (not claimed) study cadence; which sections they avoid under pressure and by how
much; their real hours vs their stated hours; every mock in one deduplicated trend with
recurring-mistake states attached; which of last year's self-diagnoses the data
confirmed or refuted; which interventions they actually follow; and what "fixed" has
been *proven to mean* for them (3 clean mocks, not a feeling).

**And tomorrow morning that knowledge does this:** the 7 AM notification names the one
thing that changed ("QA streak held through the weekend — today VARC leads, 40 min, RC
inference sets, because it's now the gap to 97"); the plan behind it was rebuilt from
that same memory; and when the student opens the mock they take on Sunday, the system is
already waiting to check one specific hypothesis against it. That is Memory ×
Initiative, cashed daily.

**Final principle, kept:** CareerRai remembers the student so the student doesn't have
to. The student's job is to study. Everything in this document serves that split.
