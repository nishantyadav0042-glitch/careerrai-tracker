# CareerRai Admin Panel — complete inventory

**Purpose of this document.** A full, honest map of every admin screen, every
API behind it, how each number is calculated, and where the structure has
drifted. Written to be handed to someone (or something) that will propose a
reorganisation, so it deliberately records the mess as well as the design.

Generated 9 Aug 2026 from the branch `claude/status-update-t1g5as`. Every route
below was read from the file tree, not remembered.

**Headline numbers**

| | Count |
|---|---|
| Admin pages (`src/app/admin/**/page.tsx`) | **32** |
| Admin API routes (`src/app/api/admin/**/route.ts`) | **31** |
| Top-level nav destinations | **7** |
| Pages reachable from the nav (directly or one hop) | **~17** |
| **Pages with NO inbound link from anywhere** | **11** |
| Pages that are retired stubs | 1 |

---

## 1. Navigation as it exists today

Defined once, in `src/app/admin/admin-nav.tsx`. Same bar on every admin screen.
Seven destinations:

| # | Label | Route | Also highlights |
|---|---|---|---|
| 1 | **Today** | `/admin` | — |
| 2 | **Leads** | `/admin/leads` | `/admin/cat-leads` |
| 3 | **Students** | `/admin/students` | — |
| 4 | **Growth** | `/admin/growth` | — |
| 5 | **Analytics** | `/admin/analytics` | — |
| 6 | **Money** | `/admin/payments` | `/admin/coupons`, `/admin/scholarships` |
| 7 | **System** | `/admin/system` | `/admin/notification-health`, `/admin/perf`, `/admin/sales-queue`, `/admin/brain` |

The nav's own header comment states the intent, and it is worth quoting because
the current state has drifted from it:

> *"The one admin navigation (founder, 14 July): the panel had grown into a
> pile of tabs + quick-link buttons + orphan pages."*

**It has grown back.** 32 pages behind 7 nav items, and 11 pages nothing links
to at all.

---

## 2. Screen-by-screen inventory

### 2.1 TODAY — `/admin` (root, 215 lines)

The morning action centre. **Summary only** by design — every card is a count
plus a link to the list behind it.

**Seven metric cards.** Each card's number is literally `list.length` of the
page it links to, because both come from the same function in
`src/lib/admin-filters.ts`:

| Card label | Value | Links to | Rule |
|---|---|---|---|
| Logged today | `loggedToday/totalStudents` | `/admin/logged-today` | Has a `daily_reports` row dated today (3 AM IST log-day) |
| Streaks alive (incl. 🛡️ shield-protected) | count | `/admin/live-streaks` | Stored streak ≥1 **AND** last log today or yesterday |
| Remind to log today | count | `/admin/reminders` | Onboarded **AND** has not logged today |
| 🛡️ Shield used yesterday — win them back | count | `/admin/streak-breakers` | Logged day-before-yesterday, skipped yesterday, silent today |
| Sales-ready to call | count | `/admin/sales-queue` | `engagement.sales_ready`, never called, still free |
| 💛 Want a buddy — said yes at signup | count | `/admin/wants-buddy` | Said yes to the mentor question at onboarding, still free, unassigned |
| Going cold (4+ days) | count | `/admin/going-cold` | Last log **≥ 4 days** ago |

**Four hero buttons + three secondary links** also live on this page:

- `/admin/launch` · `/admin/mission` · `/admin/sales` · `/admin/mission-control`
- `/admin/challenges` · `/admin/daily-pick` · `/admin/sales-performance`

> **Structural note.** These seven destinations are reachable ONLY from this
> page. None is in the nav. If you land anywhere else in the panel, they are
> invisible.

### 2.2 LEADS — `/admin/leads` (184) + `/admin/leads/[id]` (396)

The CRM. Every signup, categorised, exportable.

- **List page** builds a `wa.me` link with a suggested outreach message chosen
  from the lead's state: no app → install nudge; installed but no notifications
  → turn on reminders; engaged → keep going.
- **Detail page** — *"One page, 20 seconds: who is this, what's their real
  struggle, why call today, what to mention."* Every insight shown is the same
  signal the student's own app shows them.
- `/admin/cat-leads` (8 lines) — **RETIRED STUB.** Redirects; the readiness quiz
  no longer produces leads.

**APIs:** `/api/admin/leads-export` (GET), `/api/admin/outreach` (POST, PATCH).

### 2.3 STUDENTS — `/admin/students` (238)

