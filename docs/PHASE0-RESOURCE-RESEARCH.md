# Phase-0 Resource Research — in-house pass (30 Aug 2026)

> Status: **candidate discovery, NOT final vetting.** Per
> `docs/RESOURCE-LINKING-PLAN-2026-08.md`, a resource enters Phase 0 only
> after a human curator passes it through all 8 gates by hand, on an Indian
> phone, logged out. This document gets each candidate as far as it can go
> from here and marks exactly what remains unverified.
>
> **Environment limitation, updated 30 Aug (tools added):** the local
> network proxy still blocks direct WebFetch to these sites, but **Exa**
> (`web_fetch_exa`, server-side page fetch) and **vidIQ**
> (`vidiq_get_videos_by_ids`, YouTube metadata — duration, stats, channel,
> confirmed to include `duration` in ISO-8601 form, a working substitute for
> the YouTube Data API `videos.list` call originally planned) were added and
> used below to verify several candidates directly. What Exa/vidIQ still
> CANNOT do: confirm India IP accessibility, render a real mobile viewport,
> or catch a JS-injected signup/payment popup that a live browser would hit.
> Those three remain founder hand-check items (checklist below) even after
> this pass — every "Not verified" tag that survives below is one of these.

## Live verification pass (Exa + vidIQ, 30 Aug)

**YouTube candidates — exact durations now confirmed, two of four candidates corrected:**

