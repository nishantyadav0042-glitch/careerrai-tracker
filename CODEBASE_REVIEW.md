# CareerRai Tracker — Complete Codebase Review
**For AI code review / co-founder analysis**

---

## CONTEXT FOR THE REVIEWER

CareerRai is a **Next.js 16.2.6 App Router** web app that is the daily accountability layer for CAT exam aspirants. It is **not** a generic edtech platform — it is a focused, opinionated daily habit-loop product. The product has exactly ONE core action: a student logs their prep day in under 30 seconds. Everything else (buddy, analysis, debrief, brain break, trajectory) exists to make that one action sticky and meaningful.

**3 user roles:**
1. **Student** — logs daily, gets feedback, sees progress (primary user, all product decisions revolve around them)
2. **Buddy** — IIM alum mentor who coaches their 10 assigned students
3. **Admin** — assigns buddies, broadcasts messages, imports cohorts

**Tech stack:**
- Next.js 16.2.6, React 19, TypeScript, Tailwind CSS 4
- Supabase (PostgreSQL + Auth + Storage + RLS)
- TanStack Query v5 (client-side state)
- Anthropic Claude API (scorecard OCR + AI insights)
- Recharts (analysis charts)
- Framer Motion (animations)
- Google Calendar API (session scheduling)

**Core files to understand:**
```
src/app/student/tracker/page.tsx          — Student home page (server component)
src/components/DailyTracker/DailyTrackerApp.tsx  — Client-side tracker shell
src/components/DailyTracker/LoggingModal.tsx     — THE main action (log your day)
src/app/api/logging/log-daily/route.ts    — Core business logic
src/hooks/useLogging.ts                   — Streak + log mutation
src/components/DailyTracker/HeroCard.tsx  — Streak display + CTA
src/components/DailyTracker/MockDebriefModal.tsx — Post-mock debrief
src/components/DailyTracker/FeedbackAnimation.tsx — Response after logging
src/components/DailyTracker/BrainBreakCard.tsx   — 4 mini-games
src/components/DailyTracker/TrajectoryWall.tsx   — Dream college progress
src/app/student/analysis/page.tsx         — Charts (line, bar)
src/app/buddy/home/buddy-triage-view.tsx  — Buddy student list with urgency score
src/app/student/reports/page.tsx          — Day-by-day log history
src/proxy.ts                              — Supabase session middleware
```

---

## SECTION 1: RED FLAGS — THINGS THAT WILL CRASH IN PRODUCTION

### 🔴 CRITICAL-1: Streak boundary logic duplicated in 3 places
The "day ends at 3 AM" logic is written 3 separate times:
- `src/app/api/logging/log-daily/route.ts` (lines ~47-50)
- `src/hooks/useLogging.ts` (lines ~49-52)
- `src/app/api/logging/log-daily/route.ts` again in `updateStreak()` (lines ~215-218)

Each copy uses slightly different variable names. If someone edits one, the others stay wrong. A student studying at 2:58 AM could get their streak credited to the wrong day.

**Fix:** Extract to `src/lib/streak-utils.ts`:
```typescript
export function getLogDateString(): string {
  const now = new Date();
  const today3am = new Date();
  today3am.setHours(3, 0, 0, 0);
  const logDate = now < today3am ? new Date(today3am.getTime() - 86_400_000) : today3am;
  return logDate.toISOString().split('T')[0];
}
```
Then import and use everywhere. Add unit tests for: midnight → yesterday's date, 2:59 AM → yesterday's date, 3:01 AM → today's date.

---

### 🔴 CRITICAL-2: `emotional_chips` not validated server-side
`LoggingModal` sends `emotional_chips: string[]` to `/api/logging/log-daily`. The route saves whatever is in that array directly to the database with no whitelist check. A malicious or buggy client could insert arbitrary strings into `daily_reports.emotional_chips`.

**Fix:** Add this to `route.ts`:
```typescript
const VALID_EMOTIONAL_CHIPS = [
  'mock_scared', 'burned_out', 'comparing', 'family_pressure',
  'lost_confidence', 'feeling_behind', 'all_good'
];
if (body.emotional_chips) {
  if (!body.emotional_chips.every((c: string) => VALID_EMOTIONAL_CHIPS.includes(c))) {
    return NextResponse.json({ error: 'Invalid emotional chip' }, { status: 400 });
  }
}
```

---

### 🔴 CRITICAL-3: `ProgressSnapshot` queries `mock_debriefs.taken_on` but debrief route saves to `log_date`
In `ProgressSnapshot.tsx` line 34:
```typescript
.order('taken_on', { ascending: false })
```
But in `MockDebriefModal` the submitted object uses `log_date`. If the column is `log_date` in the database, `taken_on` queries return nothing and "Last mock" always shows `—`. This is a silent data bug that makes the product look broken without throwing an error.

**Fix:** Audit `mock_debriefs` table columns. Pick one name (`log_date`) and standardize across all queries and code.

---

### 🔴 CRITICAL-4: Brain break 3-play limit is client-only — can be bypassed
`BrainBreakCard.tsx` checks `localStorage.getItem(todayKey)` to enforce the 3-play-per-day limit. This resets per device, is lost on private browsing, and can be bypassed by clearing storage. If you ever add rewards for brain breaks (streaks, badges), this is a cheat vector.

