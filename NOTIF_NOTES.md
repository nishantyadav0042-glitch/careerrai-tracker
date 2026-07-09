# Notification System — Notes & Deferred Work

## Phase 2: Voice Notifications (FLAGGED — DO NOT BUILD YET)

**What it is:** 5–8 second buddy voice check-ins delivered as push notifications.  
Example: *"Oye {name}, aaj ka log nahi aaya — sab theek? Buddy baat karna chahta hai."*

**Why it's the differentiator:**  
- "Someone in your corner" positioning made *audible*  
- No coaching app has this  
- The elder-sibling vibe is 10x stronger with a real voice than text

**What's needed before building:**
1. Buddies must record short clips (3–8 sec each, multiple variants)  
2. Audio storage: Supabase Storage bucket for `.ogg`/`.mp3` files  
3. Push payload must include audio URL; service worker fetches + plays on notification click  
4. iOS limitation: audio autoplay in SW is restricted — may need an in-app inbox player as fallback  
5. Privacy: student must opt-in explicitly ("hear your buddy's voice")

**Suggested trigger events for voice clips:**
- 3+ day miss (compassion ping)
- Pre-mock day (motivation)
- Post-mock debrief reminder
- Streak milestone (celebration)
- Random buddy ping (the weekly "Zinda ho?")

**Build order when ready:**
`buddy_voice_clips` table → upload UI for buddy → SW audio support → opt-in toggle → send pipeline → iOS fallback inbox

---

## Current Notification Architecture — the Notification OS (July 2026)

Core: `src/lib/notification-os.ts`. Signals → Decision → Action → Measurement.

### One student state, never two (`computeStudentState`)
`building_plan → plan_ready → onboarding_arc → active | slipping | inactive | dark`.
The state decides which cron may speak — crons target disjoint states, so
nothing double-fires. Conversion (premium/buddy) is an attribute, not a state.

### One send gate (`dispatch`)
Every student-facing nudge goes through it: global budget of **2/day across
ALL types**, push cooldown (last 3 pushes unclicked + no log since → in-app
only), and every row persists `reason` + `expected_action`.

### Who owns whom
| State | Owner | Ladder |
|-------|-------|--------|
| Builder incomplete | `cron/builder-recovery` (every 30min, 09:30–20:30 IST) | 30min → 24h → 72h → human queue |
| Plan built, never logged | `cron/daily-reminder` (activation branch) | days 0/1/3/7 → human queue |
| Day 1-7 arc (logged ≥1) | `cron/onboarding-morning` + `cron/daily-reminder` | 2 touches/day until 7 logged days |
| Active, graduated | `cron/decision-engine` | revision_due / topic_earned / mission_changed / weekly_evolved, cap 2, silence-capable |
| Quiet (2/4/7/14 days) | `cron/decision-engine` recovery ladder | exact days only, tier 4 (day 14) is terminal |
| Dark 14+ days | humans only — `interventionNeeded()` in lead-intel surfaces them on /admin/leads | — |

### Measurement
- `notifications.pushed_at / clicked_at / emailed_at` + SW click beacon (`/api/push/click`).
- `profiles.push_died_at` — endpoint 410 = likely uninstall (CRM signal).
- Admin dashboard: `/admin/notification-health` — Sent → Pushed → Clicked → **Acted**
  (the only KPI: did the expected action happen). No "delivered/opened" — web
  push has no delivery receipt, and we don't fabricate funnel stages.

### Rules that survived every iteration
- The notification never sells. Buddy = evidence → diagnosis → human call.
- Silence is a valid output; every ladder has a terminal state.
- Copy describes the outcome, is true on tap, and never guilts.