| Video ID | Title | Channel | Duration | Views | Verdict |
|---|---|---|---|---|---|
| `x-k8iSNr85g` | Percentages 1: Fractions to Percentages | Rodha | **26m19s** | 1,179,679 | **PASS** — Foundation concept, "Part 7 of 65" of an organized free playlist |
| `R2NDKFK3K3U` | Percentage, Profit and Loss 3 | Rodha | 57m29s | 1,520 | **FAIL** — raw live-class recording, ~2× the video-effort band, thin engagement (posted 2026, essentially unvetted by other viewers) |
| `4tI-h-GKWVk` | Linear and Circular Arrangement - I | Rodha | **20m11s** | 845,389 | **PASS** — concise, high engagement, general channel (not tied to a course pitch) |
| `YWVPmlYnUWE` | Master Linear Arrangements-1 (LRDI Live Class) | Rodha | 48m37s | 1,234 | **FAIL** — live-class recording AND its own description links straight to a ₹35,499 paid-batch checkout page. This is the "competitor funnel" risk (SWOT §7 threat #4) caught in an actual candidate, not a hypothetical. |

Both FAILs share a pattern: recent (2026) live-class recordings, 45+ minutes,
thin independent engagement — the opposite of the PASS pair, which are
older, concise, standalone concept uploads from an organized playlist. This
is now a standing selection rule for future video candidates: **prefer an
established playlist upload over a live-class recording**, and treat any
video whose own description promotes a paid checkout as Tier-3-but-flagged,
not a clean pick, even from an otherwise legitimate creator channel.

**Page structure — confirmed via direct fetch, not search-index claims:**

- **Bodhee RC bank** (`/free-cat-rc-practice-problems`): confirmed real
  structure — 30 numbered "RC with Video Solution" sets, plus separate
  CAT-2021 (12 passages), 2020, 2019, 2018 sections. No login wall visible
  in the fetched index page. The page's own text says CAT RC difficulty has
  been "on the higher side" since CAT 2019 — i.e. this bank skews toward
  Standard-CAT/CAT-hard, not Foundation; better fit for the practising-task
  row than the foundation-task row.
- **2IIM Percentages cluster**: confirmed genuinely free — full question
  text appears inline on the page, no click-through needed. But the visible
  sample questions are algebraic/multi-variable ("P is x% more than Q...")
  — Standard-CAT/CAT-hard register, not Foundation. Reframes this
  candidate: strong for the PRACTISING Percentages task, weaker fit for the
  FOUNDATION task than previously assumed.
- **Bodhee LRDI page** (`/cat-logical-reasoning`): confirmed real counts —
  **6 video-solution sets, 20 "CAT Level [Tough]" sets, 13+ "Basic (Easy
  Level)" sets** (list continued past the fetch cutoff). No login wall
  visible on the index. This upgrades the earlier "near-FAIL" read —
  supply is more concrete than the original "101+" marketing figure
  suggested, and an actual Easy tier exists. Remaining gap: these are
  general LRDI sets (seating + tabular + coding-decoding + Venn + matrix
  mixed together per the page's own syllabus list) — which specific sets
  are Arrangements-type (linear/circular/matrix) rather than other LRDI
  types still needs opening individual set pages. Arrangements verdict
  moves from "near-FAIL" to **"CONDITIONAL, more promising than first
  read"** pending that per-set check.

### Per-set topic-purity check (Firecrawl + Exa, 30 Aug) — the real answer

Firecrawl search surfaced a fourth grouping missed on the first pass: a
**"Topic Wise" list** whose titles carry explicit brackets —
`Set 01 [Circular Arrangement]`, `Set 011 [Tabular Arrangement]`,
`Set 023 [Circular Arrangement]`, `Set 026 [Tabular Arrangement]`,
`Set 030 [Circular Arrangement]` — separate from the 6 Video-Solution / 20
Tough / 13+ Easy sets counted earlier. Opened 5 sets (1 Topic-Wise-tagged,
2 from Tough, 1 untagged-but-adjacent, 1 from Easy) to test whether the
labels are trustworthy:

| Set | Label | Actual content | Genuinely Arrangements? |
|---|---|---|---|
| `lrdi-practice-set-1` | Topic-Wise **[Circular Arrangement]** | 6 people, 6 chairs, circular table, wraparound seating | ✅ yes — moderate difficulty |
| `lrdi-questions-difficult-set-20` | Tough | 4 couples, circular table, seating + colour constraints | ✅ yes — CAT-hard, genuinely complex (matches modern multi-attribute DILR style) |
| `lrdi-questions-difficult-set-13` | Tough | people getting off a bus at sequential stops | 🟡 borderline — an ordering/sequencing puzzle, not a seating arrangement; countable under the broader "ordering/ranking" definition, not a clean seating-arrangement example |
| `lrdi-practice-set-4` | *no bracket tag* (picked because it sat near the Topic-Wise list in search results) | railway-ticket colour/month matrix puzzle | ❌ no — pure attribute-matching logic, not an arrangement at all |
| `lrdi-sets-elementary-1` | Easy | students × compulsory/optional subjects matching | ❌ no — attribute-matching, not an arrangement |

**The curation rule this produces:** a set's presence near the Topic-Wise
list, or its membership in the "Tough"/"Easy" difficulty tiers, does NOT
by itself mean it's an Arrangement. The bracket-tagged Topic-Wise titles
were reliable in this sample (1-for-1); the untagged set picked by
proximity alone was wrong. **Only pull individual sets whose own title
carries an explicit `[Circular/Tabular/Linear Arrangement]` tag, or whose
opened content is verified directly** (as done for the two Tough-tier
picks here) — never infer type from tier membership or list position.

**Updated Arrangements verdict:** genuine, free, no-login CAT-level
Arrangements content is confirmed to exist on this single source — Set 1
(moderate, foundation-appropriate) and Set 20 (CAT-hard, genuinely
multi-constraint, practising-appropriate) are both real, verified
candidates. This is now a firmer **CONDITIONAL** than the earlier
near-FAIL read: Arrangements does not fail on supply once sets are
individually verified — it fails only if curation skips the per-set check
and trusts tier/adjacency labels, which is exactly the failure mode this
pass caught.

The same assignment is being run independently through external research AIs
using `docs/RESOURCE-RESEARCH-MASTER-PROMPT.md`; cross-check their outputs
against this sheet before the founder's hand-vetting round.

---

## Executive summary

| Topic | Best concept candidate | Best practice candidate | Confidence | Main concern |
|---|---|---|---|---|
| Reading Comprehension | Bodhee Prep "How to read CAT RC passages" (article) | Bodhee Prep free RC practice bank ("521+ questions") | Medium | gating on individual passages not verified |
| Percentages | Rodha YouTube percentages lecture (creator-owned) | 2IIM free question bank, percents cluster ("no sign-up" is their own stated policy) | Medium-high | video duration/fit unverified; question count per cluster needs a hand count |
| Arrangements (stress case) | Rodha "Linear and Circular Arrangement-I" (20m11s, verified) | Bodhee `lrdi-practice-set-1` (moderate) + `lrdi-questions-difficult-set-20` (CAT-hard) — both individually opened and confirmed genuine circular-seating content | **Medium — upgraded from initial near-FAIL after per-set verification** | supply exists and is verified, but curation must check each set's own bracket-tag/content, never infer type from tier or list position — see §3 |

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
- **Verified via direct fetch, 30 Aug:** genuinely free, no login wall,
  short strategy article (reading-skill-before-speed approach), real
  reader comments dated as recently as Dec 2024. Concept for RC is approach,
  not theory — an article beats a long video here (student time).
  Verdict: **PASS.**

### Candidate RC-3 — 2IIM Reading Comprehension question bank · PRACTICE
- URL: `https://iim-cat-questions-answers.2iim.com/verbal/reading-comprehension/`
- **Verified via direct fetch, 30 Aug:** full passage text appears inline
  on the page (no click-through needed) — confirmed with "Passage 1: Power
  in language" (a dense, abstract, CAT-appropriate passage on runic
  alphabets — good register match). Page states RC is "absolutely free" as
  a quiz. No login wall observed. This is now the strongest RC PRACTICE
  candidate — same access pattern (2IIM, no-signup) already confirmed for
  Percentages. Verdict: **PASS**, pending only the page-length/passage-count
  scroll-through a human curator does in 30 seconds.

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

