# CareerRai — Design Audit

*Purpose: bridge document for Claude Design. Written so a visual designer who cannot see the codebase understands exactly what the app looks like today, where it breaks down, and what to improve — design-only, no feature changes.*

---

## 1. Current Design System

### 1.1 Global Foundation

**Background colour:** Warm off-white — `rgb(250 250 249)`, Tailwind's `stone-50`. Applies to every page body via a global CSS rule. All cards sit on this base.

**Primary text colour:** Near-black — `rgb(28 25 23)`, Tailwind's `stone-900`. All body copy, card headings, interactive text.

**Base font:** `system-ui, -apple-system, sans-serif` — no web font loaded. The system default on Android is Roboto; on iOS it is San Francisco. Pages therefore look slightly different on each platform.

**Anti-aliasing:** `-webkit-font-smoothing: antialiased` applied globally.

**No Tailwind config file exists.** The entire design system runs on Tailwind's default scale. There are no custom colour tokens, no custom spacing scale, and no theme extensions — everything is expressed through raw Tailwind class names.

---

### 1.2 Colour Palette (Every Colour in Use)

#### Primary / Action — Orange
| Tailwind class | Hex approx. | Used for |
|---|---|---|
| `orange-50` | #fff7ed | Light badge fills, urgency-banner background |
| `orange-100` | #ffedd5 | Heatmap studied cells, loading pulse, streak reward bg |
| `orange-200` | #fed7aa | Urgency banner border, heatmap border |
| `orange-400` | #fb923c | Heatmap hover ring |
| `orange-500` | #f97316 | Streak flame (medium), section accuracy bars |
| `orange-600` | #ea580c | Primary action buttons, selected chips, chat bubbles (sent), logo "राय", active nav, key CTAs |
| `orange-700` | #c2410c | Hover state for orange-600 buttons |
| `orange-900` | #7c2d12 | Streak hero dark card gradient start (medium streak) |

*Note: Confetti particles use the inline hex `#E8652D` which is visually between orange-500 and orange-600 — a one-off inconsistency.*

#### Secondary / Trust — Teal
| Tailwind class | Hex approx. | Used for |
|---|---|---|
| `teal-50` | #f0fdfa | Buddy signal card bg, AI briefing bg, student-waiting state |
| `teal-100` | #ccfbf1 | Loading skeleton in teal cards |
| `teal-200` | #99f6e4 | Buddy card borders, AI briefing borders |
| `teal-400` | #2dd4bf | Dismiss button text in AI panel |
| `teal-500` | #14b8a6 | Buddy avatar gradient |
| `teal-600` | #0d9488 | Buddy avatar gradient, sparkles icon, logo "Career" |
| `teal-700` | #0f766e | Primary teal button variant, toggle active colour, notification bell active, "Schedule" CTA in buddy header |
| `teal-800` | #115e59 | Teal button hover |

#### Neutrals — Stone (the backbone)
| Tailwind class | Hex approx. | Used for |
|---|---|---|
| `stone-50` | #fafaf9 | Page background |
| `stone-100` | #f5f5f4 | Unselected chips, period selector bg, slider labels |
| `stone-200` | #e7e5e3 | Card borders (universal), dividers, disabled inputs |
| `stone-300` | #d6d4d0 | Toggle inactive, placeholder avatar fills |
| `stone-400` | #a8a29e | Muted icons, chevrons, placeholder text |
| `stone-500` | #78716c | Section label text, sub-copy, timestamps |
| `stone-600` | #57534e | Form labels, icon buttons |
| `stone-700` | #44403c | Secondary text |
| `stone-800` | #292524 | Form label text, data values |
| `stone-900` | #1c1917 | Primary headings, primary button bg |

#### Status — Green / Success
| Tailwind class | Used for |
|---|---|
| `green-50` | "Session requested" confirmation bg |
| `green-100` | Green badge fill |
| `green-200` | "Session requested" border |
| `green-600/700` | Success icons, green badge text, confirmation text |
| `emerald-700` | "Responds within N hrs" text in profile buddy card |

#### Status — Amber / Warning
| Tailwind class | Used for |
|---|---|
| `amber-100` | Amber badge fill |
| `amber-600` | Emotional chip text ("feelings" count in reports) |
| `amber-700` | Amber badge text |
| `yellow-400` | Gold streak flame (14+ days), streak milestone progress bar |
| `yellow-200/100` | Streak milestone reward text on dark bg |

#### Status — Rose / Error / Urgent
| Tailwind class | Used for |
|---|---|
| `rose-50` | Urgent request card bg (buddy), error inline bg |
| `rose-200` | Urgent request card border |
| `rose-600` | Urgent section label, "View student" button, error text |
| `rose-700` | Hover on rose-600 button |
| `rose-800/900` | Urgent request student name text |
| `red-100` | Red badge fill |
| `red-700` | Red badge text |

#### Accent — Blue / Indigo / Purple
| Tailwind class | Used for |
|---|---|
| `blue-50/100` | "Waiting for buddy" card bg |
| `blue-600/700/900` | "Waiting for buddy" card text and icon |
| `purple-100` | Purple badge fill |
| `purple-700` | Purple badge text — used exclusively for the Demo mode badge |

---

### 1.3 Typography

#### Font Families
- **Body/system:** `system-ui, -apple-system, sans-serif` — all labels, body, buttons, badges
- **Editorial/serif:** `Georgia, serif` applied via inline `style` tag on major h1 headings on every screen. Not in Tailwind; applied ad hoc.
- **Monospace:** Tailwind's `font-mono` for streak numbers (text-4xl), test scores, stats, the OTP input field character tracking.

