# Daily Challenge + Students-Helping-Students — design

*25 Jul 2026 · status: awaiting founder decisions (end of doc) · reversibility:
Type 2 for the daily loop (a card + two tables), Type 1 for community content
norms (published student content and credit, hard to walk back — so the
verification rule is decided BEFORE launch, not after).*

---

## 1. What the market actually does (researched, not remembered)

| Player | Their daily mechanic | Their strength (we adopt) | Their pain (our USP) |
|---|---|---|---|
| **iQuanta** | 10+ QA daily, RC/LRDI sets, 4.1-lakh community, "doubt solved in 10 min" | Scale of community, habit of a daily drop, doubt-solving speed | Same questions for everyone regardless of where you are; answers buried in chat scroll; solving a question changes **nothing** in your prep record |
| **Cracku** | "Daily Target": 5 QA + 1 DILR set + 1 RC every weekday, video solutions | Fixed, predictable structure; working-professional friendly | Generic — no connection to *your* topic state; your result is a score, not evidence; engagement is for their funnel, not your plan |
| **Rodha** | Free YouTube syllabus + Telegram drops | Trust, warmth, genuinely free, "for students" identity | Passive — watching isn't practising; no tracking at all; no feedback loop |
| **Telegram/Reddit peer groups** | 24/7 peer advice and questions | Belonging, instant help, peer energy | Documented failure mode: conflicting unverified advice ("skip arithmetic", "mocks are useless") leaving aspirants *more* confused; noise kills signal |

**The one-line gap:** every platform's daily question is **content**. Nobody's
daily question is **measurement**. And every platform's community is either
big-but-noisy (Telegram) or curated-but-cold (coaching content). Nobody has
*verified* peer knowledge attached to a personal tracking system.

We are positioned to own both gaps at once, because we already built the thing
they all lack: the evidence system.

## 2. The principle (why this is not a copy)

> Their daily question asks "can you solve this?" and forgets your answer.
> Ours asks the same question — and your answer becomes a permanent piece of
> your preparation evidence, moves your topic's rungs, and updates what the
> app tells you to do next.

And for community:

> Telegram's tip is anonymous noise. Ours is a named student's tip, verified
> before it reaches anyone, attached to the exact topic where the next student
> will need it. For the students, by the students — with a truth filter.

## 3. The daily loop — "Today's Challenge"

One question per section per day (QA + DILR to start; VARC when the bank
supports it). Same questions for every student — that's what makes them
**talkable** (community needs a shared object; a personalized question has
nobody to discuss it with).

**The flow, student's eye view:**
1. Card on Home: *"Today's DILR Challenge — 2,140 attempts"* (count shown only
   past 20 attempts; below that it shows nothing, per the no-invented-numbers
   rule).
2. Tap → question, options, a timer running quietly (no pressure UI).
3. Answer → instant verdict + the community split ("41% got this right") +
   the best explanation.
4. **The integration beat — what nobody else has:** *"This was Arrangements —
   a topic you're revising. Counts toward your evidence."* One
   `topic_evidence` row (source `daily`, difficulty as tagged, attempted 1,
   correct 0/1) written automatically. Your rungs, your Evidence %, your
   next-action ranking all see it.
5. If the question came from a student: *"Shared by Ronit · CAT '26"* on the
   card. Credit is the reward.

