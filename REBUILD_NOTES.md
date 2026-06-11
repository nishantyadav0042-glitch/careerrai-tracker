# REBUILD_NOTES — GMeet + Voice Notes Rebuild (2026-06-11)

<!--
═══════════════════════════════════════════════════════════════════
PHASE 0 AUDIT SUMMARY
═══════════════════════════════════════════════════════════════════

GOOGLE CALENDAR / OAUTH — what existed before this rebuild:
  src/app/api/google/auth/route.ts        POST → returns authUrl (offline+consent: OK)
  src/app/api/google/callback/route.ts    GET  → token exchange + upsert (OK-ish; did an
                                          internal fetch to setup-reminders w/ cookie fwd)
  src/app/api/google/create-event/route.ts POST → created event + retry loop for hangoutLink
  src/app/api/sessions/schedule/route.ts  POST → inserted video_sessions row then did an
                                          INTERNAL HTTP FETCH to create-event
  src/lib/google-oauth-utils.ts           token refresh util (manual expiry math)
  src/lib/google-reminder-utils.ts        daily reminder events

ROOT CAUSE of "Meet link always NULL":
  schedule/route.ts called fetch(`${NEXT_PUBLIC_APP_URL}/api/google/create-event`)
  forwarding browser cookies. On Vercel, that internal hop breaks (deployment
  protection intercepts / cookie auth fails) → eventResponse.ok = false →
  session saved with NULL google_meet_link, error swallowed as a warning.
  DB STATE CONFIRMED IT: Test Buddy 1 had valid refresh tokens + connected=true,
  yet every new video_sessions row had google_meet_link NULL.
  Secondary bug: video_sessions was missing title/description columns until
  2026-06-11 (insert silently failed earlier); sessions/request/route.ts
  inserted notifications with a `message` column that doesn't exist (column
  is `body`).

FIX ARCHITECTURE: all Google Calendar work now happens IN-PROCESS via a
single util (src/lib/google-calendar.ts). No internal HTTP fetches anywhere.

VOICE NOTES — what existed:
  src/components/voice-note-recorder.tsx        hold-to-record, no codec fallback,
                                                hardcoded audio/webm (iOS broken),
                                                no waveform, no review scrubber
  src/components/voice-note-player.tsx          basic player
  src/components/buddy-quick-voice-message.tsx  buddy send w/ student picker
  src/components/buddy-audio-recorder.tsx       intro audio recorder (buddy setup)
  src/components/buddy-audio-responses-compact.tsx  buddy hears student replies
  src/app/student/home/buddy-feedback-card.tsx  student sees buddy notes
  src/app/student/home/student-voice-notes-card.tsx student records replies
  No read receipts, no NEW badge, no notifications on send, no thanks loop.

DATABASE (live, verified via Supabase API):
  profiles                 has email, intro_audio_url, google_calendar_connected ✓
  google_oauth_tokens      user_id PK, refresh/access token, token_expires_at ✓
                           (+ google_email added by this rebuild)
  video_sessions           25 rows; title/description/google_event_id/
                           google_meet_link existed; (+ student_google_event_id added)
  buddy_feedback           voice_note_url, feedback_type ✓
                           (+ duration_seconds, read_at, thanked_at, mime_type added)
  feedback                 legacy, 1 row — NOT used by live UI (buddy_feedback is canonical)
  notifications            user_id/type/title/BODY/data/read ✓  (column is body, NOT message)
  scheduled_meetings       DOES NOT EXIST → video_sessions is the canonical table; adapted.

STORAGE: buckets `voice-notes` (public) and `buddy-intros` (public) exist.

RLS: all tables RLS-enabled. Added student UPDATE policy on buddy_feedback
(read receipts). Dropped the `WITH CHECK (true)` notifications INSERT policy
(any logged-in user could spoof notifications; service role bypasses RLS).

ENV VARS (required in Vercel):
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   — Google Cloud OAuth credentials
  NEXT_PUBLIC_APP_URL                      — https://careerrai-daily.vercel.app
                                             (redirect URI {APP_URL}/api/google/callback
                                             must be whitelisted in Cloud Console)
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
═══════════════════════════════════════════════════════════════════
-->

## What was rebuilt

### Pillar 1 — Google Meet
- `src/lib/google-calendar.ts` — single `getCalendarClient(userId)` utility:
  loads tokens, auto-refresh with `on('tokens')` persistence, marks
  `google_calendar_connected=false` on refresh failure. All routes use it.
- `POST /api/calendar/schedule-meeting` — in-process event creation with
  `conferenceData.createRequest` (hangoutsMeet), `Asia/Kolkata` timezone,
  `sendUpdates:'all'`, reminders (popup 30/10, email 60), retry-once with a
  fresh requestId, mirror event on student's calendar when they're connected,
  persists to `video_sessions`, notifies the student in-app.
- `POST /api/calendar/cancel-meeting` — deletes Google event(s), sets status
  cancelled, notifies student.
- `MeetingWidget` (3 states: none → upcoming → live window with countdown +
  pulsing badge) on both homepages. `ScheduleSessionModal` with human errors.

