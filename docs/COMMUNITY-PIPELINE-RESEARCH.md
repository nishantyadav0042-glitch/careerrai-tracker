# The contribution pipeline — research memo (nothing built)

*25 Jul 2026 · founder asked for research + a take on the six-filter
"submissions as pull requests" vision. This is the take. No code.*

---

## 1. The verdict on the vision

The core idea — **moderate impact, not content; trust the process, not the
person** — is correct, and the research below validates almost every filter.
Three pushbacks, each on timing or on a hidden trap, not on direction.

**Pushback 1 — it's a 50,000-student architecture and we have 244.**
The six-filter pipeline solves a volume problem we won't have for 12+ months.
Building it now is premature scaling. BUT the founder-as-moderator phase is
not waste — it is **labeling**. Every manual approve/reject today, if we store
*why*, becomes training data for the automated triage later. GitHub's real
lesson is not the trust algorithm; it's that they made the contribution a
**reviewable object** (the pull request) years before any automation existed.
We shipped the object model this week (4 kinds, topic-tagged, statused).
That's the part that had to be right early, and it is.

**Pushback 2 — Filter 6 (behavioral validation) needs traffic we don't have.**
"Inject to 500 students, compare accuracy before/after" needs hundreds of
attempts per topic per variant. At our DAU that's noise for a year. Sequence:
Filter 4 (four-button helpfulness) works at ANY scale and is the small-scale
proxy; Filter 6 switches on when a topic clears ~200 attempts/week. Design the
attempt schema so before/after is computable later (we already log per-answer
accuracy + timestamps in topic_evidence — the data accrues from day 1).

**Pushback 3 — "AI scores educational value" must stay triage, never gate.**
Our AI constitution (gemini.ts): summarize/organize/extract, never judge
pedagogy. The reconciliation: AI may *order the review queue* (score 1–10 to
decide what a human sees first) but may never publish. The rule that keeps
both: **AI ranks, humans gate, behavior decides.** At scale the human gate
narrows to the top slice (his Filter 5) — but it never disappears for
math correctness, because a wrong shortcut taught confidently is the single
worst thing this product could distribute.

## 2. What the research actually says

**PeerWise (the academic gold standard for student-authored questions).**
Studied across hundreds of courses. Findings: students ARE capable of
generating high-quality questions with good concept coverage; aggregate
student ratings track quality well; and — the killer fact — **question
WRITING frequency has the strongest correlation with the author's own exam
performance**, because authoring a good question forces deeper processing
than answering one. Implication: contribution is not altruism to be rewarded
— *contribution is study*. Pitch it that way: "Writing one question on
Percentages IS revising Percentages." That solves cold-start motivation
without points, badges, or social credit.

**Duolingo's volunteer program (the warning).** Killed in 2021 after 7 years,
whole community-built courses replaced by paid staff — because (a) once the
company monetized, profiting from volunteer labor became untenable, and (b)
whole-course contributions couldn't be standardized. Implications for us:
keep contributions **granular** (one tip, one question — never "a course"),
and decide NOW what contributors get when money flows through their content.
My proposal: contribution earns product value (buddy-program invitation, the
one thing we sell), never cash-per-item — cash-per-item creates the Chegg
economy below.

**Stack Overflow (the scaling mechanism AND its poison).** Moderation scales
by reputation-gated privileges: 15 rep to flag, 500 to review, 3k to close —
the crowd moderates, elected humans handle the top of the funnel. It works;
it's the closest real implementation of the six filters. But: reputation
gaming is an entire research literature (60–80% of algorithm-flagged gamers
were real), and public reputation made SO famously hostile to newcomers.
Implication: gate *privileges*, never display *points*. And we have something
SO never had: our trust score doesn't need inventing — **a student's evidence
IS their reputation.** Someone with earned rungs on Percentages gets
fast-track review rights on Percentages contributions. One trust system, not
two. No number to game, because gaming it requires… solving questions
correctly, which is the product working.

