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

## Current Notification Architecture

### Channels
- **In-app bell**: Always fires. Reads from `notifications` table.
- **Push (web-push/VAPID)**: Fires when `notif_prefs.push = true` and `push_subscription` set.
- **Email (Resend)**: Fires when `notif_prefs.email !== false`.

### Cron Schedule (all UTC)
| Cron | UTC | IST | Purpose |
|------|-----|-----|---------|
| daily-reminder | 14:30 | 20:00 | 6-bucket emotional engine for students who haven't logged |
| buddy-ping | 11:30 | 17:00 | Random elder-sibling ping (7–10 day gap, 30% of eligible) |
| weekly-digest | Mon 04:00 | Mon 09:30 | Buddy performance summary |
| check-red-flags | 15:00 | 20:30 | Alert buddy when student has red flags |
| expire-subscriptions | 03:00 | 08:30 | Flip paused memberships |
| renewal-reminders | 04:00 | 09:30 | Nudge 7/3/1 days before expiry |

### Daily Cap
Hard cap: 2 notifications/day per student (enforced in `pickNotification()` via DB query).  
Achievement bucket fires only on real data wins — not in the daily reminder flow.

### Message Bank
See `src/lib/notification-engine.ts` — 6 buckets × 8+ messages each.  
**Add your own Hinglish lines to each bucket before launch.** The message bank is a brand asset.  
Especially the `emotional` and `buddy_ping` banks — those are the retention drivers.