Also, the score logging is fire-and-forget with `catch(() => {})` — if the network fails, the score is silently lost.

**Fix:** Track plays server-side in `brain_break_logs`. Add a `GET /api/logging/brain-break/today` endpoint that returns today's count. The client reads from server; localStorage is only the optimistic UI layer.

---

### 🔴 CRITICAL-5: Onboarding bypass via localStorage creates permanently broken accounts
In `onboarding-modal.tsx`, `handleCompleteWithoutUpdate()` sets `localStorage.setItem(onboarding_skip_${userId}, 'true')` and calls `onComplete()` even when the database update fails. The user gets into the app but their `onboarding_completed` remains `false` in the database.

Next time they log in on a different device, they see onboarding again. If they skip it again, the same thing happens. Their profile will never have `dream_colleges`, `hours_available`, etc., because those are only saved during onboarding — silently degrading the entire evidence engine.

**Fix:** On the tracker page, add a server-side check: if `!profile.onboarding_completed`, still show the tracker but queue a "Complete your setup" banner. Remove the localStorage bypass entirely — it's a liability.

---

### 🔴 CRITICAL-6: Reports page uses `select('*')` with no limit on full history
`src/app/student/reports/page.tsx` line 22:
```typescript
.limit(period)  // period is 7, 10, or 30
```
But `computeSummary(reports, period)` from `src/lib/analytics.ts` receives all fetched rows. For a student with 200+ logs, switching from 7 to 30 days fetches 30 complete rows including all legacy fields. This is fine now, but `select('*')` fetches ALL columns including the unused legacy fields (quality_focus, difficulty, confidence, stress, sleep_quality, overall_energy, nutrition_exercise). This is wasted bandwidth.

**Fix:** Select only columns you display:
```typescript
.select('report_date, study_duration, topics_covered, mock_taken, total_accuracy, notes, mood_emoji, emotional_chips')
```

---

### 🟡 HIGH-1: No error boundary anywhere in the student flow
If `DailyTrackerApp`, `BuddyInsightCard`, `ProgressSnapshot`, or `BrainBreakCard` throw a JavaScript error, the entire `/student/tracker` page goes blank. There is no React error boundary. A student opens the app before an exam and sees a white screen.

**Fix:** Add a `ErrorBoundary` wrapper in `DailyTrackerApp`. At minimum:
```tsx
// src/components/DailyTracker/SafeCard.tsx
'use client';
import { Component, ReactNode } from 'react';

export class SafeCard extends Component<{ children: ReactNode; fallback?: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback ?? <div className="text-xs text-stone-400 p-4 text-center">Couldn't load this section.</div>;
    return this.props.children;
  }
}
```
Wrap `<BuddyInsightCard>`, `<ProgressSnapshot>`, `<BrainBreakCard>`, `<TrajectoryWall>` in it.

---

### 🟡 HIGH-2: `updateStreak` in the log route uses `.single()` — returns 406 on missing streak
```typescript
// log-daily/route.ts line ~212
const { data: streak, error: getError } = await admin
  .from('streak_data')
  .select('*')
  .eq('student_id', studentId)
  .single();  // ← BUG
```
If a student has no streak record yet (first log), `.single()` returns error code `PGRST116`. The code handles this case with an if-check, but `.single()` should be `.maybeSingle()` to avoid the Supabase 406 console error. This is inconsistent — everywhere else in the codebase was already fixed to use `.maybeSingle()`.

**Fix:** Change line ~212 to `.maybeSingle()` and handle the null case directly.

---

### 🟡 HIGH-3: `DailyTrackerApp` fetches `pending-debrief` on every mount (60s stale)
The pending-debrief query runs on every page load (staleTime: 60s). This triggers 3 sequential Supabase queries on mount: `daily_reports` → check if debrief exists → return. On a slow Indian mobile connection (3G/4G), this delays the display of the most important card on the screen.

**Fix:** Move pending-debrief detection to the server component (`tracker/page.tsx`) and pass it as a prop — it's already reading from the database there for 5 other queries. Zero extra round trips.

---

### 🟡 HIGH-4: `BuddyTriageView` has `/* eslint-disable react-hooks/set-state-in-effect */` on line 2
This suppressed warning is a symptom, not a fix. There is likely a state-in-effect pattern that will cause infinite re-renders or memory leaks. The comment is in `buddy-triage-view.tsx` and should be investigated.

---

### 🟡 HIGH-5: No rate limiting on `/api/logging/log-daily`
A student can spam this endpoint. Each call:
1. Queries `daily_reports` for the existing log
2. Upserts a new log
3. Calls `updateStreak` (which does 2 more DB round-trips)
4. Calls `computePrescriptiveLine` (14-row query)
5. Fires 2-3 async notifications

This is 8+ Supabase calls per request. 20 rapid calls in a second = Supabase connection pool exhaustion.