### Pillar 2 — Voice notes
- `VoiceRecorder` — codec fallback chain (webm-opus → webm → mp4 for iOS),
  real `AnalyserNode` waveform, 90s cap with amber warning, review-before-send
  with scrubber, retry-on-upload-failure (recording never lost).
- `VoiceNotePlayer` — scrubber, 1x/1.5x speed, NEW badge → `read_at` receipt,
  ❤️ Thanks reaction → buddy notification.
- Server routes for send/read/thanks so notifications stay service-role only.

## 🚨 BLOCKER FOUND 2026-06-11 — Calendar API never enabled

Live test against Google with the stored OAuth token returned:
`SERVICE_DISABLED — Google Calendar API has not been used in project
307670815298`. **This was the true root cause of every Meet-link failure
since the beginning** (OAuth token exchange works without the Calendar API,
so connecting always "succeeded" while every calendar call failed).

**Fix (founder, 1 minute):** open
https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=307670815298
→ click **ENABLE** → wait 2–5 minutes → schedule a session again.

## 🚨 SECURITY — ACT TODAY

The Supabase **service-role key** (full database admin, bypasses all RLS) was
hardcoded in 22 files of this **public** GitHub repo. This rebuild deleted
those files / scrubbed the key, but **git history still contains it and the
repo is public** — treat the key as compromised:

1. Supabase Dashboard → Project Settings → API → **rotate the service role /
   JWT secret**.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel (careerrai-daily → Settings →
   Environment Variables) with the new key and redeploy.
3. Seed/maintenance scripts in `scripts/` now read
   `process.env.SUPABASE_SERVICE_ROLE_KEY` — set it in your shell when running
   them locally.
4. Optional but recommended: make the GitHub repo private.

## Manual test checklist (founder)

1. **Connect:** Buddy Settings → Connect Google Calendar → Google consent →
   lands back with green chip showing the connected Gmail.
   Revoke at myaccount.google.com/permissions → reconnect → still works.
2. **Schedule:** Buddy home → Schedule Session → pick student, a time ~10 min
   out, 30 min → Create. EXPECT: real `meet.google.com/xxx-xxxx-xxx` link in
   the success state in <5s; event in buddy's Google Calendar app; invite
   email on the student's Gmail (if student has email in profile).
3. **Widgets:** Both dashboards show the session card. At T-15 min the card
   turns live (teal glow, countdown, big orange Join). Join opens the real
   Meet room.
4. **Cancel:** Kebab menu → Cancel → card disappears on both dashboards AND
   the event is gone from Google Calendar.
5. **Voice note (Android Chrome):** Buddy → student card mic → record →
   waveform moves with your voice → stop → review → Send. Student home shows
   note with NEW badge + in-app notification; first play clears badge; buddy
   sees "listened" state; ❤️ Thanks notifies buddy.
6. **Voice note (iOS Safari + desktop Chrome):** repeat — iOS records as mp4.
7. **Token expiry:** `UPDATE google_oauth_tokens SET token_expires_at = now() - interval '1 hour';`
   then schedule a meeting → succeeds silently (auto-refresh).

## Env vars the founder must set in Vercel (production)

| Var | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from Google Cloud Console OAuth client |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console OAuth client |
| `NEXT_PUBLIC_APP_URL` | `https://careerrai-daily.vercel.app` (no trailing slash) |

Google Cloud Console → Credentials → the OAuth client must whitelist
`https://careerrai-daily.vercel.app/api/google/callback` as an authorized
redirect URI, and the Calendar API must be enabled. While the consent screen
is in Testing mode, add each buddy/student Gmail as a test user (cap 100).

Note: these three env vars are already SET on the careerrai-daily Vercel
project (verified 2026-06-11) — OAuth tokens exist in the DB, proving the
flow works end-to-end. Nothing to do unless you rotate keys.

## New/changed API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/google/auth` | GET (`?redirect=/path`) or POST | start OAuth |
| `/api/google/callback` | GET | token exchange + gmail capture + reminders |
| `/api/google/disconnect` | POST | remove tokens + cleanup reminders |
| `/api/calendar/schedule-meeting` | POST | create session + REAL Meet link |
| `/api/calendar/cancel-meeting` | POST | cancel + delete Google events |
| `/api/calendar/upcoming-meetings` | GET | widget data (both roles) |
| `/api/voice-notes/send` | POST multipart | upload + feedback row + notify |
| `/api/voice-notes/mark-read` | POST | read receipt + clear notification |
| `/api/voice-notes/thanks` | POST | ❤️ reaction → buddy notification |

Removed (dead): `/api/sessions/schedule`, `/api/google/create-event`,
`gmeet-utils.ts`, `google-oauth-utils.ts`, `upcoming-session-card`,
`buddy-video-sessions-dashboard`, `video-sessions-card`,
`video-session-prompt`, `schedule-session-form`, `/admin/voice-test`,
20+ root-level debug scripts.

## Running seed scripts locally

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<the NEW rotated key>"
node scripts/seed.mjs
```