#### Size Scale in Use
| Class | Pixels | Used for |
|---|---|---|
| `text-[9px]` | 9px | Heatmap cell numbers (tiny, barely legible) |
| `text-[10px]` | 10px | Bottom-nav labels, section caps, micro timestamps |
| `text-[11px]` | 11px | Login fine print |
| `text-xs` | 12px | Badges, sub-labels, secondary info, buddy signal timestamps |
| `text-sm` | 14px | Body copy, form inputs, card body text, most interactive copy |
| `text-base` | 16px | Logo text, large action buttons |
| `text-lg` | 18px | Card section headings, buddy home greeting |
| `text-xl` | 20px | Sub-page headings with back-arrow (analysis, session history) |
| `text-2xl` | 24px | Main page h1 headings (Georgia serif) |
| `text-3xl` | 30px | Quick-log emoji mood options |
| `text-4xl` | 36px | Streak day count, buddy earnings amount |

#### Heading Style Pattern
All main page headings follow the same structure:
1. An `text-xs uppercase tracking-widest font-semibold text-stone-500` label ("History", "Diagnostics", etc.)
2. A `text-2xl font-bold text-stone-900 mt-1` heading in Georgia serif

**Exception:** Analysis page and session history use `text-xl` (not text-2xl) in a back-arrow layout row, which breaks the pattern visually.

**Exception:** Settings page uses `text-2xl sm:text-3xl` — not the standard 2xl — and skips the eyebrow label entirely.

---

### 1.4 Component Inventory

#### Card
Shape: `bg-white border border-stone-200 rounded-2xl`. No shadow; relies on the border alone for definition against the stone-50 page background. The contrast between white card and stone-50 background is subtle — barely visible on washed-out screens. Padding is always added inline (p-4, p-5, p-6 depending on context — no standard).

