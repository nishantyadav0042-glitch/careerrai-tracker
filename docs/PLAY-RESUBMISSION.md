# Play resubmission — Metadata rejection, 5 Aug 2026

**What happened:** Play rejected the listing (NOT the app) under the Metadata
policy — "Unclear Visuals" — naming exactly three screenshots. Those three are
`public/screenshots/{welcome,onboarding,diagnostic}.png`, the PWA-manifest
images. `PLAY-STORE-UPLOAD-GUIDE.md` §5 warned, before upload, not to use them
("Two of those three are pre-login screens. Lead with the app **in use**") —
the warning was written and then not followed. See ENGINEERING-MEMORY #19.

**Why each failed, in Google's terms:**

| File | What Google saw |
|---|---|
| `onboarding.png` (question screen) | ~60% blank white page, one question, two buttons — "blank/generic", shows no functionality |
| `welcome.png` (finish-date mockup) | Marketing frame with a phone-inside-a-phone mockup — promo art, not the app in use |
| `diagnostic.png` (free-session card) | Pure lead-gen ad: "100% FREE… Claim my free session". Zero app UI |

**The app binary, product, login flow and review account were not flagged.**
This is a listing fix, then resubmit.

---

## Step 1 — Capture 6 replacement screenshots (10 minutes, on a phone)

Log in at careerrai.in **inside the installed app** as the review account
(`appreview@careerrai.in`, password from Play Console). The account is
evergreen as of 4 Aug — 23-day streak, logged yesterday, full topic map,
buddy chat, mock debriefs — so every screen below looks alive.

Take a normal phone screenshot of each (power+volume). NO editing, NO frames,
NO added text, NO cropping beyond the status bar if you prefer.

1. **Home / tracker** — today's plan blocks + streak counter + shields visible.
2. **"Update topics studied today" sheet** — the daily log, mid-use.
3. **Topic map / Analysis matrix** — the 53-topic coverage grid with statuses.
4. **My CAT Plan / pace screen** — finish date, required hours, progress ring.
5. **Buddy tab** — the mentor card + chat thread (seeded, 6 messages).
6. **Daily Pick** — the day's question/tip with votes.

Rules that keep this compliant (from the rejection email):
- Every image is the real app **in use** — no promo cards, no mockups.
- No testimonials, ratings, "#1", student counts, or price claims in imagery.
- Portrait, straight off the phone (1080×2340-ish is perfect; min 320px, 16:9–9:16).
- 2–8 images allowed; upload all 6, home screen first.

## Step 2 — Listing text (paste-ready, audited against the policy email)

**Short description (80 chars, unchanged — it was not flagged):**
`Daily CAT study plan that adapts to you, with a real IIM mentor.`

**Full description — use this or trim it; contains no testimonials, no other
brands/apps, no PWA/browser mentions, no unverifiable claims:**

> CareerRai builds your CAT study plan around you — your target percentile,
> your hours, your weak sections — and then runs it with you every day.
>
> WHAT THE APP DOES
> • Daily study plan: three focused blocks each day, rebuilt as you progress
> • 30-second daily log: record what you studied; your plan adapts to it
> • Syllabus tracker: all CAT topics with your live status on each
> • Streaks & Momentum Shields: consistency protection that survives a missed day
> • Mock tracking: log scores and review them with your mentor
> • Daily Pick: one community question and tip every day, chosen by votes
> • 1:1 mentorship: chat and video sessions with a mentor who has cracked CAT
>
> HOW IT WORKS
> Answer a few questions about your target and your available hours. The app
> maps your syllabus coverage, builds a plan to your own finish date, and
> adjusts daily from what you log. Your mentor sees your real preparation data
> and guides you from it.
>
> Free to start. Mentorship is an optional paid upgrade inside the app.

## Step 3 — Resubmit

1. Play Console → **Grow → Store presence → Main store listing**.
2. Replace ALL phone screenshots with the 6 new captures; save.
3. Paste the full description above; save.
4. Feature graphic stays (`docs/store/feature-graphic-light-1024x500.png` — it
   makes no claims and was not flagged).
5. **Publishing overview → Send for review.** (The email's own instruction:
   "If you've fixed this issue, send changes to your app for review on the
   Publishing overview page.")
6. Do NOT appeal — appeal is for decisions you think are wrong; this one is
   fixable and appeals take up to 7 days.

## Freeze status while this is pending

Between rejection and resubmission there is **no review in flight** — the
mid-review deploy hazard is suspended. The moment Step 3 is done, the
STORE-FREEZE discipline resumes in full (tiered per the 5 Aug framework:
sw.js hard-frozen, reviewer-path changes gated on the route-table test).