**Deliberate exclusions:**
- Does NOT close your study day or feed the streak. One 2-minute question is
  not a studied day, and we have exactly one streak by hard-won rule
  (Incident #4/#6 class). It feeds evidence only.
- No public accuracy leaderboard. Ranking students by daily-question accuracy
  is Goodhart bait (people stop attempting hard questions to protect a rank)
  and public-shame risk. The community split % gives the social comparison
  without naming anyone.
- No XP, coins, gems. The reward is the evidence being real.

**Timing:** drop at a fixed hour daily. Our own histogram: opens peak 22:00,
build from 18:00. An 8pm drop rides the evening ramp and gives the night-peak
crowd a fresh question at their best hour. (Notification at drop time is the
obvious amplifier — **deferred**: notifications are under a standing
don't-touch instruction until the founder clears it.)

## 4. The peer layer — "By students, for students", with a truth filter

Two contribution types, one pipeline:

**A. Tricky question worth sharing.** "This question taught me something —
others should try it." Student submits (question, options, answer,
explanation, topic tag). Verified → enters the daily-challenge bank with their
name on it. The daily drop becomes progressively student-made — Rodha's
warmth with iQuanta's scale mechanics, minus the noise.

**B. A tip that actually helped.** Topic-tagged, short. Verified → published
where it's USEFUL, not in a feed: on that topic's plan page, and to the
community. A student opening Percentages sees two verified tips from students
who cleared Percentages. Context is the distribution — no doomscroll surface
is built, ever.

**Verification is the product.** The researched failure of Telegram groups is
precisely unverified advice at scale. So: nothing reaches another student
until a human approves it. AI may format, dedupe, and flag obvious problems
(governing rule in `gemini.ts`: summarize/organize only — it never judges
whether a shortcut is mathematically sound). Approval sits in the admin panel;
founder is the approver until volume demands delegating to proven buddies.

**The recognition ladder (feeds the business):** contributor credit on every
surfaced item → a "Helper" marker on their profile → top contributors get
invited to the buddy program. This makes the community a **recruiting funnel
for the paid buddy system** instead of a cost center, and the invitation is
earned with visible evidence of helpfulness — the same philosophy as
everything else in the product.

## 5. Integration map (the actual ask)

| Existing system | How the challenge plugs in |
|---|---|
| `topic_evidence` / rungs | Every answer = one evidence row (`source: 'daily'` — needs the check constraint extended). Timed-tagged questions feed the Tested rung. |
| Coverage matrix / plan | Question is tagged with a **canonical** topic (topics-constants only — no new taxonomy, per Playbook SSOT gate). The verdict line tells the student where this topic sits in *their* plan. |
| Next-action engine | Evidence written here re-ranks tomorrow's suggestions like any other evidence. |
| Behavioral dataset (ADR-005) | This is the quiet strategic win: thousands of timestamped, difficulty-tagged accuracy points per week across all students — the dataset that eventually replaces estimated hours. iQuanta generates this data and lets it evaporate in chat. |
| Day-slot rotation | Challenge card slots into the existing Home rotation (action-adjacent in morning/midday; after the log at night). |
| Buddy system | Per-question discussion thread is buddy-visible; contributions feed buddy recruitment. |
| Streak | Explicitly NOT connected (see exclusions). |

## 6. Cold start (the honest founder section)

Community mechanics die under ~50 engaged users, and our DAU is small. So v1
is sequenced to work at our size:

1. **Weeks 1–2:** bank seeded with original questions (written/approved by
   founder — no scraped copyrighted content; PYQ paraphrases only if founder
   confirms sourcing). Daily drop runs without any community features. Success
   = participation rate alone.
2. **Weeks 2–4:** submission form opens ("share a question / share a tip").
   Every published item is hand-verified. Even 2–3 verified items a week is
   enough — scarcity reads as quality at this stage.
3. **Later:** discussion threads, only when daily attempts consistently clear
   ~50 (below that, empty threads advertise emptiness).

## 7. Success metrics (decided before launch, per playbook)

- **Primary:** daily challenge participation rate (attempts ÷ DAU) and the
  D7 retention of participants vs non-participants.
- **Evidence growth:** `topic_evidence` rows/day (baseline today: ~0 outside
  seeding). This metric doubles as the ADR-005 dataset counter.
- **Community:** submissions/week, verified-and-published count, and
  contributor repeat rate.
- **Guardrail:** daily-log completion rate must not drop (the challenge must
  add engagement, not cannibalize the log).

## 8. Schema sketch (v1)

- `daily_challenges` — id, live_date, section, topic (canonical), question,
  options jsonb, correct_index, difficulty (easy/medium/hard/timed),
  explanation, source ('careerrai' | 'student'), contributor_id nullable,
  status (draft/approved/live/retired).
- `challenge_attempts` — student_id, challenge_id, choice, is_correct,
  seconds_taken, created_at; unique (student, challenge). Insert also writes
  the `topic_evidence` row in the same route (one writer, per SSOT rules).
- `student_submissions` — id, student_id, kind ('question' | 'tip'), topic,
  body jsonb, status (pending/approved/rejected), reviewed_by, reviewed_at,
  published_at. Tips surface via topic pages; questions graduate into
  `daily_challenges` with contributor_id set.