#### Badge
Pill-shaped: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium gap-1` (gap comes from icon children). Seven colour variants: blue, green, orange, red, purple, stone, amber. Always light-background/coloured-text (e.g. orange-100 bg + orange-700 text). Used heavily for status indicators, score bands, and section labels throughout. Consistent and well-implemented.

#### Button (formal component)
`rounded-xl`, `active:scale-[0.98]`, `transition-all duration-200`, `disabled:opacity-40`. Six variants:
- **primary:** stone-900 bg, white text. Used for confirm/submit actions.
- **secondary:** stone-100 bg, stone-900 text. Muted action.
- **ghost:** No bg, stone-700 text, stone-100 on hover.
- **accent:** orange-600 bg, white text. Primary CTA.
- **teal:** teal-700 bg, white text. Used in buddy-facing CTAs.
- **outline:** White bg, stone-300 border, stone-900 text.

**Gap:** The formal Button component is underused. Many interactive elements — the "Log Today" link in streak hero, all the quick-log chips, most form buttons in onboarding screens — are raw `<button>` or `<Link>` tags with manually inlined Tailwind classes, creating inconsistency.

#### Toggle
`h-6 w-11 rounded-full`. Off = stone-300; On = teal-700. Smooth translate-x animation. The toggle thumb is white, 4px smaller than the track. Looks clean.

#### Slider
Native HTML range input styled with `accent-{color}` class. Minimal visual differentiation — the range thumb and track are browser-default styled, only the accent colour changes. On Android this looks dated.

#### Topic Chip (onboarding / quick log)
`rounded-full px-4 py-2 text-sm`. Unselected: stone-100 bg, stone-700 text. Selected: orange-600 bg, white text, shadow-md. Clean pill toggle.

#### Avatar
Initials inside a coloured circle:
- Students: `bg-gradient-to-br from-stone-900 to-stone-700` (dark)
- Buddy: `bg-gradient-to-br from-teal-500 to-teal-600` (teal)
- No photo support, initials only.

#### Bottom Navigation
Fixed to bottom of viewport. Labelled icon tabs, `text-[10px] uppercase tracking-wider font-semibold`. Active item: icon scale-110, text stone-900. Inactive: stone-400. Badge count for chat unread overlays icon. Items vary by role (student vs buddy).

#### Streak Hero Card
The only prominently styled card. Uses `bg-gradient-to-r` with colour varying by streak days (stone-700→stone-800 for zero, orange-900→stone-800 for low, yellow-900→orange-900 for gold). Text is white throughout. Contains: custom flame SVG, large mono streak number, motivational message, progress bar for 30-day goal, optional milestone callout. Visually loud and information-dense.

#### Quick Log Bottom Sheet
Slides up from bottom with `animate-in slide-in-from-bottom-5`. `rounded-t-2xl`. Black/40 backdrop. Sticky header and sticky footer. Contains: 5-option hour grid, topic chip multiselect, 3-option mood grid (emoji + label). Three-segment orange progress strip at bottom of content. Submit button is large (py-4 px-6 text-lg). Feels like the app's most deliberately designed interaction.

---

### 1.5 Spacing & Layout

**Page container:** `max-w-2xl mx-auto px-4 py-6 pb-28` (the pb-28 clears the fixed bottom nav). All student and buddy pages use this. **Exception:** analysis page uses `max-w-md mx-auto` (narrower, inconsistent). Settings page uses `max-w-2xl mx-auto` without the layout wrapper.

**Card gaps:** `space-y-5` is the most common vertical rhythm between cards. Some screens use `space-y-4`, `space-y-6`. No single standard.

**Internal card padding:**
- Compact rows (admin list): `p-4`
- Standard content: `p-5`
- Generous content (profile card): `p-6` or `p-8`

**Grid layouts:** `grid-cols-2 gap-3` for summary metric pairs (reports page). `grid-cols-4` for baseline scores in dossier. `grid-cols-7 gap-1.5` for the 14-day heatmap. `grid-cols-5 gap-2` for quick-log hours.

---

### 1.6 Border Radius Usage
| Shape | Radius | Used for |
|---|---|---|
| Cards | `rounded-2xl` | All content cards |
| Buttons/inputs | `rounded-xl` | All interactive controls |
| Chips/badges | `rounded-full` | Badges, topic chips, avatars |
| Sheet top edge | `rounded-t-2xl` | Bottom sheet, onboarding modal |
| Heatmap cells | `rounded-md` | 14-day grid cells |
| Inner panels | `rounded-lg` or `rounded-xl` | Nested content boxes |

**Gap:** Some inline buttons use `rounded-lg` instead of `rounded-xl` (buddy panel action buttons: "View student", "Schedule session"). The buddy urgent requests panel and several buddy-dashboard elements use `rounded-lg` for action buttons, breaking consistency with the main button component.

---

### 1.7 Shadows & Elevation
The app almost entirely avoids drop shadows in favour of borders. The one exception is modals and sheets (`shadow-2xl`) and selected quick-log chips/submit button (`shadow-md`, `shadow-lg`). This flat approach works fine on stone-50 but makes it hard to layer interactive elements over content without visual confusion.

---

### 1.8 Motion / Interaction
- `active:scale-[0.98]`: universal on all interactive elements
- `transition-all duration-200`: standard on most
- `animate-pulse`: loading states (orange-100 circle, teal-100 rect)
- `animate-spin`: submit spinner
- `animate-in slide-in-from-bottom-5 duration-300`: quick-log sheet entry
- `transition-transform`: chevron rotation (open/close), toggle thumb slide
- Confetti: custom CSS `@keyframes confetti-fall` — 30 coloured particles fall from 50% top

---

## 2. Screen-by-Screen Inventory

### Screen 1: Login

**Primary purpose:** Authenticate an invited user via OTP.

**Layout:** Full-screen centred single-column. White card (`rounded-2xl shadow-2xl`) floats over the page. Behind it: two large blurred blobs (one orange-100, one teal-100) in the top-left and bottom-right corners as subtle colour wash.

**What's on screen:**
- Top: CareerRai logo (monogram image + "Career राय" text, teal+orange)
- Headline: `"Who's checking your CAT prep?"` — large, bold Georgia serif
- Sub-line: Smaller stone-600 text
- Refund badge: Dark-bg pill with white text stating the refund guarantee
- Email input field with Mail icon, stone-300 border, rounded-xl
- "Send code" button (stone-900 bg, full width)
- Fine print: `text-[11px] stone-400` — "No password needed"
- After OTP sent: Phase 2 shows OTP input (monospace tracking-[0.4em]), verify button, "Change email" and "Resend code" links

**Visual problems:**
- The gradient blobs are subtle to the point of being invisible on mid-range Android screens with lower contrast ratios. They add no meaningful visual character.
- The refund badge, the headline, and the sub-line all use similar font sizes and weights — there is no clear visual hierarchy peak. The headline should dominate much more.
- The stone-900 button ("Send code") is the same colour as the text. A student's eye can't immediately identify what to do first.
- The OTP phase feels abrupt — no progress indication that this is step 2 of 2.
- The trust copy ("Backed by IIM alumni", "CAT 99.2%ile buddy") is not present on the screen at all — the only trust signal is the small refund badge text.

---

### Screen 2: Onboarding Modal (8 Screens)

**Primary purpose:** Collect student profile data needed to match them with a buddy and personalise their experience.

**Layout:** Full-screen overlay (black/50 backdrop). White modal card `max-w-md max-h-[90vh] rounded-2xl` centred. Fixed header with title + X button + 8-segment progress bar + "Screen N/8" counter. Scrollable content area. Fixed bottom navigation (Back / Next buttons) — except screen 0 which manages its own navigation.

**Screens:**
1. **Social proof** — Scrollable list of "other students' journeys" (text testimonials). Warm tone. No visual weight.
2. **Dream Colleges** — Grid of IIM/college name chips (stone bg → orange-600 selected). Tap to toggle. Minimum 1 required.
3. **Exam Context** — Multiple questions: repeater/first-timer, category, target exam, attempt year, target percentile, study hours. Uses 2-column button grids and numeric inputs.
4. **Meet Your Buddy** — Teal-themed card showing buddy name, college, percentile. Static info screen.
5. **Your Baseline** — Sliders (native range inputs) for VARC, DILR, QA self-assessment + percentile number input.
6. **About You** — Name, phone, college (required), working professional vs student toggle, year of study or work experience months, coaching enrolled toggle.
7. **Daily Commitment** — Slider for daily study hours target.
8. **Log Day 1** — Variant of the quick-log interaction inline within the modal.

**Visual problems:**
- The 8 horizontal progress bars are 4px tall and 1px-gapped — at 360px width they are barely distinguishable. The "Screen 3/8" counter is fine, but the visual progress element doesn't carry enough weight.
- The modal header and footer are both sticky, leaving only ~55% of viewport height for content on small phones. Screen 3 (Exam Context) has 6+ form elements — it requires heavy scrolling inside an already constrained area.
- The bottom fixed nav (Back / Next) duplicates the "Almost there →" button already inside each screen component — two CTAs exist simultaneously on most screens, which is confusing.
- All 8 screens use the same plain white background with no visual variation — the experience feels like filling out a form, not a journey.
- The college grid on Dream Colleges (screen 2) uses `gap-2` wrapping chips but the chips have no visual category grouping. There are no sub-headings (IIMs vs IITs vs others).

---

### Screen 3: Student Home / Daily Tracker (the main screen)

**Primary purpose:** Get the student to log today's progress.

**Layout:** Uses the shared student layout wrapper (max-w-2xl, pb-28). The page is a long vertical stack of cards with `space-y-5`.

**What's on screen (from top):**
- Greeting section: "Good morning, [Name]" with "X days to CAT" chip (orange-100 bg)
- Anchor line: Dream college + current percentile vs target (horizontal comparison)
- Streak hero card (dark gradient, flame SVG, streak count, progress bar, motivational copy)
- AnchorLine component (trajectory visual)
- Pending debrief card (if a mock was taken but not debriefed — shows orange-bordered card)
- Upcoming session widget (if buddy session scheduled)
- Urgent help banner (collapsible, orange bg)
- DailyTrackerApp — contains: mission card, heatmap card (14 days), main "Log Today" / "View Log" CTA
- Buddy signal card (latest feedback from buddy in teal-themed card)

**Visual problems:**
- The streak hero card and the mission card are both large, dark/bold featured sections. They compete with each other rather than establishing a clear hierarchy. The student can't tell which action is the most important.
- The "Log Today" button — the most critical daily action — is buried four or five cards down the page. It requires scrolling past the streak card, the anchor, the debrief alert, and the session widget before reaching it.
- The heatmap cells are 14 tiny squares with `text-[9px]` numbers inside them. On a 360px device these cells are approximately 40px × 40px but the inner text is unreadable without zooming.
- The greeting ("Good morning") and the days-to-CAT chip sit in plain text with no visual enclosure — they disappear into the page.
- The buddy signal card uses a teal-to-white gradient background that clashes gently with the global stone-50 page background. The transition looks slightly off.
- "Add to Home Screen" banner (if shown) inserts a generic UI strip between content sections, breaking the visual flow.

---

### Screen 4: Quick Log Sheet (Bottom Sheet)

**Primary purpose:** Log today's study hours, topics, and mood in under 30 seconds.

**Layout:** Slides up from bottom edge. `rounded-t-2xl bg-white shadow-2xl`. Sticky header (Quick Log + X close). Scrollable content with three sections. Sticky submit footer (orange gradient-to-white backdrop).

**What's on screen:**
- Hours studied: 5-button grid (`0 hrs` to `4+ hrs`), unselected = stone-100, selected = orange-600 with shadow-md
- Topics: Pill chips multi-select (VARC, DILR, QA, Revision, Mock)
- How did it go: 3-wide grid, each showing a large emoji (🙏 💪 🚀) at text-3xl + label
- Three-segment progress strip (orange when filled, stone-200 when empty)
- Submit button: large orange-600 with Check icon, shadow-lg

**Visual problems:**
- The mood selection emojis are text-3xl (30px). On a 3-column grid this is playful but the visual weight vastly outweighs the hour buttons and topic chips. The three interactions feel like they belong to different design systems.
- The submit button footer uses `from-white to-white/80` gradient — this means the gradient is flat (both stops are white), giving a slightly confused visual effect.
- On very small phones (360px, short height) the bottom sheet needs to scroll internally, and the sticky submit button overlaps the progress strip.

---

### Screen 5: Reports / History ("Day by day")

**Primary purpose:** Review study history over 7, 10, or 30 days.

**Layout:** Standard page with eyebrow label + Georgia serif h1. Period selector (segmented control: 7 / 10 / 30 days). 2×2 grid of metric cards. Expandable day-by-day list.

**What's on screen:**
- "Day by day" heading
- Period selector: rounded-xl container, white active tab with shadow-sm, stone-600 text on inactive
- 4 summary cards (grid-cols-2): Total study hrs, Mock tests, Avg mock score, Days submitted — each has text-xs uppercase label + text-2xl mono number
- Expandable day cards: Date (weekday abbr + day number in a 40px column), study hrs + topics truncated, badges for mock/mood

**Visual problems:**
- The 4 summary metric cards are identical in visual treatment — the same white card, same text size, same layout. None indicates which metric matters most to the student. Total study hours and days submitted are arguably the most motivating — they should visually lead.
- The day card list has no visual differentiation between days with heavy study (4 hrs) and light study (0.5 hrs). The only signal is the number inside — no colour coding, no bar, no visual weight.
- Expanded day card shows raw data fields (topics as comma-separated text, emotional chip count) with no visual structure — it reads like a database row, not a human reflection.
- The `ChevronDown` rotation animation when expanding is the single micro-interaction highlight — it works well, but the expanded content beneath it is underwhelming.

---

### Screen 6: Analysis ("What the data says")

**Primary purpose:** Show mock debrief trends — percentile trajectory, section accuracy, error buckets.

**Layout:** Inconsistent with the rest of the app. Uses `min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6` as an inline layout (not the shared layout wrapper), `max-w-md mx-auto` container, and a back-arrow row at the top instead of the standard sticky header + logo.

**What's on screen (when data exists):**
- Back arrow + "Analysis" heading (text-2xl Georgia) + sub-copy
- Percentile trend chart (Recharts line chart, lazy-loaded, h-48)
- Section accuracy bars (VARC / DILR / QA — horizontal orange progress bars)
- Error bucket bar chart (Recharts, h-44)
- Strategy note from last mock (teal-50 bg block with italic text)
- Per-mock debrief card list (expandable, score + error bucket breakdown)

**Empty state (no debriefs yet):**
- Centered white card with 📈 emoji + two lines of text
- Three dashed-border rectangles as "placeholder slots" showing what will appear

**Visual problems:**
- This page's layout container is `max-w-md` while every other page is `max-w-2xl`. Visually it looks noticeably narrower — like a different app.
- The back arrow + h1 header is a custom layout that doesn't match any other screen. There is no Logo, no role badge, no notification bell — the header context disappears entirely.
- The Recharts line chart uses Recharts defaults — no custom styling to match the brand. The lines and tooltip colours are stock Recharts blue and grey. They don't match orange/teal.
- The empty state "placeholder slots" use dashed-border rectangles with only text labels inside. They communicate what's coming but look like unfinished wireframes.
- The strategy note (teal block) and the section accuracy (white card) look similar in visual weight even though the strategy note is editorial and the section accuracy is data.

---

### Screen 7: Chat

**Primary purpose:** Text message exchange between student and their assigned buddy.

**Layout:** Uses a fixed-position panel (`position: fixed, top: 6rem, bottom: 4.5rem`) — not the shared scroll layout. Fills the space between the app header and the bottom nav. No page scroll — the message list scrolls inside the panel.

**What's on screen:**
- Fixed header: Other person's name in Georgia serif + optional subtitle
- Scrollable message list: bubbles right-aligned (mine: orange-600 bg, white text) and left-aligned (theirs: stone-100 bg, stone-900 text)
- Timestamp in `text-[10px]` below each bubble (orange-100 for mine, stone-400 for theirs)
- Composer: textarea (rounded-2xl border) + circular orange-600 send button (rounded-full w-11 h-11)
- "Get reply facts" button (buddy only, teal text) — triggers AI fact panel
- AI fact panel (teal-50 bg, teal-200 border) with pre-formatted bullet text

**Visual problems:**
- The orange-600 chat bubble for sent messages is the same colour as the primary action buttons everywhere else. This means the student's own words sit in the same visual colour as "do something now." It feels slightly aggressive for a message — a softer warm tone (stone-800, or a lighter orange-tinted bg) would feel more conversational.
- The fixed-position layout uses hardcoded `top: '6rem'` and `bottom: '4.5rem'`. On phones where the browser's bottom bar takes extra space, or where the nav height differs, the chat is clipped or overflows. This is a mobile layout fragility.
- The empty state ("Say hi to your buddy 👋") is just centred text — no illustration, no visual enclosure to invite action.
- When no buddy is assigned, the waiting state is a stone-50 bordered box with plain text. It communicates the state but doesn't motivate the student to keep logging while they wait.

---

### Screen 8: Buddy Page (Student-Facing)

**Primary purpose:** Student views their buddy's credentials, upcoming sessions, and submits session requests.

**Layout:** Standard student layout. Space-y-5 stack of sections.

**What's on screen (typical):**
- Upcoming session card (if scheduled): shows session title, date, time, Google Meet link button
- Buddy credentials: teal-600 avatar with initials, buddy name + college badge + percentile badge + bio quote in italic
- "Verified response time" in emerald text
- Urgent help banner (collapsible, orange-50, PhoneCall icon)
- Voice notes section (if buddy has sent audio)
- Session request panel with upcoming/past sessions list

**Visual problems:**
- The buddy card has 3 distinct sub-sections (identity, bio quote, response time) but no visual grouping — they are stacked raw rows inside a single card without internal dividers. On a wide card this works; at 360px it reads as a wall of text.
- The buddy bio quote uses `border-l-2 border-teal-300 pl-3 italic` — a classic blockquote treatment, but the teal-300 left border is very thin and light, making the quote indistinguishable from regular body text.
- The voice note player component (when a buddy has sent audio) has no described visual design — it renders inside a teal card. The play/pause interaction is audio-only with no waveform visualisation, which is fine but makes the card feel sparse.
- The urgent help banner overlaps semantically with the session request panel below — both serve "I need help from my buddy." The two sections aren't clearly separated in purpose from the student's perspective.

---

### Screen 9: Student Profile ("You")

**Primary purpose:** View personal stats, manage buddy connection, configure notifications.

**Layout:** Standard student layout. Long stack of cards.

**What's on screen:**
- Avatar card: large initials circle (stone-900 gradient), name, email, exam target badge, "Edit profile" trigger
- Progress card: 3-column metric grid (Days logged, Best streak, Latest %ile) + orange progress bar + share button
- Dream Colleges card (editable)
- Membership card (conditional on payments feature flag — shows subscription plan + upgrade options)
- Refund guarantee card (conditional — progress bar showing 20-day threshold)
- Buddy trust card: buddy avatar, name, badges, bio, response time
- Notification preferences (toggle for daily reminder + toggle for email)
- Push notification toggle card
- "Member since" card (date)
- Logout button

**Visual problems:**
- The profile page is the longest screen in the app — 8-10 cards stacked. On a 360px device this requires significant scrolling. There is no visual grouping of related cards (stats / settings / buddy / account).
- The membership card renders conditionally — when payments are disabled it simply doesn't appear, leaving a gap in the page structure that makes the layout feel inconsistent across users.
- The push notifications card and the notification preferences card are two separate back-to-back cards for one conceptual topic. They could be one card. The visual separation makes the section feel longer than it is.
- The "Member since" card is a full white card for a single date string. This is very low information density.
- The logout button sits at the very bottom — good placement, but it's unstyled beyond being a red text button. There is no clear visual separation from the account info above it.

---

### Screen 10: Diagnostics / Exams ("Where do you stand?")

**Primary purpose:** Let the student take the CAT Readiness Test (35 questions) and see their history.

**Layout:** Standard student layout.

**What's on screen:**
- Eyebrow "Diagnostics" + "Where do you stand?" Georgia serif h1 + sub-copy ("Self-assessment · results are private")
- Test card: test name, description, orange-100 bg icon (Brain icon in orange-600), last result display, "Take test" button
- If last result exists: shows date, percentile, section scores inside a stone-50 rounded-xl inner panel
- Test history list below the card
- MockDropIntervention overlay if a score drops >8 points

**Visual problems:**
- There is only one test listed, yet the screen has page-level headings and full card treatment as if there were many. The layout feels oversized for one item.
- The Brain icon sits in an `orange-100 w-10 h-10 rounded-xl` box — fine, but this is the only screen that uses this icon-in-box pattern. It's a one-off visual element.
- When a previous result exists, scores are shown in a nested `bg-stone-50 rounded-xl` panel inside the card. Nesting (stone-50 inside white card) creates a barely visible layered box — the inner panel has no border so its edges are unclear.
- The "Take test" button uses the formal `Button` component (accent variant, orange-600). Good. But the disabled state during the test is not visually communicated — when the TestRunner overlay appears, the underlying page is not dimmed.

---

### Screen 11: Buddy Dashboard (Home)

**Primary purpose:** Give the buddy an overview of their students and surface urgent actions.

**Layout:** Same structure as student (max-w-2xl, Logo header, BuddyBottomNav), but with `space-y-4`. Not wrapped in the standard layout page shell — it's a more custom structure.

**What's on screen:**
- Greeting row: "Welcome back [FirstName]" with inline action buttons (Schedule → teal-700, Settings gear, LogOut) right-aligned
- Next session widget (MeetingWidget)
- Google Calendar connect CTA (if not connected — teal-themed card)
- Urgent session requests panel (rose-50 bg, rose-200 border, if any pending)
- "Quick voice message" section header (text-[10px] uppercase bold stone-500) + white rounded-xl card with recorder
- "Student voice notes" section header + white rounded-xl card
- BuddyTriageView — student stat tiles + urgency-sorted student cards

**Visual problems:**
- The greeting row with name + three icon buttons feels like a sub-header within the page, not part of a consistent layout. The Settings icon and LogOut icon sit immediately next to the page heading with very little visual separation.
- Section headers use `text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1` — this is the smallest possible text. These headers barely register visually.
- "Quick voice message" and "Student voice notes" are two sequential sections with nearly identical visual treatment (both white rounded-xl cards, same header style). Without stronger visual differentiation or grouping, they blur together.
- The triage view (student cards) uses a custom design not consistent with the admin students list — different card layouts for the same student data depending on who's viewing.

---

### Screen 12: Buddy Student Detail

**Primary purpose:** Buddy views a single student's full profile, recent logs, and writes feedback.

**Layout:** Own scroll layout (not the standard buddy layout — no bottom nav visible on detail pages). Contains sections: student profile dossier, AI briefing panel, feedback form, charts.

**What's on screen:**
- Student name, college, exam target badges
- AI Briefing Panel: teal-50 bg, `rounded-2xl border-teal-200`, Sparkles icon, "AI Facts Summary" label, refreshable bullet text
- StudentDossier: About / Exam goals / Dream colleges / Baseline sections (icon + label + value rows)
- Feedback form: Multiple SliderInput components (accent colours: orange, teal, rose) and ToggleInput components
- Student charts (Recharts)

**Visual problems:**
- The AI briefing panel uses `whitespace-pre-line` text inside a `<pre>` tag with `font-sans` override. This results in monospace spacing artifacts in the text rendering — the text can appear with irregular spacing depending on the browser.
- The SliderInput uses native HTML range inputs. On Android, the range thumb is a circle rendered by the browser — styling varies significantly across devices. The brand accent colours apply only to the filled track on supporting browsers.
- The Row component in StudentDossier has a fixed 32px label column (`w-32`) — on 360px this leaves only ~175px for the value, which is fine but tight for longer values.
- The multiple feedback sliders (5+ sliders) stacked vertically make the form feel very long. There is no visual grouping or section break between different feedback dimensions.

---

### Screen 13: Buddy Earnings

**Primary purpose:** Buddy sees their monthly earnings accumulating in real time.

**Layout:** Standard layout, space-y-5.

**What's on screen:**
- "Earnings / Your payouts" Georgia serif heading
- If payout configured: dark gradient card (`bg-gradient-to-br from-stone-900 to-stone-800 border-0`) with "Earned so far this month", large ₹XXXX font-mono number in white, month progress bar (teal-400 fill), payout date
- Per-student breakdown
- Payout history table (past months, amounts, paid/pending badges)
- If no payout configured: centred card with IndianRupee icon (stone-300) and copy

**Visual problems:**
- The dark gradient "earned so far" hero card (stone-900 bg) uses the same dark treatment as the streak hero card. When both appear on different pages, it creates an unintentional visual rhyme that makes them feel related in brand logic but they serve very different functions.
- The teal-400 fill colour on the dark card background is one of the lighter teal tones — it has lower contrast against stone-800 and may be hard to read on dim screens.
- The payout history table uses plain `<div>` rows without clear cell borders or zebra striping — period, amount, and status are packed horizontally and become hard to scan as rows stack.

---

### Screen 14: Buddy Trends

**Primary purpose:** Show weekly study-hours trend across all assigned students.

**Layout:** Standard. One Recharts multi-line chart + summary table.

**What's on screen:**
- "All students / Performance trends" heading
- Recharts multi-line chart: each student gets a line colour from a hardcoded array `['#1c1917', '#ea580c', '#0f766e', '#7c3aed', '#be123c']`. No chart legend formatting — defaults to Recharts legend.
- Per-student summary row: name, avg study, avg confidence, days submitted

**Visual problems:**
- The first colour in the line chart array is `#1c1917` (stone-900) — near-black. On a white chart background this is fine, but stone-900 as a data line is the same colour as primary text, making it feel like a label rather than a data line.
- The chart uses Recharts default tooltip and legend styling. The font, colour, and spacing don't match the app's typography.
- When only one student exists, the chart shows a single line but the page layout still occupies the same space designed for multiple lines — sparse and unbalanced.