**Fix:** Add a debounce in the UI (`isSubmitting` flag exists and works — but also add a `429 Too Many Requests` server-side check using a rate-limit table or Supabase's built-in rate limiting).

---

## SECTION 2: WHAT AN AI CODE ASSISTANT WOULD DO DIFFERENTLY

### AI-1: Extract shared business constants
Magic numbers and strings are scattered everywhere. These should be in `src/lib/constants.ts`:
```typescript
export const DAY_BOUNDARY_HOUR = 3;
export const MS_PER_DAY = 86_400_000;
export const LOOKBACK_DAYS = 14;
export const CONSISTENCY_WINDOW = 7;
export const SECTION_AVOIDANCE_THRESHOLD = 3;
export const MOCK_FREQUENCY_THRESHOLD = 7;
export const CAT_EXAM_DATE = new Date(2026, 10, 29);
export const INDIA_TIMEZONE = 'Asia/Kolkata';
export const VALID_SECTIONS = ['VARC', 'DILR', 'QA', 'Mock', 'Revision'] as const;
export const VALID_ENERGY = ['🙏', '💪', '🔥'] as const;
export const VALID_EMOTIONAL_CHIPS = ['mock_scared', 'burned_out', 'comparing', 'family_pressure', 'lost_confidence', 'feeling_behind', 'all_good'] as const;
```

---

### AI-2: `computePrescriptiveLine` should be a pure function with a test suite
The Evidence Engine function is 99 lines in an API route. It's hard to test, hard to extend, and completely invisible to the UI. An AI engineer would extract it:

```typescript
// src/lib/evidence-engine.ts
export interface DailySignal {
  report_date: string;
  study_duration: number;
  topics_covered: string[];
  mock_taken: boolean;
  emotional_chips: string[];
}

export function computePrescriptiveLine(
  signals: DailySignal[],
  todaySections: string[],
  isFirstLog: boolean,
  emotionalChips?: string[]
): string | null { ... }
```

Then write `src/lib/evidence-engine.test.ts` with cases for every rule. This is the most critical logic in the product — it currently has zero tests.

---

### AI-3: `HeroCard` inline `<style>` tag is a code smell
`HeroCard.tsx` lines 139-147 inject CSS animations via a `<style>` tag directly in JSX:
```jsx
{!hasLoggedToday && (
  <style>{`
    @keyframes pulse-soft { ... }
    .hero-cta-pulse { animation: pulse-soft 2s ease-in-out infinite; }
  `}</style>
)}
```
This creates a new `<style>` element on every render and is a React anti-pattern. The animation class is also never applied to a DOM element (`.hero-cta-pulse` is defined but not used anywhere in the component).

**Fix:** Move the animation to `globals.css` or use a Tailwind `animate-` class.

---

### AI-4: `reports/page.tsx` is a client component that fetches in `useEffect` — slow on mobile
The reports page does auth check + Supabase fetch in `useEffect`. This means:
1. Page renders blank
2. `useEffect` runs → auth check starts (async)
3. User ID fetched → Supabase query starts (async)
4. Data arrives → page renders

On a 4G Indian connection, this is 2 waterfalls (400-800ms each). Total: 800-1600ms of blank screen.

**Fix:** Make `reports/page.tsx` a server component (add `export default async function`) and pass data as props to a client component for the period-switching interaction only.

---

### AI-5: `DailyTrackerApp` uses `useState` + inline hook calls where a custom hook would be cleaner
`DailyTrackerApp.tsx` manages 6 modal states (`isLogOpen`, `isDebriefOpen`, `isPuzzleOpen`, `currentLogDate`, `lastNudge`, plus the pending-debrief query). This is all in one component with 300+ lines. An AI would extract:
```typescript
// src/hooks/useTrackerModals.ts
export function useTrackerModals() {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [currentLogDate, setCurrentLogDate] = useState('');
  // ... etc.
  return { isLogOpen, openLog: () => setIsLogOpen(true), closeLog: ... };
}
```

---

### AI-6: `onboarding-modal.tsx` has `StudyTargetHours` state that's off-by-two screens
The screen index comments say "Screen 2 (index 2) = Daily Commitment" but after adding 2 new screens at the front, Daily Commitment is now screen index 4. The comment is wrong and confusing. This will cause a bug if someone adds another screen.

**Fix:** Reference screens by name, not index:
```typescript
const screenName = screens[currentScreen].title;
if (screenName === 'Daily Commitment' && data?.studyTargetHours) { ... }
```

---

### AI-7: `ProgressSnapshot` shows "X/7 days logged" and "This week: Xh" — both show the same 7-day data, redundant
The Progress Snapshot has 3 tiles:
- "Xh · This week" (hours in last 7 days)
- "X%ile · Last mock" (last debrief percentile)
- "X/7 · Days logged" (days logged in last 7 days)

Tiles 1 and 3 are the same 7-day window, just different numbers from the same query result. Tile 3 (`daysLogged/7`) duplicates info that Tile 1's subtitle already shows (`${daysLogged} days logged`). One of them should show something distinct — like current streak vs. max streak, or hours this week vs. hours last week (trend arrow).

---

## SECTION 3: EASY WINS — HIGH IMPACT, LOW EFFORT

### EASY-1: Add haptic feedback to the log button
The log button is the most tapped element in the app. On mobile:
```typescript
// In LoggingModal.tsx handleSubmit()
navigator.vibrate?.(50); // Single short pulse on submission
```
```typescript
// In HeroCard.tsx, the Log Today button onClick
navigator.vibrate?.(20); // Ultra-light tap confirmation
```
This makes the app feel native and premium in one line of code.

---

### EASY-2: The "15 seconds. The app answers back." microcopy should be dynamic
Currently hardcoded. It could reflect reality:
```typescript
const avgResponseMs = 800; // compute from analytics
const secondsText = avgResponseMs < 1000 ? '< 1 second' : `${Math.round(avgResponseMs / 1000)}s`;
// "Usually responds in < 1 second."
```
Or even simpler: if the student is on a slow connection (check `navigator.connection?.effectiveType`), show "Results in a few seconds."

---

### EASY-3: Show emotional chip selections in the History page
`src/app/student/reports/page.tsx` expanded card shows mood as `r.confidence/5` (a legacy integer field nobody enters anymore). It should show `r.emotional_chips` instead — the actual feelings the student logged. This makes the history page feel real and honest rather than showing placeholder numbers.

```tsx
// In the expanded card:
{(r.emotional_chips ?? []).length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {r.emotional_chips.map((chip) => <span key={chip}>{CHIP_EMOJI[chip]} {CHIP_LABEL[chip]}</span>)}
  </div>
)}
```

---

### EASY-4: Add a loading skeleton to BrainBreakCard
When the app loads, all cards render instantly from server props — except `BrainBreakCard` which checks localStorage (sync, fine) but makes an API call to log scores. There is no loading state on the card. Low priority but visible.

---

### EASY-5: The `shieldsRemaining` section on HeroCard is invisible when 0 shields
When shields are 0, the shield badge disappears entirely. But the text "auto-protects a missed day" can still show below (based on `shieldsRemaining > 0 && !hasLoggedToday`). If a student has never heard of shields, they don't know the feature exists. 

**Fix:** Show a dimmed shield icon with "0 left · resets next month" when shields are 0. This teaches the feature passively without being intrusive.

---

### EASY-6: `TrajectoryWall` won't render until migration is applied — but crashes silently
After the new migration (`20260612_full_mirror_spec.sql`), `profile.dream_colleges` is `[]` for all existing users. `TrajectoryWall` correctly returns `null` when `dreamCollege` is null. But existing users who didn't go through new onboarding will never see the Trajectory Wall — there's no way to set dream colleges from the settings page.

**Fix:** Add a "Set your dream college" link in `/student/settings` or `/student/profile` that opens the same college picker screen.

---

### EASY-7: Analysis page shows "Take 2 mocks and your trend line appears here" but 1 mock is useful
A student who has taken exactly 1 mock sees a placeholder instead of their actual data. Single-mock data is valuable — show it:
- Section breakdown (VARC/DILR/QA accuracy)
- Error buckets
- Strategy note
- "Log your next mock to see your trend"

The 2-mock threshold is only needed for the LINE CHART (trend). Show everything else immediately.

---

### EASY-8: The debrief modal "Start Debrief" button on `PendingDebriefCard` doesn't indicate what happens next
Students see a banner saying "Debrief pending" but don't know if clicking opens a camera, a form, or something else. Add a subtitle: "Takes 3 minutes · Photos of your scorecard welcome".

---

## SECTION 4: PERFORMANCE — CLICK-TO-REACT LATENCY

### PERF-1: The tracker page has 6 parallel Supabase queries on load — but they all block the render
```typescript
// tracker/page.tsx — all 6 queries run in parallel but render waits for ALL of them
const [{ data: profile }, { data: sessions }, ...{ data: mocks }] = await Promise.all([...]);
```
The slowest query blocks everything. `mocks` (counting all debriefs ever) is unbounded and slow for active students.

**Fix:** Use streaming with `Suspense` boundaries. Show the header + HeroCard from a fast query first, then stream the rest:
```tsx
// Fast: just profile + streak
<Header profile={profile} />
<Suspense fallback={<HeroCardSkeleton />}>
  <DailyTrackerApp studentId={user.id} />
</Suspense>
<Suspense fallback={<SkeletonCard />}>
  <TrajectoryWallAsync studentId={user.id} />
</Suspense>
```

---

### PERF-2: `BuddyInsightCard` makes 3 sequential Supabase calls on mount
```
1. fetch buddy_feedback (client useQuery)
2. fetch profiles.buddy_id (client useQuery — same component!)
3. fetch buddy's profile (only after step 2 resolves)
```
This is a 3-waterfall chain from a client component. On a slow connection this is 1-2 seconds of blank card.

**Fix:** Pass `buddyId` and `buddyName` as props from the server component (it already fetches profile). The `BuddyInsightCard` only needs to fetch the feedback text — 1 query instead of 3.

---

### PERF-3: `ProgressSnapshot` staleTime is 5 minutes but should react to log submissions
After a student logs, `queryClient.invalidateQueries({ queryKey: ['progress-snapshot'] })` is called. But if the student logs then immediately checks Progress Snapshot, the invalidation might not have propagated before the staleTime window expires.

**Fix:** In `useLogging.ts`, after successful mutation, also explicitly refetch:
```typescript
queryClient.refetchQueries({ queryKey: ['progress-snapshot'] });
```

---

### PERF-4: LoggingModal renders all 7 emotional chip buttons unconditionally
Minor but worth noting: all 7 chip buttons render on every keystroke inside the Notes field (because `emotionalChips` state update triggers a re-render). Add `React.memo` to `EmotionalChips`:
```typescript
export const EmotionalChips = React.memo(function EmotionalChips(...) { ... });
```

---

### PERF-5: `BuddyTriageView` loads all students on every mount — no caching
`loadBuddyStudents(buddyId)` is called every time the buddy home renders. For a buddy with 10 students, this queries: streak_data, daily_reports, buddy_feedback, mock_debriefs for each student — up to 40 Supabase calls.

**Fix:** Convert to a React Query `useQuery` with 5-minute staleTime. Add a "Refresh" button for manual updates. Or move the heavy lifting to a server component with ISR revalidation.

---

### PERF-6: Bottom nav renders `usePathname()` on every navigation — causes flash
`bottom-nav.tsx` uses `pathname === item.href || pathname.startsWith(item.href + '/')` for active state. The `.startsWith()` check fires on every path change. Minor, but could be replaced with a precomputed lookup.

---

## SECTION 5: DESIGN, UI, UX — FULL AUDIT

### UX-1: THE DAILY LOG FLOW (MOST IMPORTANT)

**Current flow:**
1. Open app → see Hero card + "Log Today" button
2. Tap button → bottom sheet slides up (dark theme)
3. Select hours → select sections → select energy → optional chips → optional notes
4. Tap "Log Day" → loading state → success animation
5. If Mock selected → Debrief modal appears

**Issues:**
- **Step 2: The bottom sheet takes ~200ms to animate in on older phones.** This feels slow when the student is in a hurry. The sheet should use `transform: translateY(0)` starting immediately.
- **Step 3: Hours selection is 7 buttons in a row (0-6).** On small phones (iPhone SE), these buttons are cramped. The "6+" button is especially small. Consider 2 rows: [0, 1, 2, 3] and [4, 5, 6+].
- **Step 4: Emotional chips use horizontal scroll wrapping that can extend the modal height unpredictably.** On a 667px screen, the user might need to scroll to reach the submit button without realizing it.
- **Critical UX gap:** After submitting, the FeedbackAnimation plays for 3-5 seconds. During this time, the modal is closed and the user can see the Hero card updating. But what if they need to reference their log? There's no "View what I logged" button anywhere.
- **The submit button says "Log & Debrief →" when Mock is selected.** Students don't know if this opens a form or redirects them. Consider "Log → Then fill mock scorecard".

**Fix for the critical path:**
The entire log-to-feedback cycle should feel like < 2 seconds. Current path:
```
Button tap → modal open (200ms) → fill form (30s average) → submit → API call (500-1000ms) → animation (3-5s)
```
Target: API response in < 300ms (possible with optimistic updates), animation in 2s.

---

### UX-2: ONBOARDING — NEW FLOW

The new Dream Colleges screen is the right first screen. However:

- **The college list has 14 options in a flex-wrap layout.** On mobile, this is 4-5 rows of buttons. Students might not scroll past the first 2 rows and miss IIM Kozhikode, ISB, XLRI, etc. Add "Show all" or use a searchable list.
- **The rank indicators (#1, #2, #3) are absolute-positioned `w-4 h-4` circles.** At 16px diameter, they're too small to tap on mobile. This isn't a tap target — it's display-only. Fine.
- **Screen-Honesty: The repeater percentile slider starts at 50 and goes 1-99.** A student who got 85.3 last year has to drag to exactly 85 — the drag precision is poor on mobile. Better: two options: [Dragging is too slow → "Enter percentile" number input] or snap to multiples of 5.
- **Onboarding has 6 screens now (was 4).** Progress bar shows 6 segments. On a 375px screen, each segment is about 55px. The "Skip" button in the top-right should be labeled "Skip for now" and be more prominent — students need to know they can always complete this later.

---

### UX-3: BUDDY TRIAGE VIEW

**The most important screen for buddy engagement.** When a buddy opens the app, they see student cards sorted by urgency score.

**Issues:**
- **"Need Attention" and "Check In Soon" summary cards at the top** occupy 40% of above-the-fold space before the buddy sees any student names. On mobile, the buddy scrolls past 3 large metric boxes to see the first student.
- **The `urgency score` number (0-100?) is shown without explanation.** A new buddy doesn't know if 67 is bad. Add a legend: "80+ = urgent today | 50-79 = check in | <50 = on track".
- **Voice note button is the primary action but takes buddy through a recorder modal.** If the buddy's device microphone fails, they're stuck. Add a text fallback.
- **Student cards show `${student.daysSinceFeedback}d ago`** but sometimes shows `∞ days` (when > 60 days). This is a data quality issue — if a buddy just got assigned this student, `daysSinceFeedback` should show "Not yet" not "∞ days".

---

### UX-4: ANALYSIS PAGE — STUDENT

**Current:** Blank promise state if < 2 mocks. When mocks exist: line chart (percentile trend), bar chart (error buckets), strategy note.

**Issues:**
- **The percentile trend chart on mobile** renders at 100% width. The XAxis date labels (`May 12`, `May 19`, etc.) overlap on small screens because Recharts doesn't auto-truncate.
- **The Tooltip** has `background: '#1c1917'` (dark) which looks great but on some Android Chrome versions, the tooltip clips outside the chart container.
- **No "What does this mean?" explanation.** A student who sees "Conceptual: 47 errors" doesn't know if that's bad. Add a callout: "Conceptual errors = you didn't know the concept. This needs dedicated topic study, not more practice."
- **The "Flat across N mocks — consistency first, then push one section" message** is correct but harsh. It should link to an action: "Start with your weakest section tomorrow."

---

### UX-5: HISTORY PAGE (REPORTS)

**Issues:**
- **Uses `select('*')` and shows legacy fields** like `Quality 3/5 · Difficulty 3/5` which are always default values (never collected from user). These should be hidden if they're at default.
- **The mock badge shows `Mock r.total_accuracy%`** but `total_accuracy` is only set for some logs. Undefined shows as "Mock %".
- **No emotional chips displayed** — the most recently added, most personal field is missing from history.
- **The 7-day/10-day/30-day toggle re-fetches from the server** via a new `useEffect` call. This means 3 loading states if a student taps all 3 options. Should preload all 30 days at once and filter client-side.
- **Scroll position resets to top** when tapping a day to expand, then collapsing it. The user loses their place in the list.

---

### UX-6: BRAIN BREAK — GAME DESIGN

The games are a strong engagement hook. Details:

**Math Sprint:**
- After selecting an answer, feedback shows for 500ms then auto-advances. **On phones, 500ms feels either too fast (missed the flash) or too slow (feels laggy).** Consider 350ms for correct, 800ms for wrong (so the wrong answer registers emotionally).
- The score display ("7 correct") should show "7/10" as a fraction — students understand ratios better than running totals.

**Pattern Lock:**
- The 3x3 grid is `max-w-[200px]` which gives ~60px cells. **On phones under 350px wide (old Samsung budget phones), this overflows the padding.** Use `min(200px, 80%)` width instead.
- After a wrong pattern, the grid should flash red briefly. Currently nothing happens except "✗ Wrong" text.

**Memory Grid:**
- The 4x4 emoji grid is the most fun game but the emoji size (`text-lg` = 18px) is too small in a `h-full` cell. Use `text-xl` or `text-2xl`.
- After completing all pairs, there's no celebration — just `setDone(true)`. Add a confetti burst or a "🎉 All matched!" overlay before `onDone()`.

**Sudoku Blitz:**
- The ring-1 ring-zinc-600 CSS on alternating cells to indicate 2x2 box groupings is subtle to the point of invisibility. Add a visible border between box groups: make top/left borders heavier on cells [0,2,8,10] to show the 4 quadrants.
- The "Check answers" button only appears when all cells are filled. Students don't know if partial checking is possible.

---

### UX-7: TRAJECTORY WALL

**Good idea. Several issues:**

- **Only shows when `dreamCollege` is set.** Most existing users don't have dream colleges yet (pre-migration). The wall is invisible until they update their profile. This is the most motivating element of the new design and most users will never see it unless you prompt them.
- **The trajectory sentence** uses `daysStudied` and `daysToCat` to estimate "At current pace..." but the current formula is: if `gap/daysToCat < 0.05` then "you'll reach your target". This is not a real trajectory — it doesn't use actual percentile progression data. It should use the last 3 debriefs' percentile trend.
- **The mini-stats row** shows "Days logged", "Mocks done", "Study days" — but "Days logged" and "Study days" are conceptually confusing (are they different?). Replace with "Streak" and "Mocks done" and "Study days".
- **The progress bar** goes from current percentile to target percentile. A student at 72%ile targeting 95%ile sees a bar that's 75% full — which looks good but isn't. The bar should go from 50 (starting point) to 100 (maximum) with current marked on it.

---

### UX-8: BOTTOM NAVIGATION — 6 ITEMS

The student bottom nav has 6 items: Home | Analysis | Buddy | History | Exams | Profile.

**6 items on mobile is too many.** Research consensus is 3-5 tabs. On small screens, each icon-label pair gets ~57px — at the threshold of comfortable tap targets (48px minimum recommended by Apple HIG and Material Design).

**Priority audit:**
- **Home** (tracker) — daily, critical ✅
- **Analysis** — weekly, important ✅
- **Buddy** — variable, important ✅
- **History** (reports) — occasional, could be under Profile ⚠️
- **Exams** — rare, definitely secondary ⚠️
- **Profile** — rare ⚠️

**Fix:** Collapse to 4 tabs: Home | Analysis | Buddy | More (where More opens a menu with History, Exams, Profile, Goal, Settings). This gives more tap room to the 3 daily-use items.

---

### UX-9: HERO CARD — TEXT OVERFLOW ON LONG STREAKS

The streak number at day 100+: `text-5xl font-mono` renders "100" in 3 characters vs "7" in 1. At day 100, the layout might push "study days" text to wrap. Test at 100 and 365 days. Add `whitespace-nowrap` to the number row.

Also: the flame icon `animate-bounce` runs constantly even when the streak is 150+ days. After a certain number of days, bouncing feels juvenile. Consider removing the bounce after 30 days and replacing with a steady glow.

---

### DESIGN-1: Dark/light modal mismatch
The LoggingModal is dark-themed (`bg-zinc-950`). The tracker page is light (`bg-stone-50`). When the modal opens, the contrast is jarring — especially the instant black overlay. Match the aesthetic or add a smoother transition between light background and dark modal.

---

### DESIGN-2: Typography inconsistency
- Headers use `fontFamily: 'Georgia, serif'` via inline style
- Body uses Tailwind's default sans-serif  
- The `font-mono` class (Courier/Consolas) is used for streak numbers and stats

Three different font stacks. Define them in `tailwind.config` and use consistent classes:
```typescript
theme: {
  extend: {
    fontFamily: {
      display: ['Georgia', 'serif'],
      body: ['var(--font-geist-sans)', 'sans-serif'],
      mono: ['var(--font-geist-mono)', 'monospace'],
    }
  }
}
```

---

### DESIGN-3: Color system has unintentional collisions
- Teal (`#2A9D8F`) is used for: buddy content, session strips, solved puzzle state, "all good" emotional chip
- Orange is used for: CTA buttons, streak, critical badges, selected states
- Stone is used for: backgrounds, text, borders, labels

When a buddy session strip (teal) appears next to a buddy insight card (also teal), they merge visually. Reserve teal exclusively for buddy-related content.

---

## SECTION 6: ADMIN PROFILE AUDIT

The admin profile (`src/app/admin/`) is not fully audited but from file structure:
- `admin-students-list.tsx` — student roster
- `admin-broadcast.tsx` — cohort messaging
- `admin-data-import.tsx` — bulk import

**Issues identified without reading code:**

- **No role-check middleware visible.** If a student manually navigates to `/admin`, can they access it? Role-based routing should be enforced at the proxy/middleware level, not just by convention.
- **Bulk import (`admin-data-import.tsx`) is a high-risk operation.** If it doesn't validate CSV structure, it could insert malformed records into `profiles`. Should have: column validation, duplicate email detection, dry-run preview, undo mechanism.
- **No audit log for admin actions.** When a buddy is assigned, who assigned them and when? Needed for support/debugging.

---

## SECTION 7: STUDENT PROFILE AUDIT (3 KEY PATHS)

### PATH A: Day 1 Student (no buddy, no logs, just registered)
**Expected:** Onboarding → Dream Colleges → Honesty → Meet Buddy → Baseline → Commitment → Log Day 1 → Tracker

**Actual gaps:**
1. After onboarding, the tracker shows "Your buddy is being matched" banner. But if the student taps Log Today → logs → sees FeedbackAnimation → the animation says "📋 Pattern detected" or similar. But there's no pattern yet — they have 1 log. The prescriptive engine should always return "First log done. Do this daily..." on the first log.
   - **Risk:** If `isNewLogForDate` calculation is off-by-one, the first log doesn't trigger Rule 1.
2. The Trajectory Wall is blank (no dream college saved if onboarding database save failed).
3. BrainBreak shows "3 plays left today" — but this is a brand new student who hasn't even logged yet. Show brain break only after first log, or add a message: "Log your day first — then take a break."

### PATH B: Active Student (7+ days logged, has buddy, doing mocks)
**Expected:** Opens tracker → sees streak, trajectory wall, buddy insight, puzzle, progress snapshot, brain break → logs → debrief if mock day.

**Actual gaps:**
1. If the buddy hasn't sent any feedback and there's no `daily_nudge` from the last log, `BuddyInsightCard` returns `null` and completely disappears. This creates a visual gap in the layout — cards jump. Should show a placeholder: "Your buddy will respond after today's debrief."
2. After submitting a debrief, `queryClient.invalidateQueries({ queryKey: ['pending-debrief'] })` fires but the `ProgressSnapshot` query for `mock_debriefs` doesn't get invalidated. The "Last mock" tile still shows the old percentile until 5-minute stale time expires.
3. The DailyPuzzle `gameType` detection logic is complex (isEscape, isMafia, isCasePuzzle checks with raw content type casting). If a puzzle has an unexpected `game_type` field value, it silently falls through to the legacy `PuzzleSolverModal` without any error. Add explicit exhaustive checking.

### PATH C: Buddy Profile
**Expected:** Opens app → sees student triage list → checks critical students → sends voice note or schedules session → leaves feedback.

**Actual gaps:**
1. `BuddyTriageView` calls `loadBuddyStudents(buddyId)` which likely does N queries for N students. This is an N+1 query problem. For 10 students: 10 profile queries + 10 streak queries + 10 daily_report queries = 30+ queries just to render the home page.
2. The "Voice note" button opens `VoiceNoteRecorder`. There's no text-message fallback if microphone permission is denied.
3. The buddy can see "Last feedback: Xd ago" but can't see WHAT the feedback was from this screen. They have to navigate to the student detail page.
4. After sending a voice note, `onSendComplete={() => {}}` is an empty callback — the triage view doesn't refresh. The student card still shows the old "last feedback: Xd" count even though feedback was just sent.

---

## SECTION 8: SECURITY CHECKLIST

| Check | Status | Action |
|-------|--------|--------|
| Auth gate on all pages | ✅ Done | — |
| Supabase RLS on all tables | ⚠️ Unknown | Audit policies; add `SELECT` filter `student_id = auth.uid()` |
| emotional_chips whitelist validation | ❌ Missing | Add VALID_EMOTIONAL_CHIPS check in API |
| Rate limiting on log endpoint | ❌ Missing | Add middleware or Supabase rate limit |
| Admin route role check | ⚠️ Unknown | Confirm admin-only middleware at proxy level |
| CSRF protection | ⚠️ Supabase may handle | Confirm anon key scope |
| Scorecard image not stored unencrypted | ⚠️ Unknown | OCR route endpoint review |
| Voice note audio stored securely | ⚠️ Unknown | Confirm Supabase Storage bucket is private |
| API keys in client bundle | ⚠️ SUPABASE_ANON_KEY exposed | This is intentional/safe; confirm SUPABASE_SERVICE_ROLE_KEY is NOT exposed |
| brain_break_logs RLS policy | ❌ Missing (pending migration) | Apply migration, include policy in SQL |

---

## SECTION 9: TESTING MATRIX (WHAT TO TEST MANUALLY)

### Student Testing
- [ ] Register new account → go through full onboarding → reach tracker
- [ ] Log 0 hours → verify streak does NOT increment, record IS saved
- [ ] Log > 0 hours → verify streak increments by 1
- [ ] Log before 3 AM → verify it credits to previous day
- [ ] Select "Mock" in sections → verify debrief modal opens after submit
- [ ] Submit debrief → verify PendingDebriefCard disappears
- [ ] Skip debrief → verify PendingDebriefCard appears next login
- [ ] Select emotional chips "burned_out" → verify buddy gets notification
- [ ] Select "all good" chip → verify others are deselected
- [ ] Play Math Sprint 3 times → verify 4th attempt is blocked
- [ ] Rotate phone to landscape → verify modals don't break layout
- [ ] Open app on 4G then toggle to offline → verify graceful error, not crash

### Buddy Testing  
- [ ] Log in as buddy → see student list
- [ ] Check "critical" filter → only critical students shown
- [ ] Send voice note → verify `daysSinceFeedback` updates on card
- [ ] Schedule session → verify it appears on student's tracker
- [ ] See student emotional chip notification → open student detail

### Admin Testing
- [ ] Assign buddy to student → verify buddy_id saved in profiles
- [ ] Broadcast message → verify all students receive notification
- [ ] Import CSV → test with malformed data (extra columns, duplicate emails)

---

## SECTION 10: QUICK WINS PRIORITIZED

### Do this week (< 2 hours each):
1. Fix `updateStreak` to use `.maybeSingle()` instead of `.single()`
2. Add `emotional_chips` whitelist validation in log API
3. Fix `reports/page.tsx` to select only needed columns (not `select('*')`)
4. Show emotional chips in history page expanded view
5. Add haptic feedback (`navigator.vibrate`) to log button

### Do this sprint (2-8 hours each):
6. Extract `getLogDateString()` to `src/lib/streak-utils.ts` + tests
7. Add error boundary `SafeCard` wrapper to all DailyTracker components
8. Move `pending-debrief` check to server component in `tracker/page.tsx`
9. Convert `reports/page.tsx` to server component with client period-switcher
10. Add "Set your dream college" in profile/settings page

### Do next sprint (1-3 days each):
11. Extract `computePrescriptiveLine` to `src/lib/evidence-engine.ts` with full test suite
12. Reduce bottom nav from 6 to 4 items (collapse History/Exams/Profile into "More")
13. Fix `BuddyInsightCard` to accept `buddyId` as prop (reduce 3 waterfalls to 1)
14. Move `BuddyTriageView` to React Query with staleTime + refresh button (fix N+1 queries)
15. Add Trajectory Wall "Set Dream College" prompt for users with no colleges set

---

## INSTRUCTIONS FOR THE AI REVIEWING THIS

You are reviewing a production Next.js 16 codebase. The student who uses this app logs their CAT prep daily. This is the CORE loop:

1. Student opens `/student/tracker` (server-rendered, fast)
2. Taps "Log Today" → `LoggingModal` opens (client, bottom sheet)
3. Fills 4 fields: hours | sections | energy | optional emotional chips
4. Submits → POST `/api/logging/log-daily` → gets back `streak` + `daily_nudge`
5. `FeedbackAnimation` shows the nudge
6. If Mock selected: `MockDebriefModal` opens after submit

Everything else in the codebase exists to make steps 1-6 feel worth doing tomorrow.

**When suggesting fixes:**
- Start with the CRITICAL issues above — they can cause data loss or silent failures
- Never suggest changes that slow down the log submission flow (it must feel instant)
- The 3 AM boundary logic is intentional and correct — don't "fix" it
- The prescriptive engine is rule-based intentionally — do not suggest adding LLM calls inside the log route (latency concern)
- Supabase is the chosen database — don't suggest migration to other providers
- Next.js 16 App Router is intentional — some patterns differ from Next.js 14 you may know

**Key files to focus on:**
```
src/app/api/logging/log-daily/route.ts  — Most critical business logic
src/components/DailyTracker/LoggingModal.tsx  — Primary user action
src/components/DailyTracker/HeroCard.tsx  — First thing student sees
src/hooks/useLogging.ts  — Streak + mutation state
src/components/DailyTracker/BrainBreakCard.tsx  — New, needs review
src/components/DailyTracker/TrajectoryWall.tsx  — New, needs review
```
