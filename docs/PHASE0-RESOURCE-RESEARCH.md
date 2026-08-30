# Phase-0 Resource Research — in-house pass (30 Aug 2026)

> Status: **candidate discovery, NOT final vetting.** Per
> `docs/RESOURCE-LINKING-PLAN-2026-08.md`, a resource enters Phase 0 only
> after a human curator passes it through all 8 gates by hand, on an Indian
> phone, logged out. This document gets each candidate as far as it can go
> from here and marks exactly what remains unverified.
>
> **Environment limitation, stated up front:** this research session's
> network proxy blocks direct fetches of the candidate sites (2iim.com,
> bodheeprep.com, aeon.co, youtube.com all egress-blocked). Everything below
> is therefore search-index evidence — titles, counts, and access claims as
> indexed — NOT a live page-open. Every "Not verified" is a hand-check the
> curator must do. India-accessibility and mobile rendering could not be
> verified for ANY candidate from here.

The same assignment is being run independently through external research AIs
using `docs/RESOURCE-RESEARCH-MASTER-PROMPT.md`; cross-check their outputs
against this sheet before the founder's hand-vetting round.

---

## Executive summary

| Topic | Best concept candidate | Best practice candidate | Confidence | Main concern |
|---|---|---|---|---|
| Reading Comprehension | Bodhee Prep "How to read CAT RC passages" (article) | Bodhee Prep free RC practice bank ("521+ questions") | Medium | gating on individual passages not verified |
| Percentages | Rodha YouTube percentages lecture (creator-owned) | 2IIM free question bank, percents cluster ("no sign-up" is their own stated policy) | Medium-high | video duration/fit unverified; question count per cluster needs a hand count |
| Arrangements (stress case) | Rodha LRDI arrangements lecture | Bodhee Prep "101+ LRDI sets" w/ video solutions | **Low-medium — stress case behaving as predicted** | set-level sufficiency and CAT-difficulty unverified; strongest sources are login-walled |

**One finding that changes our earlier assumption:** official CAT past
papers on iimcat.ac.in sit behind a **candidate login** (registration number
+ password). A week-1 aspirant who hasn't registered for this year's CAT has
no credentials — so official papers FAIL gate 2 for exactly the students
Phase 0 targets. Aggregator mirrors of those PDFs exist but are re-hosted
copies of IIM material (provenance/Tier problem). Official papers move from
"cleanest source" to "mostly unusable as a link target"; they may return
later for registered students only, with `requires_login` disclosed.

---

## 1. Reading Comprehension (VARC)

### Candidate RC-1 — Bodhee Prep free CAT RC practice bank · PRACTICE
- URL: `https://bodheeprep.com/free-cat-rc-practice-problems`
- Provider: Bodhee Prep (own site, own material) — Tier 3
- Indexed claim: "521+ CAT RC Practice Questions", short and long passages,
  organized as practice sets; separate page of previous-years RC passages
  (`/cat-reading-comprehension-pdf-previous-years`, 1999–2006 era)
- Free? Indexed as free practice problems. **Login/gating on individual
  passages: Not verified.** India/mobile: Not verified.
- Supply count: "521+" is THEIR claim, not our count. Curator must count
  passages actually reachable without signup and note per-set passage counts
  (task needs 2–5 passages/day).
- Licence: their own material — linking reasonable; never host. Their old
  PDFs of past CAT passages (pre-2006 papers) are IIM-derived — link only,
  and prefer their self-authored sets over their past-paper PDFs.
- Verdict: **CONDITIONAL — strongest RC practice candidate pending gating +
  count hand-check.**

### Candidate RC-2 — Bodhee Prep "How to read CAT RC passages" · CONCEPT
- URL: `https://bodheeprep.com/how-read-cat-rc-passages`
- Free article, own material. Concept for RC is approach, not theory — an
  article beats a long video here (student time). Not verified: length,
  gating. Verdict: **CONDITIONAL.**

### Candidate RC-3 — Aeon essays · READING (adjacent: Editorial/Long-form habit)
- URL: `https://aeon.co/essays`
- Long-form non-fiction very close to CAT RC register; free, no paywall per
  prior research; *Ideas* pieces are CC BY-ND (their stated author terms) —
  the only genuinely open-licensed source in this sheet. No question sets —
  so it CANNOT satisfy an RC practice target (Gate S), only the reading
  habit tasks (Editorial Reading / Long-form Reading — engine ranks #4).
- Verdict: **PASS for reading tasks only; FAIL for RC practice tasks.**

### Rejected (RC)
- **Cracku RC bank ("858+ questions")** — indexed as requiring an account
  for tests (their model funnels to signup). Rejected on gate 2 unless a
  hand-check shows passages open logged-out. Re-admit if it does.
- **Official CAT papers** — login wall (see summary). FAIL gate 2 for the
  Phase-0 population.
- **Scribd mirror of Bodhee RC material** — textbook Tier 4: a third party
  re-hosting someone else's material. Never. (Kept here as the worked
  example of what gate 8 rejects.)

---

## 2. Percentages (QA)

### Candidate P-1 — 2IIM free CAT question bank, percents/profits cluster · PRACTICE
- URL: `https://iim-cat-questions-answers.2iim.com/quant/arithmetic/percents-profits/`
- Provider: 2IIM (own site, own material, CAT-focused coaching) — Tier 3
- Indexed evidence: their own pages state "zero cost, no sign-up required"
  (their free-material page is literally titled "No Sign-Up Required");
  individually numbered question pages visible in the index at least to
  #33 in this cluster, each with a solution page. CAT-level by design
  (their bank is built from CAT-style questions).