---

### Screen 15: Admin Panel

**Primary purpose:** Founder/admin sees all students and buddies, assigns buddies, monitors alerts.

**Layout:** Not the standard student/buddy layout — the admin has its own tabbed layout. Wider max-w-3xl container. Tabs for Students, Buddies, Payments (conditional).

**What's on screen:**
- KPI strip: 4 metric tiles (total users, today's logs, on-track count, red flags count)
- Tabs: Students / Buddies / Payments
- Students tab: Scrollable list of StudentStat cards. Each card shows initials avatar, name, score badge, today badge (green CheckCircle or amber Clock), onboarding status, buddy dropdown (native `<select>`), expand chevron. Expanded: full StudentDossier.
- Pending students: Dashed-border stone-50 cards for invited-but-never-logged-in users.
- Buddies tab: Buddy performance rankings, SLA metrics
- Payments tab: Refund request management

**Visual problems:**
- The native `<select>` dropdown for buddy assignment uses browser defaults with only `rounded-xl px-3 py-1.5` custom styling. On Android the select looks entirely browser-native — inconsistent with everything else on the page.
- The KPI tiles (4-column grid) have no visual hierarchy — all four numbers appear at the same size and weight. Red flags count (urgent) looks identical to total users (informational).
- The pending students section uses dashed borders and `bg-stone-50/60` — subtle differentiation from active students, but at a glance they look like broken cards rather than intentionally "invited" state.
- The expand/collapse chevron is a small `p-1.5` button on the far right — on mobile the tap target is around 32px, which is below the recommended 44px minimum.

---

### Screen 16: Settings

**Primary purpose:** Google Calendar integration.

**Layout:** Full standalone layout (`min-h-screen bg-stone-50 p-4 sm:p-6 max-w-2xl mx-auto`) — NOT the shared student layout. No Logo, no bottom nav wrapper. Looks like a different app.

**What's on screen:**
- "Settings" heading (text-2xl sm:text-3xl, no eyebrow label)
- A white `rounded-lg border border-stone-200` container card (note: rounded-lg, not rounded-2xl)
- "Calendar Integration" sub-section with paragraph description and connect/disconnect button

**Visual problems:**
- This is the most visually inconsistent screen in the app. It has no Logo, no bottom nav context, no Georgia serif eyebrow + heading pattern. The heading is `text-2xl sm:text-3xl` (unique in the app). The card uses `rounded-lg` not `rounded-2xl`.
- The page feels like a leftover from an earlier version of the app that hasn't been brought into the current design system.
- There is only one setting. A full page layout for one toggle feels architecturally oversized.

---

## 3. Ranked Design Problems

### Priority 1 — Most Impactful

**1. The primary daily action is buried (Home screen)**
The "Log Today" button — the single most important daily action in the app — appears four to six cards down the home screen, behind the streak hero, the anchor line, the debrief prompt, and the session widget. By the time the student reaches it, they've already scrolled past half the page. The entire home screen hierarchy needs to place the log CTA as the first clear call to action, not the fifth.
*Screens affected:* Student Home / Daily Tracker
*Design goal:* Make the log CTA the visual anchor at the top of the home screen. Everything else is supporting context.

---

**2. All cards have identical visual weight (universal)**
Every card uses `bg-white border border-stone-200 rounded-2xl`. There is no elevation, no colour coding, no scale variation. A streak alert, a buddy message, a metric summary, and a notification — all look the same. The eye has no visual hierarchy to navigate. Featured content cannot be distinguished from supplementary content.
*Screens affected:* All screens
*Design goal:* Introduce a clear tier system: featured/hero cards (bolder treatment), standard content cards (current white), and secondary/supplementary cards (lighter, more compact). Use colour, border weight, or background tone to signal importance.

---

**3. Settings page is completely off-brand**
Settings uses a different layout, different heading hierarchy, different border radius, no logo, no bottom nav. It looks like a different product was accidentally included.
*Screens affected:* Settings
*Design goal:* Rebuild the settings page using the standard student layout (Logo header, bottom nav, Georgia serif eyebrow + h1, rounded-2xl cards).

---

**4. Analysis page breaks the layout contract**
Analysis uses `max-w-md` instead of `max-w-2xl`, has a back-arrow custom header without Logo, and a `min-h-screen bg-gradient-to-b` wrapper that duplicates the global background. The page looks noticeably narrower and structurally disconnected from the rest of the student experience.
*Screens affected:* Analysis
*Design goal:* Move analysis into the standard student layout wrapper (shared header, bottom nav). Replace the back-arrow header with the standard eyebrow + Georgia serif h1 pattern. Use max-w-2xl consistently.

---

### Priority 2 — Significant

**5. Chat sent-message bubble colour is too aggressive**
Sent messages appear in orange-600 — the same colour as "do something now" buttons across the app. This makes personal messages feel like call-to-action prompts rather than conversational text. The colour works for a send button; it doesn't work as the dominant colour in a message thread.
*Screens affected:* Chat
*Design goal:* Replace orange-600 chat bubbles with a softer warm dark (stone-700 or stone-800) or a warm light (stone-100 in reverse with stone-900 text). Keep orange-600 only for the send button itself.

---

**6. Heatmap cells have unreadable text**
The 14-day heatmap grid uses `text-[9px]` numbers inside small squares. At 360px, each cell is roughly 40px wide and the text inside it is 9px — invisible without zooming. The hover ring (`hover:ring-2 hover:ring-orange-400`) only works on pointer/desktop devices.
*Screens affected:* Student Home (HeatmapCard)
*Design goal:* Remove the number from inside the cell. Use only the cell background colour intensity to convey study hours (darker orange = more hours, stone = none). This is a standard GitHub-contribution-graph pattern — no number needed.

---

**7. Bottom nav labels are too small on mobile**
`text-[10px] uppercase tracking-wider` is the smallest readable size for static text — for interactive labels on small phones it is too small to read comfortably, especially for users with lower vision. 10px all-caps with wide tracking pushes the limits.
*Screens affected:* Bottom navigation (all student and buddy screens)
*Design goal:* Increase to `text-[11px]` or `text-xs (12px)`. Keep uppercase tracking but reduce tracking-wider to tracking-wide. The icon is the primary identifier; the label confirms it.

---

**8. Streak hero card has information overload**
The streak hero card contains: a large flame icon, the streak number (text-4xl), a status message, a reminder line, a 30-day progress bar, a milestone achieved panel, a milestone-progress copy line, and a daily reminder text. That is 7-8 distinct content elements inside one card. The card is doing the work of a separate section.
*Screens affected:* Student Home
*Design goal:* Simplify to three elements: the streak number, a one-line status message, and one progress indicator. Move the 30-day goal and milestone reward into a separate small callout or modal, not permanently embedded in the main card.

---

**9. Section headers have two conflicting sizes**
The standard section header pattern is `text-xs uppercase tracking-widest font-semibold text-stone-500`. The buddy home page uses `text-[10px] uppercase tracking-widest font-bold text-stone-500`. Same visual purpose, two different sizes and weights.
*Screens affected:* Buddy home, multiple student screens
*Design goal:* Standardise to a single section header class: `text-xs font-semibold uppercase tracking-widest text-stone-500`. One rule, applied everywhere.

---

### Priority 3 — Polish & Consistency

**10. Empty states have three different visual patterns**
- Some use an emoji + centred text in a white card
- Some use dashed-border `border-2 border-dashed border-stone-200` rectangles
- Some use plain `text-center py-12 text-stone-400 text-sm`
*Screens affected:* Analysis (placeholder slots), Admin Students tab (no students), Chat (no messages), Reports (no data), Buddy Earnings (no payout configured)
*Design goal:* Standardise on one empty-state pattern: a white card with a subtle icon (stone-200 colour), a short headline, and a one-line sub-copy. No dashed borders (they look like wireframe artefacts).

---

**11. Native `<select>` in admin student cards**
The buddy-assignment dropdown in each admin student card uses a plain browser-native `<select>` element. On Android this triggers the platform's native picker, which looks completely out of place alongside the app's custom UI components.
*Screens affected:* Admin Students tab
*Design goal:* Replace with a custom select component matching the app's rounded-xl border style, or visually style the select to be less obviously browser-native (border-stone-300, rounded-xl, chevron icon overlaid).

---

**12. Onboarding progress bar is too small**
8 horizontal bars each 1px apart at 4px height inside a max-w-md modal. The "Screen 3/8" text counter below is more legible than the bars themselves. At 360px the bars are each about 40px wide and 4px tall — they register as a decoration rather than a progress indicator.
*Screens affected:* Onboarding modal (all 8 screens)
*Design goal:* Increase bar height to 6-8px. Add 2-3px gap. Consider using a single horizontal progress bar (0–100%) instead of 8 segments.

---

**13. Recharts charts use stock styling**
The percentile trend chart (Analysis) and the buddy trends chart use Recharts defaults: blue/green/red default colours, default tooltip font (12px Roboto-like), default legend. They don't match the brand.
*Screens affected:* Analysis, Buddy Trends
*Design goal:* Apply brand colours to chart lines (orange-500 for overall, teal-600 for VARC, stone-600 for DILR, indigo-600 for QA). Style the tooltip to match app font and colour (stone-900 text, white bg, stone-200 border, rounded-xl). Remove Recharts' default legend; use a custom legend below the chart.

---

**14. Profile page is a single long scroll with no visual grouping**
The student profile page has 8-10 sequential cards with no section separators or visual grouping. Progress stats, buddy info, membership, notifications, account settings are all presented at equal visual weight in a single vertical column.
*Screens affected:* Student Profile
*Design goal:* Group cards into 2-3 labelled sections (e.g. "Your progress" / "Your team" / "Account"). Use `text-xs uppercase tracking-widest` section dividers between groups to break the scroll and help the eye navigate.

---

**15. Login page lacks trust and hierarchy**
The headline "Who's checking your CAT prep?" and the email input are the same visual weight. There is no obvious visual flow from "read headline → understand value → take action." The refund badge and value props are compressed into fine print. A student arriving for the first time has no immediate reason to trust the product.
*Screens affected:* Login
*Design goal:* Increase headline size and weight to dominate the above-the-fold area. Add 2-3 trust signals (buddy college/percentile, testimonials) as scannable visual elements above the form. Make the CTA button orange (not stone-900) so it reads as the primary action at a glance.

---

## 4. Brand + Audience Context

**Product:** CareerRai. An accountability app for CAT exam aspirants, pairing them 1-on-1 with IIM alumni "buddies" who review daily logs, send voice notes, and conduct guidance sessions. Anti-coaching: the model is "elder sibling who made it," not "coaching class teacher."

**Tone:** Warm, direct, dost-wala (friend-like). Not corporate. Not congratulatory and fake. Honest — a 0-day streak shows stone-400, not a consolation emoji. The writing voice is concise and direct ("Who's checking your CAT prep?", "What the data says about you", "Day by day").

**Brand colours:**
- Orange: `#E8652D` / Tailwind `orange-600` (#EA580C) — energy, accountability, action. The primary colour.
- Teal: `#2A9D8F` / Tailwind `teal-700` (#0F766E) — calm authority, the buddy relationship, trust. The secondary colour.
- Navy/Stone: `#1A1A2E` / Tailwind `stone-900` (#1C1917) — seriousness, grounding, data.
- Success Green: `#27AE60` / Tailwind `green-600` — progress, submission confirmed.

**Audience:**
- Indian CAT aspirants, 20–27 years old
- Stressed, competitive, comparing themselves to peers constantly
- Phone-first, predominantly Android, mid-range devices (360–390px viewport, lower contrast screens)
- Comfortable with apps (Unacademy, YouTube, Instagram) but expect polish
- Self-doubt is a real emotion — the design must feel reassuring without being patronising

**Feeling target:** Focused, calm, trustworthy, motivating. NOT busy. NOT childish. NOT corporate SaaS.

**Design personality reference:** Closer to Duolingo's warmth + Notion's calm minimalism than any Indian edtech. The Georgia serif headings are the single strongest brand differentiator — preserve and amplify this.

---

## 5. Constraints for the Designer

**These are non-negotiable:**

1. **No feature changes.** Do not add screens, flows, or interactions. Visual/hierarchy/spacing/typography/colour improvements only. Every screen listed above already exists — the designer's job is to make it look better, not different.

2. **Brand colours are fixed.** Orange (`#EA580C`), Teal (`#0F766E`), Stone (near-black `#1C1917`). Shades within each family can be refined but the palette cannot be replaced or expanded with new hues.

3. **Mobile-first, 360px viewport is primary.** Every design decision must work on a 360px wide screen. Desktop and tablet are secondary. No critical information should require horizontal scroll or be unreachable at 360px.

4. **Tailwind + shadcn/ui only.** The implementation uses Tailwind utility classes. The designer should specify colours, spacing, and sizes using Tailwind tokens (e.g. `stone-200`, `orange-600`, `rounded-xl`), not arbitrary values. Custom CSS should be minimal.

5. **Georgia serif headings stay.** The `font-family: Georgia, serif` h1 headings are the app's strongest brand mark. Every screen uses them. They must be preserved.

6. **No dark mode.** The app is light-mode only. All designs should assume a white/stone-50 background.

7. **Keep the bottom navigation.** It is the primary navigation for both student and buddy. Icon + label tab structure is fixed. Only styling improvements (size, active states, label legibility) are in scope.

8. **Accessibility baseline.** All text must maintain WCAG AA contrast. Interactive elements must have tap targets of at least 44×44px. Status information must not rely on colour alone (icons or labels must accompany colour changes).

9. **No illustration or photography.** The app currently uses no custom illustrations or photography. Do not add them — the design system uses initials avatars, Lucide icons, and emoji as visual elements. Any additions must stay within this vocabulary.

10. **Recharts charts are in use.** The percentile and error bucket charts are Recharts components. Style recommendations should be achievable via Recharts configuration (custom colours, custom tooltip component, custom legend) — not via replacing the library.

---

*End of design audit. Document produced from direct code review of the careerrai-tracker repository — all visual descriptions are derived from Tailwind class names, component structure, and layout code, not from screenshots.*