Dossiers, buddy matching, buddy SLA. Composed of four client components that
live in `src/app/admin/`:

| Component | File |
|---|---|
| Students list | `admin-students-list.tsx` |
| Buddies list | `admin-buddies-list.tsx` |
| Match panel | `admin-match-panel.tsx` |
| Tab switcher | `admin-tabs.tsx` |

- `/admin/student/[id]` (223) — individual student dossier.

**APIs:** `/api/admin/assign-buddy` (POST), `/api/admin/mark-test` (PATCH),
`/api/admin/dna` (GET), `/api/admin/dna/[studentId]` (GET),
`/api/admin/dna/pending` (GET), `/api/admin/dna/pending/[id]` (POST).

### 2.4 GROWTH — `/admin/growth` (235)

Funnel analytics. **No header comment in the file** — purpose is undocumented.

### 2.5 ANALYTICS — `/admin/analytics` (264)

Real behaviour from the `student_events` table.

> *"The tracking system has been recording every app open, screen view, log
> attempt and checkout step for days — 10k+ rows — and had NO admin surface."*

**Overlaps with Growth.** Both are "how is the funnel doing"; the split between
them is not documented anywhere.

### 2.6 MONEY — `/admin/payments` (127), `/admin/coupons` (63), `/admin/scholarships` (100)

These three cross-link to each other (payments ↔ coupons ↔ scholarships), which
makes them the **best-organised cluster in the panel** — a real sub-section.

**APIs:** `/api/admin/payments-status` (GET), `/api/admin/refunds` (POST),
`/api/admin/coupons` (POST, PATCH), `/api/admin/scholarships` (POST, PATCH),
`/api/admin/payouts` (POST, PATCH).

### 2.7 SYSTEM — `/admin/system` (74)

The toolbox. Three inline sections + four outbound tool links.

**Inline sections** (components in `src/app/admin/`):

| Section | Component |
|---|---|
| Broadcast notification | `admin-broadcast.tsx` |
| People access | `admin-allowlist.tsx` |
| Data management | `admin-data-import.tsx` |

**Tool links out:** `/admin/brain` · `/admin/notification-health` ·
`/admin/perf` · `/admin/sales-queue`

> **Structural note.** `/admin/sales-queue` is linked from BOTH the Today
> dashboard (as a metric card) and System (as a tool). It is the only page with
> two different parents, and the two framings disagree about what it is.

**APIs:** `/api/admin/broadcast` (POST), `/api/admin/allowlist` (POST, PATCH),
`/api/admin/bulk-import` (POST).

---

## 3. The list-behind-a-card pages

Seven pages exist purely as the drill-down for a dashboard card. All import the
same `lib/admin-filters.ts`, which is why the count and the list can never
disagree.

| Page | Lines | Card it belongs to |
|---|---|---|
| `/admin/logged-today` | 61 | Logged today |
| `/admin/live-streaks` | 71 | Streaks alive |
| `/admin/reminders` | 111 | Remind to log today |
| `/admin/streak-breakers` | 79 | Shield used yesterday |
| `/admin/sales-queue` | 102 | Sales-ready to call |
| `/admin/wants-buddy` | 126 | Want a buddy |
| `/admin/going-cold` | 88 | Going cold (4+ days) |

Each has a WhatsApp one-tap action against the listed student. Each links back
to `/admin` only.

---

## 4. Orphan pages — nothing links to these

**Eleven pages have no inbound link from the nav or from any other page.** They
are reachable only by typing the URL.

| Orphan route | Lines | What it is |
|---|---|---|
| `/admin/health` | 159 | *"The morning screen… how many students came to study today"* |
| `/admin/mission` | 81 | Linked from `/admin` root only — hero button |
| `/admin/momentum` | 93 | Reachable only from `/admin/mission-control` |
| `/admin/lis-health` | 151 | Reachable only from `/admin/mission-control` |
| `/admin/mission-control` | 213 | Linked from `/admin` root only |
| `/admin/launch` | 183 | Linked from `/admin` root only |
| `/admin/sales` | 59 | Linked from `/admin` root only |
| `/admin/sales-performance` | 161 | Linked from `/admin` root only |
| `/admin/daily-pick` | 134 | Linked from `/admin` root only |
| `/admin/challenges` | 248 | Linked from `/admin` root only |
| `/admin/cat-leads` | 8 | Retired stub |

`/admin/health` is the starkest case: its own header calls it *"The morning
screen. Not Mixpanel, not Supabase — this."* and **nothing anywhere links to
it.**

---