**ITS hint research (validates the hint ladder, warns about the abuse).**
Progressive hints (direction → concept → first step → solution) are standard
in intelligent tutoring systems and well-supported. But "gaming the system"
is equally well-documented: students click through hints in seconds to reach
the bottom-out answer, and rapid unproductive hint use is consistently
negatively associated with learning. Implications: (a) build the ladder,
(b) rate-limit the descent (a minimum think-time between levels), (c) log
hint-level-reached as an evidence signal — needing hint 3 on Arrangements is
diagnostic data about the STUDENT as well as feedback on the hint. The
founder's "hints optimize themselves" idea is real and this is the telemetry
that powers it.

**Quizlet vs AnKing (volume vs curation).** Quizlet: more flashcards.
AnKing (medical students' community-refined Anki deck): more GOOD flashcards,
refined for years by people who took the exam — and it beats random sets
every time. Implication: our verified, behavior-measured contribution bank is
the AnKing model productized. Scarcity + verification reads as quality;
never chase submission volume as a KPI.

**Brainly/Chegg (the anti-pattern).** Community answers on demand became a
cheating economy — the majority of audited exam questions answered inside
90 minutes. Their core model (fast answers from strangers) is their core
weakness. Implication: CareerRai must never build "post your doubt, get the
answer." Doubts are valuable as *signal* (what confuses students → what the
curriculum lacks), not as an answer marketplace. If we ever do doubts, the
product is the resolved doubt becoming a verified FAQ on the topic — the
answer arrives as curriculum, not as a favor.

## 3. Ideas this research generates (beyond the six filters)

1. **Contribution-as-revision** (from PeerWise): after a student clears a
   topic's rungs, prompt: "You've earned this topic. Write one question that
   would have tested you — it counts as revision." Generation effect does the
   motivating; the bank grows as a side effect of studying.
2. **Evidence-gated review rights** (from SO, minus the poison): pending
   submissions on topic X are shown, one at a time, to students currently
   STUDYING topic X with earned evidence on it — four buttons (Very helpful /
   Helpful / Didn't help / Wrong). Reviewing a tip on the topic you're
   revising IS a 30-second revision act. Community evidence with zero
   moderation UI, zero feed.
3. **The doubt-to-FAQ pipeline** (from Brainly, inverted): doubts asked in
   buddy chat get topic-tagged; resolved ones become candidate FAQ entries
   for verification. Highest-volume raw material, converted to curriculum
   instead of a cheating surface.
4. **Hint telemetry feeds the student model** (from ITS research): the hint
   level a student needs is written into their evidence trail. One
   instrument, two outputs: better hints for everyone, better diagnosis of
   this student.
5. **"I wish someone told me this"** (founder's idea, sharpened by PeerWise):
   ask at the moment a topic's rungs are completed — the one moment the
   student provably knows the topic AND remembers being confused. Optional,
   120 chars. AI clusters, humans verify, top three become part of the topic.
6. **Learning ROI display, honest version**: at our scale, show contributors
   real counts ("shown to 34 students · 12 said it helped") — never
   percentages until the base clears the no-invented-numbers bar (≥20).

## 4. Sequencing by scale (the phase gates)

| Scale | What runs | What's the gate |
|---|---|---|
| **Now (≤1k students)** | Founder verifies everything; AI formats/dedupes only. Contribution-as-revision prompt. Every approve/reject stored with a reason (the future training set). | Already shipped: 4-kind object model. |
| **~5k students / review queue >30 min-day** | Four-button community evidence (idea #2); AI value-scoring ORDERS the queue; evidence-gated fast-track reviewers; hint ladder on challenge questions. | Queue time, not calendar, triggers this. |
| **~50k students / >200 attempts-week-topic** | Behavioral validation (Filter 6): auto-retire content that doesn't move accuracy; mentors see only top 5%; hints self-optimize from descent telemetry. | Attempt volume per topic makes deltas statistically real. |

## 5. Never build (each has a research corpse behind it)

- Public reputation points (SO's newcomer hostility + gaming literature)
- Answer-on-demand doubt marketplace (Chegg/Brainly cheating economy)
- Whole-course or bulk contributions (Duolingo's unwindable volunteer debt)
- Cash per contribution (converts helpers into a content farm)
- Submission-volume KPIs (Quizlet: volume ≠ value)
- Instant full solutions anywhere (bottom-out hint abuse research)
