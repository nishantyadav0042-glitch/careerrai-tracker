# Task-Attached External Resources — the build plan (30 Aug 2026)

> Status: **DRAFT FOR FOUNDER REVIEW — nothing here is built.** This is the
> plan + rules document the founder asked for ("पहले plan बनाओ, rules discuss
> करेंगे, फिर build"). The rules in §3 are proposed as binding once the founder
> signs off; the founder will cross-examine them (incl. with other AI) before
> anything is coded.
>
> Prior work this consolidates: three research rounds (legal, platform ToS,
> precedent, link rot, return mechanics, source supply) discussed with the
> founder on 30 Aug. Sources are cited inline where a claim is external.

---

## 0. What this is, in one line

> Every daily task the plan engine already emits ("Solve 2 Arrangements sets")
> gets, where we have a vetted one, **exactly one attached external link that
> actually contains what the task demands** — opened outside the app, never
> hosted, never mandated — and the student's return + outcome is captured.

### The product thesis (founder-locked, 30 Aug)

> **CareerRai does not provide content. CareerRai provides an execution
> path.** When a student receives a preparation task, CareerRai may
> optionally provide a vetted external starting point that helps the
> student execute that task. The student remains free to use that resource,
> another resource, or no resource at all.
>
> CareerRai Task → optional resource → student leaves → learns/practices →
> returns → continues the CareerRai plan.

What we are building is a **resource intelligence + routing layer**, not a
content recommendation app: research corpus → human verification → Phase-0
live test on exactly 3 topics → observed outcomes → calibration →
personalization. In that order, no step skipped forward.

We are not building a content library, a video platform, or a question bank.
We are attaching a starting point to an instruction that today has none.

**End-of-year company goal this serves:** student retention and value — the
MISSION.md funnel (319 signed up → 59 ever logged → 5 logged 7+ days). Today
the plan tells a student "solve 15 questions" with no way to do it inside or
via the app. The most likely drop-off moment is exactly that dead end.

### The mission filter (MISSION.md), answered

1. **Better for a never-pays student?** Yes — the free plan becomes executable,
   not just descriptive. Nothing here is gated.
2. **Deepens what we learn?** Yes, if and only if the return loop ships with
   it: click → return → outcome per (topic × resource) is a structured trace
   that today is lost to YouTube/Telegram.
3. **Survives 100,000 students?** The linking does; the **curation** is the
   scale risk — §7 (SWOT) and §8 (ops) address it head-on. Human verification
   must be a process with an owner, never founder-memory.
4. **Build it at ₹0 revenue?** Yes. It costs curation time, not capital.

---

## 1. Settled decisions (founder, 30 Aug — recorded, not re-litigated)

- **GO** — but as task-attached resources, not a content platform.
- **Host nothing.** No mirror, no PDF copy, no transcript, no re-upload, no
  video file. Original URL → student's browser/app. Ever.
- **No embedding in phase 1.** Link out only. (Embedding is where US case law
  is split — Perfect 10 v. Amazon vs. Goldman v. Breitbart — and where
  YouTube's API ToS obligations attach. Linking out is contested nowhere.)
- **Never mandate.** The link is an optional aid: "Need help? Here's a good
  starting point." A student may use coaching, books, their own search. Copy
  must never say "must watch".
- **One link default; max two when the first is dicey; never a list.** A list
  is a library; one pick is a *decision* — and a decision can be measured
  right or wrong later.
- **Competitor content is allowed.** Our value proposition is not "we made the
  video"; it is "we know what you should do today". Sending a student to
  Rodha at the right moment and getting them back is orchestration, not loss.
- **Zero tolerance for pirated/re-uploaded sources** (Tier 4 below).
- **A lawyer gives a short written India-specific linking/third-party-resource
  review before public launch.** We never claim "zero legal risk".
- **Constitution wording** (amends "not a content library" without replacing
  it): *CareerRai does not host or sell a content library. It may attach
  vetted external learning resources to a student's preparation tasks when
  doing so improves execution.*

---

## 2. The two founder conditions, made precise

The founder set two conditions on 30 Aug. They become the two hard gates of
the whole system:

### Gate V — Validity
The link opens, for a logged-out student, on an Indian connection, on a phone,
today. Machine-checkable, machine-checked (§8).

### Gate S — Sufficiency (the hard one, and the actual product)
**The link must contain what the task demands.** If the task says "Solve 2
Arrangements sets", the destination must actually contain ≥2 Arrangements
sets a student can attempt. If the task says "Learn Percentages", the
destination must actually teach Percentages at the right level. A link that is
merely *related* to the topic fails Gate S.

Why this is the crux: the plan engine already speaks in **units and counts** —
`targetPhrase`/`taskVolume` (`src/lib/routine-engine.ts:299–346`) emit
"3 RC passages, timed", "Solve 2 sets", "Learn X, solve 12 questions". So
sufficiency is checkable **only if the resource declares its supply in the
same units**. That is a curation field, filled by a human who actually opened
the resource and counted — never scraped, never assumed.

**Student-time realism (founder, 30 Aug):** what an AI skims in 2 minutes
takes a student an hour. A resource's `est_student_minutes` is estimated as a
student experiences it, using the engine's own per-unit pacing
(`minutesPerUnit` in `routine-engine.ts`) so the link and the task can never
disagree about time:

| Resource kind | Student-minutes rule |
|---|---|
| Video (concept) | video length × 1.5 (pause, rewind, notes) |
| Article / reading | word count ÷ 200 wpm × 1.3 |
| QA questions | engine's min/question for the phase (≈3 min) × count |
| DILR sets | engine's min/set × count |
| RC passages | engine's min/passage × count |

If a resource's honest student-minutes exceed the task's slot by more than
~50%, it fails Gate S for that slot (it may pass for a longer slot).

### The target–resource contract (the rule that keeps us honest)
- A `concept` resource can NEVER satisfy a `practice` target. "Learn X, solve
  12 questions" needs either one resource that has both, or the concept link
  attached with the count target intact and unclaimed by the link.
- Where a practice resource's question count is unknown or unstable, the task
  target is phrased **in time, not count** ("25 min practice on X") — because
  a count we didn't verify is an invented number, which our own rules forbid.
- Attaching a link must never *change* the target. The engine's target stands;
  the resource either satisfies it or is not attached.

---

## 3. The rules (proposed as binding — founder to ratify)

### R1–R4: what we will never do
1. **R1 — Never host third-party content.** (No copy in any form. The one
   theoretical exception — genuinely open-licensed text like Aeon *Ideas*
   CC BY-ND — still requires an explicit founder decision per source; default
   is link-only.)
2. **R2 — Never treat "free on YouTube" as "openly licensed".** Public ≠
   reusable. We link; we never claim, badge, or imply the content is ours.
3. **R3 — Never link a source whose uploader is not the rights-holder.**
   This is the GS Media rule (CJEU C-160/15): a for-profit linker is
   *presumed to know* when the target upload is illegal. Curation quality is
   our legal defence — we do not sit in intermediary safe harbour because we
   editorially select links.
4. **R4 — Never mandate, never gate, never paywall the link.** Optional aid,
   free surface, always.

### R5–R8: what every link must pass (the 8-gate curation checklist)
Every resource passes ALL gates before `is_active = true`:

| # | Gate | Checked by |
|---|---|---|
| 1 | Uploader is the rights-holder (official channel / educator's own channel / publisher's own site) | human |
| 2 | Opens logged-out, no signup, no payment (flag `requires_login` where a legit source needs it, e.g. some official CAT paper years — then the card must say so) | human + machine |
| 3 | Accessible from India, mobile-friendly | machine + human |
| 4 | Stable canonical URL (no playlist-position, no timestamp dependence) | human |
| 5 | **Sufficiency**: contains the declared supply (counted by a human), student-minutes estimated per §2 | human |
| 6 | Right level for the declared coverage status (a `not_started` student and a `revising` student need different links) | human |
| 7 | Source name visibly attributed on our card | design rule |
| 8 | No piracy indicators anywhere on the destination (Telegram funnels, "free download of paid course", re-upload watermarks) | human |

### R9: source tiers
- **Tier 1 — Preferred:** official exam bodies (iimcat.ac.in past papers,
  2017–2025 released with keys), official institutions, public-domain, NCERT,
  clearly-licensed material, creator-owned pages.
- **Tier 2 — Established free educational platforms:** Khan Academy (link
  only — their content is CC BY-NC-SA; linking is expressly permitted,
  incorporation into a commercial product is not), OpenStax (link to
  sections), reputable publishers' free material.
- **Tier 3 — YouTube creators / free blogs (incl. competitors):** allowed as
  links when gates 1–8 pass. Rodha, 2IIM, Cracku free tier, Handa ka Funda,
  Bodhee Prep, MBAtious are candidates, not defaults — each link individually
  vetted.
- **Tier 4 — Never:** leaked coaching PDFs, pirated lectures, Telegram piracy,
  scraped question banks, mirrors of paid content. Zero tolerance; one such
  link poisons the entire legal posture (see R3).

### R10–R13: how it behaves in product
10. **R10 — Click ≠ completion.** Click sets `started` (we know it, we may
    show it). Completion is the student's own tick (the only truth). Two
    separate fields, never merged. (Moodle's "viewed = complete" is the
    anti-pattern: it manufactures a number.)
11. **R11 — Plan mutable, history immutable.** Tasks reference `resource_id`
    (so a dead link is swapped without rewriting plans), but every click/
    outcome event freezes the exact `resource_version` served. Otherwise a
    swap silently corrupts every past outcome and the future ranking moat is
    built on lies.
12. **R12 — The 👍/😐/👎 return prompt never drives ranking.** It catches
    broken/wrong links fast (that's its job). Ranking, when it ever exists,
    comes from practice outcomes — otherwise we rank by entertainment, and in
    CAT the most entertaining video is rarely the most useful.
13. **R13 — Dead link = one Exception** (`src/lib/os/exception.ts`), per
    SCALE-CONTRACT. No new dashboard. The student-facing "यह link नहीं चला"
    button feeds the same queue as the automated check.

---

## 4. Architecture (agreed shape — schema locked only AFTER Phase 0)

```
student model → daily plan → RoutineTask ──┬── target (engine's, untouched)
                                           └── resource_id ─→ topic_resources
                                                                   │
                                              student ← external URL (link out)
                                                 │
                                          return signal (started / outcome)
                                                 │
                                          resource_events (immutable, versioned)
```

### Draft `topic_resources` (for discussion, not migration)
```
id, topic            -- canonical unit string from topics-constants.ts (56 units)
intent               -- 'concept' | 'practice' | 'reading'
coverage_fit         -- which statuses it suits: e.g. {not_started, learning}
url, title, provider, source_tier            -- tier 1..3 (4 never stored)
license_note         -- e.g. "link OK; CC BY-NC-SA — never host"
requires_login BOOL  -- card must disclose
region_ok BOOL
-- Sufficiency (Gate S), in the ENGINE's units:
supply_unit          -- 'question' | 'set' | 'passage' | 'concept'
supply_count         -- human-counted; null for concept
est_student_minutes  -- per §2 rules
-- Two verifications, never merged (automated ≠ content verification):
last_health_checked_at, health_status        -- machine (daily/weekly, free)
last_human_verified_at, verified_by          -- human (fortnightly)
is_active, replacement_resource_id, why_selected
version              -- bumped on any URL/supply change; events freeze it
```

### Return mechanics (uses what we already have)
- Android app is a **TWA** (`android/twa-manifest.json`): out-of-scope links
  open in a Custom Tab with a close-bar back to the app — the return
  affordance exists today, free.
- Open decision (Phase 0 measures it, we don't guess): YouTube links →
  YouTube app (better playback, weaker return — Android app-links will
  claim youtube.com) vs. forced Custom Tab (guaranteed return, weaker
  playback). Articles/questions → Custom Tab, uncontroversial.
- The real return mechanism is UX, not tech: on click the task flips to
  `started · 4:12pm` and the checkbox stays **unticked**. The unfinished
  checkbox is the pull; no notification needed.
- On return: "Did this help? 👍 😐 👎 / didn't open" → then "Continue to
  [target] →". One tap, skippable, never blocking.

### Verification ops (§8 has the schedule)
- **Machine:** YouTube Data API `videos.list`, 50 IDs per call at 1 quota
  unit — 5,000 videos ≈ 100 units of a 10,000/day free quota (≈1%). Catches
  deleted / private / region-blocked distinctly. HTTP + soft-404 checks for
  articles. Weekly refresh also satisfies YouTube's 30-day stored-data
  policy. Failures → Exception rows.
- **Human:** fortnightly pass over active resources against gates 5, 6, 8
  ("does it still teach this, still free, still the right level"). This is a
  named process with an owner from day one — founder-memory fails filter #3.

---

## 5. Phases

### Phase 0 — Kill-test (one weekend of curation, ~zero engineering)
**Label, everywhere it is discussed: an operational kill-test, not a
statistical experiment.** Success is "some real students used it and gave an
actionable return signal" — never "CTR = X%, therefore retention improved".
With 19 students active in the last 3 days, no percentage from n=20 is
valid, and inventing one violates our own rules. It answers exactly two
questions:
1. **Does anyone open the link at all?**
2. **Do returners tell us something we didn't know?** (wrong level, wrong
   length, "video was great", "link needed login")

Protocol:
- Pick 3 topics **by query, not guess** (§6): 2 from strong-supply sections +
  1 deliberately from DILR (weakest free supply — read separately as a stress
  case, never averaged into the verdict).
- 1 hand-vetted resource each (full 8-gate pass), attached to matching tasks
  for ~20–30 active students.
- Manual measurement is fine at this n. Also measure: YouTube-app vs
  Custom-Tab return behaviour.
- **Kill rule:** if effectively nobody opens (0–1 of 20), the thesis dies
  here and we saved months. If a handful open AND return with signal, thesis
  lives → Phase 1.

### Phase 1 — Resource infrastructure
`topic_resources` (schema locked from Phase 0 learnings), the 8-gate
workflow, machine health checks, Exception wiring, "link नहीं चला" button.
Curation load: 56 units × up to 3 intents, but **shipped incrementally,
starting with the top-N topics by actual plan frequency** — not all at once.

### Phase 2 — Task integration
The card: target (engine's), "Suggested learning: [Open free resource ↗ ·
Provider · ~24 min]", the autonomy line ("Already have another source?
That's fine — use yours."), started-state flip, completion tick unchanged.
**Expectation before the jump (founder, 30 Aug):** the card states, before
the student leaves, exactly what they are opening — provider, type, and
honest time estimate ("Free external resource · YouTube · ~24 min"). A count
("15 questions") appears only when we counted it (Gate S); otherwise the
target is time-phrased. Applies from Phase 0's manual cards onward.

**Legal posture, stated as the two separate questions (founder, 30 Aug):**
- **A. Source-level permission — can we LINK to it?** Potentially yes, after
  the 8-gate vetting. This is the only question Phase 0–3 ever asks.
- **B. Content-level rights — can we HOST/reproduce it?** No. Default answer
  is permanently no (R1); we do not even attempt to acquire third-party
  rights in Phase 0.

Two refinements (founder, 30 Aug, second pass):
- **The stance is "lower-risk architecture", never "zero legal risk".**
  Link-only is the safest structure available, and it is still an
  architecture choice, not a legal conclusion — the written India-specific
  lawyer review remains mandatory before broad deployment.
- **Rights are checked at the RESOURCE level, not the brand level.** A
  platform's own terms can treat content classes differently (ordinary
  content vs CC-licensed subsets vs non-commercial restrictions — Khan
  Academy's terms are the worked example). "Platform X = open" is never a
  valid curation shortcut; each linked resource carries its own
  `license_note`.

**The minimum useful engineering slice (founder-locked, 30 Aug):** when
Phase-0 resources are finalized, what gets BUILT is exactly:
task → optional external resource → external browser → student returns →
completion tick → simple outcome signal. Nothing more: no content hosting,
no embedding, no recommendation engine, no AI resource-ranking, and **no
adaptive-effort calculator inside the live planner** — the effort model
(`docs/ADAPTIVE-EFFORT-MODEL.md`) governs curation-time sufficiency
judgments only, until observed Phase-0 outcomes exist to calibrate it.
Ordering is fixed: research → resources → verification → Phase-0 →
observed outcomes → calibration → personalization. Building the
personalization before its input data exists is the named failure mode.

### Phase 3 — Return loop
The return prompt + event capture (versioned per R11). This is what turns the
feature from "helpful links" into mission filter #2 compliance.

### Phase 4 — Resource intelligence (EXPLICITLY DEFERRED)
Outcome-ranked routing per learner profile — the real moat, and not buildable
now. **Trigger is a number, not a date: ≥100 completed practice outcomes on
any single (topic × resource) pair.** Before that, ranking infrastructure is
waste. Until then, 👎-spike on a resource (via R12's narrow job) just flags it
for human re-verification.

### Phase 5 — Own content only where free supply is proven bad
Data decides. Prior expectation from research: **DILR sets** (worst free
supply, biggest CAT differentiator) — mitigated meanwhile by Tier-1 official
past papers + our own daily challenge (already ours, already being built).
Where supply is abundant (QA fundamentals, VARC reading), we never build.

---

## 6. Phase 0 topic selection — measured, 30 Aug 2026

Two evidence passes were run (read-only, production):

**(a) What do week-1 students actually log?** `daily_reports.topics_covered`
for students signed up in the last 90 days, first 7 days after signup:
103 students logged "QA", 103 "VARC", 81 "DILR" — i.e. **week-1 logging is
almost entirely section-level, not topic-level** (single-topic entries were
n=1 each). Behaviour data therefore cannot rank topics; only the engine can.

**(b) What does the engine serve in week 1?** Simulated a fresh student
(all 46 units `not_started`, no syllabus date, start 30 Aug) through
`buildTopicChoices` + `dayShape` for days 1–7, weighted by the real 90-day
profile distribution (self-reported weakest: VARC 267 · QA 188 · DILR 78 ·
null 442; hours variants 3 / 4.5 / 6). Top of the serve order:

| Rank | Topic | Section | Weighted serve | First appears |
|---|---|---|---|---|
| 1 | Reading Comprehension | VARC | 1665 | day 1, recurs all week |
| 2 | Percentages | QA | 1645 | day 1, recurs all week |
| 3 | Arrangements | DILR | 1352 | day 1, recurs most days |
| 4 | Editorial Reading | VARC | 1113 | day 1–2 |
| 5 | Tables | DILR | 1050 | day 1–2 |
| 6 | Ratio & Proportion | QA | 975 | day 1–2 |

**Phase 0 topics (from evidence): Reading Comprehension, Percentages,
Arrangements.** RC and Percentages are the strong-supply pair; Arrangements
is the DILR stress case — and it earned that slot by being the engine's #1
DILR serve, not by guess. Results are read separately per topic (§5), never
averaged.

---

## 7. SWOT — where this backfires for a startup (founder asked: "practically, कहाँ गलती कर सकते हैं")

### Strengths
- Plan engine already emits structured unit+count targets — sufficiency is
  checkable, not aspirational.
- TWA return affordance and Exception primitive already exist; near-zero new
  infrastructure for Phase 0–1.
- Zero content cost; capital-efficient by construction.
- The measurement loop (click → return → outcome) is a data asset none of
  iQuanta/Cracku/Rodha capture.

### Weaknesses
- **Curation is human, slow, and initially founder-shaped.** 3 topics is a
  weekend; 56×3 with per-status fit is a standing job. If it has no owner and
  no cadence, links rot silently and the feature becomes a trust liability.
- We control neither quality drift nor paywalling of destinations.
- Sufficiency counting is manual and error-prone; a miscount ships a lie.

### Opportunities
- Outcome-ranked routing (Phase 4) is a genuine moat: creators know views,
  we'd know *which resource moved which learner profile's accuracy*.
- Creator partnerships: we send traffic; "featured as CareerRai's suggested
  resource" costs nothing and could formalize Tier 3 into Tier 1-like
  arrangements later.
- DILR gap is a mapped, data-justified place for our own bank (Phase 5).

### Threats (ranked by expected damage, worst first)
1. **Sufficiency failure → trust collapse.** "App ने बोला 4 sets, link में
   2 थे" — one such experience and the student stops believing every card.
   Trust damage compounds worse than absence of the feature. (Mitigation:
   Gate S human-counted, time-phrased targets when counts are unstable.)
2. **Retention theater.** Click counted as engagement while the student is 40
   minutes into YouTube Shorts. We congratulate ourselves on opens while
   losing the student. (Mitigation: R10, funnel measured to *practice
   completion*, never to click.)
3. **One pirated link.** GS Media presumption + no safe harbour = our whole
   posture rests on curation. (Mitigation: R3, gate 8, Tier 4 zero
   tolerance, written lawyer review.)
4. **Competitor funnel leakage.** Rodha's video ends → subscribe → their
   Telegram → their world. We can't and won't block that (their UI stays
   intact); we compete on the reason to return: the unfinished checkbox and
   tomorrow's plan. Watch `return rate` per provider; if a provider's return
   rate is structurally terrible, swap the resource, not the policy.
5. **Link rot at scale.** ~25–38% of pages die over a decade (Pew 2024);
   fine at 60 links with checks, ugly at 600 without. (Mitigation: machine
   checks are ≈1% of free quota; `replacement_resource_id`; R11 indirection.)
6. **Legal ambiguity in India.** No linking statute; Bixee v. Naukri (2006)
   restrained competitor deep-linking-to-bypass; our fact pattern (sending
   traffic to the source's own page) is the opposite, but "low risk" ≠ "no
   risk". (Mitigation: written legal review; R1–R3.)
7. **Founder-dependence** — the 100k filter: if weekly human verification
   only happens when the founder remembers, the feature fails MISSION filter
   #3. (Mitigation: named owner + cadence in §8 from day one, even while the
   owner is the founder.)

---

## 8. Ops cadence (day-one version)

| What | Who | When |
|---|---|---|
| Machine health check (YouTube API + HTTP) | cron | daily (cost ≈ free) |
| Exception triage for dead links | owner | within 48h, swap or deactivate |
| Human re-verification (gates 5/6/8) | owner (founder initially, named) | fortnightly, batched |
| Student "link नहीं चला" reports | same Exception queue | same 48h SLA |
| License/tier re-review of providers | owner | quarterly |

---

## 9. Open decisions for the founder (nothing else blocks on these)

1. **Ratify R1–R13 and the 8 gates** (after cross-examination with other AI,
   as planned).
2. YouTube links: YouTube app vs forced Custom Tab — decided by Phase 0
   measurement, but the founder should own the final call.
3. The autonomy copy on the card (exact wording of "use your own source"
   line).
4. Who is the named curation owner at Phase 1 (can be the founder, must be
   named).
5. Lawyer engagement timing: before Phase 1 ships publicly (Phase 0 with
   ~20 students can precede it — founder to confirm comfort).
```