## 5. Overlapping and duplicated surfaces

This is the section a reorganisation should act on first.

### 5.1 Four different "morning dashboards"

| Route | Self-described as |
|---|---|
| `/admin` | *"the morning action center (what needs me RIGHT NOW)"* |
| `/admin/health` | *"The morning screen… leads with the only question that decides whether CareerRai works"* |
| `/admin/launch` | *"THE launch dashboard — one page, opened every morning for the first 30 days"* |
| `/admin/mission-control` | (no header comment) |

Four screens claim the same job. Three of them are orphans.

### 5.2 Two funnel-analytics screens

`/admin/growth` (235 lines) and `/admin/analytics` (264 lines). No documented
boundary between them.

### 5.3 Three health screens

`/admin/health`, `/admin/notification-health` (403 — the largest page in the
panel), `/admin/lis-health`. Plus a fourth health API with no page:
`/api/admin/capability-health`, and a fifth: `/api/admin/video-health`.

### 5.4 Three sales screens

`/admin/sales` (59), `/admin/sales-queue` (102), `/admin/sales-performance`
(161). `sales-queue` additionally appears in two different parents.

### 5.5 Two streak screens

`/admin/live-streaks` and `/admin/streak-breakers` — these are genuinely
different filters and arguably correct, but they sit in the flat card list with
no grouping.

---

## 6. How the numbers are calculated

### 6.1 The single source of truth — `src/lib/admin-filters.ts`

The governing rule, quoted from the file:

> *"Every dashboard card is ONE precise filter. The count on the card and the
> list behind it come from the SAME function — the count is literally
> `list.length`, so they can never disagree. No card may include a student
> because they are 'similar' or 'might need attention'; membership is a
> deterministic WHERE clause."*

**Base population for every card:** `role='student'`, NOT a test account, NOT
the demo account. The flag checks are NULL-safe (`IS NOT TRUE`), because
Postgres `col <> true` silently drops NULLs — a real bug class this guards.

**Exported functions:**

| Function | Returns |
|---|---|
| `getRealStudents()` | The base population every other filter starts from |
| `getLoggedToday()` | Has a `daily_reports` row for today's log-day |
| `getStreaksAlive()` | `momentumStreak ≥ 1`; marks `active` via `liveStreak(...) ≥ 1` |
| `getRemindToLog()` | Onboarded, no log today |
| `getGoingCold()` | `daysSinceLastLog ≥ 4` |
| `getSalesReadyToCall()` | `engagement.sales_ready`, never called, still free |
| `getWantsBuddy()` | Declared yes at signup, free, unassigned |

**Consumed by:** `/admin` (root), and the seven list pages. Also by
`/api/admin/expedify-followups`.

### 6.2 The day boundary

The "log-day" is **3 AM IST**, not midnight — `getLogDateString()` in
`src/lib/streak-utils.ts`. A student logging at 1 AM is still on yesterday's
day. Every date-based count above uses it.

### 6.3 Streaks

Two distinct concepts, both in `src/lib/streak-utils.ts`:

- `liveStreak(current, lastLogDate)` — the honest streak: zero unless the last
  log was today or yesterday.
- `momentumStreak(...)` — includes days protected by a Momentum Shield.

The card says "Streaks alive (incl. 🛡️ shield-protected)" because it uses
`momentumStreak` for membership and `liveStreak` for the `active` flag.

### 6.4 Session windows

`src/lib/session-window.ts` is the single rule for "is this session still live",
used by both the student's app and the mentor's:

- `SESSION_GRACE_MS` = 1 hour — visibility after start
- `JOIN_OPENS_MINS_BEFORE` = 30 — Join button opens
- `RELEASE_AFTER_MS` = 1 hour — the slot frees for rebooking

### 6.5 Metric integrity

`/api/admin/metric-integrity` (GET) exists to cross-check that dashboard numbers
agree with the underlying tables. **It has no page** — nothing in the UI calls
it.

---

## 7. Complete API inventory

All under `src/app/api/admin/`. Thirty-one routes.

### 7.1 Backed by a visible admin screen

