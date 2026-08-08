# Stage A — Win the First Hour: backward-engineered requirements

**8 Aug 2026. Branch-only. Nothing ships to main without founder approval.**

Method: start from the sentence the student experiences, work backwards to
every condition that must hold for that sentence to be true — data, engine,
failure modes, copy, tests, kill switch. **A visible feature whose hidden
half fails is worse than no feature** (founder). So each item below ships
only when its failure column is built, not just its happy path.

The funnel this stage attacks: 257 signed up → 226 finished onboarding →
**77 ever logged one day.** Success metric for the whole stage: % of new
signups who log on day 2. Secondary: taps to first plan (effort score).

---

## A-1. The two-path question

**The promise:** first screen after signup asks ONE thing:
> "Do you have a coaching timetable?"
> **[ Yes — I'll send a photo ]  [ No — build my plan ]**

**Backwards from the promise:**
- Must appear before hours, before tour, before buddy intro. The current
  first-run rail reorders; nothing is deleted, only moved after the plan.
- "Yes" path → A-2 (photo). "No" path → A-4 (coarse chips) → plan.
- Students who skip entirely still get a plan (defaults exist today) — no
  dead end for the impatient.
- `coaching_enrolled` is already a profile column; this question sets it,
  so the later form must not ask again (never re-ask — cardinal sin).

**Failure modes:** student mis-taps → both paths reachable later from the
plan screen (timetable card already exists); nothing is one-shot.
**Copy check:** every word on this screen passes 0.1-sec.
**Test:** first-run order test; re-ask guard (coaching question appears once).
**Effort:** 1 tap.

## A-2. Photo → plan in under a minute (the wow)

**The promise:**
> "Send a photo of your timetable. 30 seconds."
> …then their actual classes appear, they hit confirm, and their daily plan
> follows their coaching.

**What must hold underneath (mostly already built, listed as load-bearing):**
- Scanner accepts photo/PDF/Excel/CSV (`api/timetable/parse`) — FREE as of
  8 Aug, quota 6/hour, 15/day.
- One save path (`timetable-apply`): persists, aligns topics, rebuilds today.
- Camera capture on the upload sheet (`capture` attr) so "click a photo" is
  literal — verify on Android Chrome PWA AND iOS Safari.

**Failure modes — each needs its own screen, none may dead-end:**
| Failure | What the student sees |
|---|---|
| AI quota / 429 | "Scanner is busy. Try in a minute — or add classes by hand." (hand path always visible) |
| Not a timetable / unreadable | "Couldn't read that. Try a clearer photo, or add by hand." |
| Partial read | Confirm screen already lets them edit before saving — the edit IS the recovery |
| Slow network / upload dies | Progress + retry; never a spinner with no exit |
| Student has no sheet handy | "Do this later" → lands on plan with defaults; timetable card remains |

**The cost question (founder asked — verified 8 Aug):**
- We use Gemini 2.5 Flash-Lite: **$0.10 per 1M input tokens, $0.40 per 1M
  output; images billed at the same input rate** ([pricing refs](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash-lite)).
- A phone photo ≈ 1–2k tokens; our prompt ≈ 1.5k; output ≤ 8k (spreadsheet
  ceiling). Worst case per scan ≈ $0.0035 ≈ **₹0.30. Typical ≈ ₹0.10–0.15.**
  Scorecard parse ≈ ₹0.05–0.10.
- At 1,000 scans/day ≈ $2–3.5/day. Cost is a non-issue; **rate limits are
  the issue** — the 429s we've hit are free-tier limits, not money. Action:
  put billing on the key (paid tier), stay on flash-lite.
- Alternatives checked: Google Vision OCR / AWS Textract ≈ $1.5/1k pages but
  return raw text only — we'd still need an LLM to structure it, so they add
  a step without saving money. Claude Haiku ≈ ~10× flash-lite per scan.
  Flash-lite is the right tool.
- ⚠️ **Landmine found while checking:** Google retires Gemini 2.5
  Flash-Lite on **16 October 2026** — six weeks before CAT. Requirement:
  model id must be config (it already reads from `server_config`), and we
  schedule a successor-model live-fire test in September. This goes on the
  calendar now, not in October.

**Tests:** live-fire harness already exists (real file, real API, key-gated);
add a phone-photo fixture. Guard: the free-access guard test already exists.
**Effort:** 2 taps + confirm.

## A-3. The floor question replaces the hours question

**The promise:**
> "On a bad day, how much can you still do?"
> **[ 15 min ] [ 30 min ] [ 1 hour ] [ 2 hours ]**
> …and the daily plan is BUILT at that size. Finishing it is normal, not a
> miracle. A "Want more?" button adds the next block after.

**The design decision this forces (resolved here, not in code review):**
Two numbers now exist and they mean different things:
- **Floor** (`bad_day_floor_minutes`, new) — sizes the DAILY plan. Small on
  purpose. The day is winnable every day.
- **Target hours** (`study_target_hours`, existing) — feeds pace/finish-date
  math and the Sunday arithmetic. NOT asked at signup anymore. Asked on day
  2–3 ("On a good day, how much do you want to aim for?") once the student
  has felt one winnable day. Until they answer, weekly math uses the floor —
  generous and honest, never a monument.
- **One owner stays one owner:** both numbers are written ONLY through
  `daily-hours.ts` (`setDailyHours` gains a floor writer in the same
  module). The tree-grep guard extends to the floor column.
- Sunday reconcile keeps using target once set (their own goal, their own
  arithmetic — founder's date-not-hours rule unchanged). The daily screen
  never shows the target-vs-floor gap as a deficit.

**Failure modes:** floor unset (old students) → plan falls back to existing
hours behaviour, unchanged. "Want more?" with everything done → next-best
block from the same engine, never an empty state.
**Tests:** plan-at-floor unit tests across all four options; old-student
fallback; the 15%-overshoot fix (A-5) asserted at floor sizes too.
**Effort:** 1 tap at signup.

## A-4. Coarse chips replace the 46-topic tap-through

**The promise (self-study path only):**
> "What have you already covered?" — 8 area chips (Arithmetic, Algebra,
> Geometry, Numbers, Modern Math, Reading, Verbal, DILR) + "Nothing yet."

- Chip → seeds that cluster's topics as 'practicing'; untouched clusters
  stay not_started. The fine 46-topic map stays in the app (Blueprint) for
  later refinement — signup asks 1 question, not 46.
- Never re-asked. Blueprint remains the one place to refine.
**Tests:** chip→coverage seeding mapping; signup completes with zero chips.
**Effort:** 0–8 taps, all optional.

## A-5. The overshoot fix (rides along)

4-task days currently hand out 115% of chosen time. Fix: the closing task's
minutes come out of the three topic tasks. Already specified in the audit;
one function, one test. Ships inside this stage because floor-sized days
make a 15% overrun proportionally worse.

## A-6. Tour and buddy intro move after the plan

First-run order becomes: two-path question → (photo | chips) → floor →
**plan on screen** → notifications ask → tour → buddy intro. The plan is
the first thing they SEE, everything else follows it.
**Test:** journey order test updated; notification ask never before value.

## A-7. Words sweep (day-1 surfaces only, this stage)

Every string on: two-path screen, upload sheet, confirm screen, floor
question, first plan card, first log modal — against the words table
("Streak save", "Today's one thing", no product language). Full-app sweep
is Stage B+; day-1 surfaces cannot wait.
**Test:** none automatable for tone — founder reads the six screens before
merge. That read IS the acceptance test.

## A-8. Daily tip (founder decision, 8 Aug — recorded)

Keep the tip AND the voting. **No cap, no bar: most votes tops the slot for
exactly one day; zero votes → queue rotates automatically.** This is exactly
the engine already live (built 8 Aug — the no-bar Top Pick). Change in this
stage is presentation only: the tip reads as one 5-second line, votes framed
as "Did this help?" — a testimonial, not a contest. No new engine work.

---

## Kill switches & rollout

- Each A-item lands behind its own boolean in `server_config` (existing
  pattern) — a broken first-run can be reverted to the old order in one
  update without a deploy.
- Rollout: branch → founder tests from the Team CareerRai account → main.
- **Blast-radius rule:** nothing in Stage A touches the plan engine's
  topic choice, the streak math, or payments. Migration for
  `bad_day_floor_minutes` is written to `supabase/migrations/` on the
  branch and applied to the live DB only at ship time (a nullable column,
  zero effect until code reads it).

## Definition of done (whole stage)

1. A new signup reaches a real plan in ≤ 5 taps (photo path) or ≤ 12
   (self-study path) — counted, not estimated.
2. Every failure row above has its screen. No dead ends, no silent spinners.
3. All existing 590+ tests green + new tests above.
4. Founder has walked both paths from a fresh account and read the six
   day-1 screens aloud.
5. Day-2 log rate of post-launch signups visibly measured on the dashboard
   (the number this stage exists to move).