- Caveat: cluster mixes Percentages with Profit&Loss and SI&CI — curator
  must count the *Percentages-only* questions; if <12 (practising-task
  cap is 22), phrase the target in time, or attach at cluster level.
- Not verified: exact per-topic count, India/mobile, ad density.
- Verdict: **CONDITIONAL — strongest Percentages practice candidate;
  their explicit no-signup policy is the best access posture found.**

### Candidate P-2 — Rodha percentages lecture (YouTube) · CONCEPT
- Candidate URLs (exact one to be picked by curator on hand-check):
  `https://www.youtube.com/watch?v=x-k8iSNr85g` ("Percentages 1 | CAT
  Preparation | Arithmetic") or the newer CAT-2026 series equivalent
  (e.g. `watch?v=R2NDKFK3K3U`). Channel: Rodha (creator-owned, ~391K subs,
  the channel's own uploads — not re-uploads). Tier 3, competitor — allowed.
- Not verified: duration (→ student time = duration × 1.5), availability,
  region. A >45-min lecture likely overshoots a foundation slot — curator
  should prefer the shortest video that actually teaches CAT-level
  percentages, and must record duration.
- Verdict: **CONDITIONAL.**

### Rejected (Percentages)
- **Khan Academy percentages** — legitimate, stable, free; but school-level
  register, not CAT traps/speed. FAIL on CAT-relevance for the main task.
  Retain as a possible *remedial* alternative later (their policy permits
  linking; never host — CC BY-NC-SA).
- **Cracku percentage bank** — signup-funnel model; same gate-2 posture as
  RC. Re-admit only if hand-check shows logged-out access.
- **Generic aptitude sites (IndiaBIX-class)** — school/placement register,
  heavy ads, weak CAT relevance. FAIL.

---

## 3. Arrangements (DILR) — the stress case, behaving as predicted

### Candidate A-1 — Bodhee Prep LRDI sets · PRACTICE
- URL: `https://bodheeprep.com/cat-logical-reasoning`
- Indexed claim: "101+ CAT Logical Reasoning [LRDI] Sets with Solutions",
  covering linear/circular/tabular arrangements, with video solutions;
  individual set pages exist (`/cat-lrdi-set-video-solution-1`, …) and a
  free PDF of past LRDI sets.
- Not verified: how many are *Arrangements* sets specifically; how many open
  logged-out; whether difficulty is CAT-2020s level (post-2015 DILR is
  much harder than older material); India/mobile.
- Verdict: **CONDITIONAL — the only free candidate found with claimed
  set-level supply at CAT level.**

### Candidate A-2 — Rodha LRDI arrangements lecture (YouTube) · CONCEPT
- Candidate URLs: `watch?v=YWVPmlYnUWE` ("Master Linear Arrangements-1 |
  LRDI Live Class", Apoorv Sir, Rodha) or `watch?v=4tI-h-GKWVk` ("Linear and
  Circular Arrangement - I"). Channel legitimacy: Rodha's own uploads.
- Caveat: live-class recordings run long (60–90+ min → 90–135 student-min);
  likely exceeds a foundation slot. Curator should check for a shorter
  concept video first. Not verified: durations, availability.
- Verdict: **CONDITIONAL.**

### Candidate A-3 — Quantifiers.in DILR arrangement sets · PRACTICE backup
- URL: `https://quantifiers.in/dilr/dilr-arrangement/`
- Indexed as practice + video solutions; provenance/scale of the site
  unknown to us — legitimacy itself is the thing to verify (gate 1).
- Verdict: **CONDITIONAL (weak) — backup only.**

### Rejected (Arrangements)
- **Official CAT DILR sections** — login wall (see summary).
- **Cracku DILR ("1000+ questions")** — signup funnel; same posture.
- **SelfStudys / EduRev / collegedunia-class pages** — aggregator register,
  bank-exam-level single puzzles rather than CAT multi-question sets, ad
  density, unclear sourcing. FAIL on CAT-relevance and/or provenance.

### Honest stress-case read (do not soften)
The prediction held. For QA and VARC there exist first-party, no-signup,
self-authored banks. For Arrangements, every high-volume source is either
**login-walled (Cracku, official)** or **claims-based and unverified
(Bodhee's 101+)**, and concept videos run long. If the hand-check shows
Bodhee's arrangement sets are few, gated, or sub-CAT difficulty, the correct
Phase-0 record is: **"external linking does not sufficiently solve DILR
practice"** — which is exactly the evidence Phase 5 (own DILR bank) needs.
Do not lower the bar to force a Phase-0 link.

---

## Curator hand-check sheet (the founder's 30-minute job, per candidate)

On an Indian phone, logged out, airplane-mode-off, record for each:
1. Opens? Lands on content, not homepage? (gates 2–4)
2. Count what the task needs: RC → passages per set; Percentages →
   Percentages-only questions; Arrangements → arrangement sets. Write the
   number down; it becomes the card's count or forces a time-phrased target.
3. Video: exact duration → ×1.5 = student minutes; fits the slot?
4. Any signup interstitial, app-install nag, or paywall teaser? How many
   taps from link to first question?
5. Gut check as an aspirant: would YOU study from this for the task written
   on the card? (gate 6)
6. Date + initials → this doc, then the winning link per topic is Phase 0.

## What the card may say (only after the hand-check)
- RC: "Need help? Practice passages here — free external resource." +
  count only if counted.
- Percentages: "Learn here first (~NN min, free) — then solve your
  questions." (NN from measured duration × 1.5)
- Arrangements: whatever survives; if nothing does, the task ships with no
  link and that absence is the Phase-0 result for DILR.