| Route | Verbs | Screen |
|---|---|---|
| `/allowlist` | POST, PATCH | System → People access |
| `/broadcast` | POST | System → Broadcast |
| `/bulk-import` | POST | System → Data management |
| `/assign-buddy` | POST | Students |
| `/mark-test` | PATCH | Students |
| `/challenges` | GET, POST | Challenges |
| `/coupons` | POST, PATCH | Coupons |
| `/scholarships` | POST, PATCH | Scholarships |
| `/refunds` | POST | Payments |
| `/payments-status` | GET | Payments |
| `/payouts` | POST, PATCH | Payments |
| `/dna`, `/dna/[studentId]`, `/dna/pending`, `/dna/pending/[id]` | GET, POST | Students / Brain |
| `/daily-pick-stats` | GET | Daily Pick |
| `/launch-metrics` | GET | Launch |
| `/leads-export` | GET | Leads |
| `/outreach` | POST, PATCH | Leads |
| `/notification` surfaces via `/notification-health` page | — | Notification health |

### 7.2 No admin screen calls these

| Route | Verbs | Note |
|---|---|---|
| `/capability-health` | GET | No page |
| `/video-health` | GET | No page — would have shown the two dead sessions |
| `/metric-integrity` | GET | No page |
| `/security-monitor` | GET | Runs hourly as a cron (`0 * * * *`), no page |
| `/integration-metrics` | GET | No page |
| `/buddy-integration` | GET, POST | No page |
| `/expedify-followups` | GET | No page |
| `/expedify-test` | GET | No page |
| `/kohli-push` | GET | No page |
| `/daily-status` | GET | No page |
| `/mentor-doors` | GET, POST | No page — the mentor-grant activation path |
| `/streak-restore-broadcast` | POST, GET | Reachable from the shield section only |

**Twelve of thirty-one admin APIs have no UI.** Some are cron-only by design
(`security-monitor`); most are surfaces that were built and never linked.

---

## 8. Where the code lives

```
src/app/admin/
├── layout.tsx              global admin shell
├── admin-nav.tsx           THE navigation (7 items)
├── page.tsx                Today dashboard (7 cards + 7 links)
├── admin-tabs.tsx          reusable tab switcher
├── admin-students-list.tsx  ─┐
├── admin-buddies-list.tsx    ├─ composed into /admin/students
├── admin-match-panel.tsx    ─┘
├── admin-broadcast.tsx      ─┐
├── admin-allowlist.tsx       ├─ composed into /admin/system
├── admin-data-import.tsx    ─┘
└── <32 route folders>

src/lib/
├── admin-filters.ts        ← every dashboard number
├── streak-utils.ts         ← log-day boundary + both streak models
├── streak-breakers.ts      ← the shield-used-yesterday filter
├── session-window.ts       ← session join/release timings
└── sales-queue.ts          ← lead ordering
```

**Layout consistency:** every page uses `mx-auto max-w-3xl px-4`, Georgia serif
headings, and stone/teal colours. Visual consistency is good; information
architecture is the problem.

---

## 9. Honest problem list for whoever reorganises this

1. **11 orphan pages.** Reachable only by typing a URL. Includes
   `/admin/health`, which describes itself as the single most important screen.
2. **7 nav items for 32 pages.** The nav covers roughly half the panel.
3. **Four competing "morning dashboards"** — `/admin`, `/admin/health`,
   `/admin/launch`, `/admin/mission-control` — all claiming the same job.
4. **Two funnel screens** (`growth`, `analytics`) with no documented boundary.
5. **Three health screens plus two health APIs with no screen.**
6. **Three sales screens**, one of which (`sales-queue`) has two parents that
   describe it differently.
7. **12 of 31 APIs have no UI.** `/api/admin/video-health` would have surfaced
   the two expired mentor sessions found on 9 Aug; nobody could see it.
8. **The root dashboard is doing two jobs** — a 7-card metric summary AND a
   7-link launcher for pages that belong in the nav.
9. **`/admin/cat-leads` is a retired 8-line stub** still occupying a nav match
   rule.
10. **Undocumented pages.** `/admin/growth`, `/admin/mission-control`,
    `/admin/mission`, `/admin/momentum`, `/admin/payments`, `/admin/sales`,
    `/admin/coupons`, `/admin/scholarships`, `/admin/lis-health`,
    `/admin/sales-performance` and `/admin/student/[id]` carry no header comment
    explaining what they are for — unusual in this codebase, where nearly
    everything else does.

### What is genuinely well built and should be preserved

- **`lib/admin-filters.ts` and the card→list contract.** The count IS the
  list's length. This is the strongest idea in the panel and any reorganisation
  should extend it rather than replace it.
- **The Money cluster** (payments ↔ coupons ↔ scholarships) is the only group
  that cross-links properly. It is the model for what the others should be.
- **Visual consistency** across all 32 pages.
- **The 3 AM log-day boundary**, applied uniformly.
