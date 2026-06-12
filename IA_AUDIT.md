# IA Audit — CareerRai Tracker

Date: 2026-06-12  
Rule: One page, one question. Every duplicate widget deleted.

## Product promise
> "CareerRai knows me better than I know myself."

---

## Pages — current vs target

| Route | Current | Target | Action |
|-------|---------|--------|--------|
| `/student/home` | Streak, heatmap, buddy signals, meeting widget, analytics cards, mock-drop intervention | **DELETE** — everything migrated to tracker | Remove or redirect → /student/tracker |
| `/student/tracker` | Hero card, puzzle card, todos, logging modal | **THE HOME** — greeting + CRS + days chip, hero, puzzle, buddy insight, session strip, progress snapshot | Redesign per spec |
| `/student/today` | Verbose form: quality/difficulty sliders, mood scales, notes, mock scores | **DELETE** — replaced by two-layer log in tracker | Remove link from tracker |
| `/student/reports` | Period selector, topic pie, mock line chart, mood trend, day-by-day expandable | **RENAME → /student/analysis** — percentile trend, error bucket trend, heatmap, strengths | Gutted and rebuilt |
| `/student/analysis` | Does not exist | **NEW** — interpretation only, no data entry | Create |
| `/buddy/students/[id]` | Mood charts, feedback history, session prompt | **DIAGNOSIS VIEW** — debrief summary, error buckets, needs-attention flags | Update |

---

## Widgets — keep / move / delete

| Widget | Currently on | Target location | Decision |
|--------|-------------|-----------------|----------|
| Streak + flame | Home, Tracker | **Tracker** | Keep, merge |
| Heatmap | Home | **Analysis** | Move |
| Buddy signal card | Home | **Tracker** (1 line) | Collapse to 1 line |
| Buddy feedback card | Home, Reports | **Tracker** (1 line), Buddy view | Collapse |
| Meeting widget | Home | **Tracker** (session strip) | Shrink |
| Progress snapshot (3 numbers) | Nowhere | **Tracker** | Build new |
| Topic pie chart | Reports | **Analysis** | Move |
| Mock line chart | Reports | **Analysis** (percentile trend) | Replace with section-wise trend |
| Mood trend chart | Reports | **DELETE** | Remove — not in spec |
| Day-by-day expandable | Reports | **DELETE** | Too much raw data |
| Error bucket chart | Nowhere | **Analysis** | Build new |
| Readiness test card | Home | **DELETE** | Remove |
| Any second log entry point | Home links to /today | **DELETE** | Single entry = LoggingModal only |

---

## Log — current vs target

| Field | Current | Target |
|-------|---------|--------|
| Hours | 0–4 pills | 0–6+ pills |
| Topics | LRDI, VARC, QA, Overall | VARC, DILR, QA, Mock, Revision |
| Mood/Energy | 🙏💪🙌 (no labels) | 🙏 Drained · 💪 Solid · 🔥 Sharp |
| Notes | Optional textarea | Keep (optional) |
| Mock expander | Percentile + time only | **REMOVE** — Mock debrief is Layer 2 |
| Error buckets | None | **Layer 2 only** — 5 tap-counters |
| Per-section stats | None | **Layer 2 only** — VARC/DILR/QA each: attempted, correct, time, percentile |
| Strategy note | None | **Layer 2 only** — "What will I do differently?" |
| Theme | White/light | **Dark theme** (zinc-950) |

---

## Data model changes

### Add: `mock_debriefs` table
- `id`, `student_id`, `taken_on` (date), `log_date` (date, FK day boundary)
- `varc`, `dilr`, `qa` — jsonb each: `{attempted, correct, time_min, percentile}`
- `error_buckets` — jsonb: `{conceptual, silly, time, panic, selection}` (counts, whole mock)
- `strategy_note` — text
- `overall_percentile` — integer (auto-computed from sections or entered)
- `created_at`

### Modify: log-daily API response
- Add `daily_nudge` field — avoidance detection (checks last 3–7 days, flags skipped sections)

### Modify: `LoggingData` interface
- Update hours max from 4 to 6
- Update topics list
- Update energy labels
- Remove mockScore (moved to Layer 2)

---

## Deletions (confirmed safe)

- `/student/today` page and route — replaced by two-layer log
- "Go to detailed form →" link in tracker page
- All info cards (🔥 Build Your Streak, ⚡ Buddy Sees Everything, 💪 Best Time) from tracker page — clutter
- Mood trend chart from reports — not in spec
- Readiness test card — not in spec
- Duplicate "Today" panel — home page being deleted anyway
- Any back-link from tracker to home (tracker IS home now)

---

## Manual test checklist (end)

1. Log Today (Layer 1) — hours=3, DILR+QA, Solid — submits, streak increments, confetti fires
2. Re-log same day — updates data, streak does NOT re-increment
3. Log at 2 AM — counts for previous calendar day (3 AM boundary)
4. Select Mock in sections — Layer 2 modal opens after Layer 1 submit
5. Layer 2 mock debrief — fill VARC/DILR/QA stats + 5 error buckets + strategy — saves
6. Analysis page — percentile trend visible, heatmap visible, error bucket trend visible
7. Buddy view — student with mock debrief shows diagnosis card with needs-attention flag