## Synthesis protocol — when the multi-AI outputs arrive (founder + Claude, 30 Aug)

The v3 master prompt (`docs/RESOURCE-RESEARCH-MASTER-PROMPT.md`) goes to
5–6 independent AIs, identically. When outputs are in, synthesis runs in
exactly three passes — and the multi-AI rule applies to us too:
**consensus is NOT proof; five AIs repeating one unsupported claim is
still one unsupported claim.**

1. **Candidate intersection.** Which resources surfaced independently in
   multiple outputs? Independent convergence raises priority for
   hand-checking — it never substitutes for it.
2. **Contradiction audit.** Every field where outputs disagree (one says
   "no login", another caught a wall; conflicting counts; conflicting
   durations) becomes a mandatory hand-check item. Contradictions are the
   most valuable rows in the corpus: they mark exactly where AI research
   hit its limits.
3. **Final three.** RC → PRIMARY/BACKUP; Percentages → PRIMARY/BACKUP;
   Arrangements → PRIMARY/BACKUP **or an explicit FAIL** ("external
   linking does not sufficiently solve DILR practice"), which flows
   straight into the Phase-5 own-bank decision. Every final pick still
   passes the 8 gates by hand (sheet above) before touching a student.

Only after the final three (or two + FAIL) exist does the Phase-0 build
start — and that build is the minimum slice locked in
`RESOURCE-LINKING-PLAN-2026-08.md` §Phase 2, nothing more.

## What the card may say (only after the hand-check)
- RC: "Need help? Practice passages here — free external resource." +
  count only if counted.
- Percentages: "Learn here first (~NN min, free) — then solve your
  questions." (NN from measured duration × 1.5)
- Arrangements: whatever survives; if nothing does, the task ships with no
  link and that absence is the Phase-0 result for DILR.
