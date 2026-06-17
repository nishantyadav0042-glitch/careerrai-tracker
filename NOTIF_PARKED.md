# Notifications — Parked (post-validation, build after 20 students × 60 days)

## Why this is parked
These were all designed before observing real student behavior. Build them only once
usage data tells you which levers actually move retention. Building them now = month-12
features for month-0 users.

## Parked features

### 6-bucket emotional engine
Full message bank: Tease / Dream / BuddySupport / Streak / Emotional / Achievement buckets,
8+ messages each, weighted context selection, no-repeat logic.
Build when: you can A/B test which tone retains vs. mutes students.

### Student Pulse (🟢🟡🔴)
Real-time engagement state per student visible to buddy. Based on log frequency + sentiment.
Build when: buddies have enough students that they need triage.

### Mock collapse detection
3 consecutive mock score drops → specific intervention nudge to buddy.
Build when: you have enough mocks to compute the signal reliably.

### Silent top-performer recognition
Student in top 10% of cohort, no recent contact from buddy → "don't lose this one" nudge.
Build when: cohort size makes this meaningful.

### Multi-level escalation
Level 1 (buddy silent 24h) → buddy ping. Level 2 (48h) → Nishant. Level 3 (72h) → parent.
v1 ships only level 2 (48h → admin). Expand when you have SLA data.

### Weekly Buddy Report (Wrapped-style)
Every Monday: buddy gets a 5-metric digest for each student — streak, study hours, mocks, mood, delta.
Build when: buddies have 3+ students and need a weekly briefing format.

### Tone evolution system
No-log messages evolve over time: week 1 funny → week 3 supportive → week 6 achievement → personalized.
v1 just rotates 5 lines. Build the progression system after observing which lines get tapped.

### Voice notifications (Phase 2)
5–8 sec buddy voice check-ins ("Oye {name}, aaj ka log nahi aaya, sab theek?").
Needs: buddy recordings, Supabase Storage bucket, SW audio, opt-in toggle, iOS fallback.
The single highest-impact future upgrade. Build once buddies exist and have recorded.

---

## v1 — what shipped (the 8 notifications)
| # | Event | Who | Channel |
|---|-------|-----|---------|
| 1 | Buddy feedback submitted | Student | in-app + push |
| 2 | Voice note received | Student | in-app (push via voice-notes/send) |
| 3 | Session tomorrow | Student | in-app + push |
| 4 | No log today (~8 PM IST) | Student | in-app + push |
| 5 | Student sent chat | Buddy | in-app + push |
| 6 | Student submitted mock | Buddy | in-app + push |
| 7 | Student inactive 4 days | Buddy (via check-red-flags) | in-app |
| 8 | Score improved | Buddy (via check-red-flags) | in-app |
| + | 48h unanswered escalation | Admin (Nishant) | in-app + push |
| + | Weekly founder check-in | All students | in-app + push |
