# Verification Report — Earlier Fixes

## 1. Scorecard Scan — Stale-Data Isolation

**Verdict: CONFIRMED CORRECT. No fix needed.**

Each scan call (`/api/parse-scorecard`) sends only the image to Gemini with instructions to extract fields from THAT image. All fields are nullable. No merge with prior scans at any point in the flow:
- `route.ts` returns the raw Gemini parse (all nullable)
- `MockDebriefModal` shows whatever the scan returned, with no fallback from previous state
- `mock-debrief` save route does fetch one prior mock to compute a delta, but that is used only for the insight sentence — NOT merged into the saved debrief data

Test scenario: percentiles-only scan followed by scores-only scan will correctly show blank percentiles on the second scan. The code is already correct.

## 2. Buddy Feedback — Human-Authorship Gate

**Verdict: CLIENT-SIDE ONLY — server-side gate added as fix.**

### What existed before:
- **Server**: word count ≥ 15 words, no `[Write your` / `[Add your` placeholder text
- **Client**: Jaccard similarity check (>0.55 overlap with AI bullets) AND < 15 own words → rejected client-side only

The Jaccard check was entirely client-side — a motivated buddy could bypass it by modifying the request.

### Fix applied:
`/api/buddy/feedback/route.ts` now accepts optional `ai_draft` in the request body. When present, it runs the identical Jaccard check server-side (same threshold: similarity > 0.55 OR own words < 15 → 400 error).

`feedback-form.tsx` (`FeedbackFormConnected.submit`) now includes `ai_draft: aiBullets` in the POST body when AI bullets were shown to the buddy.

### What the combined gate now catches:
- Too short (<15 words) — server
- Placeholder text — server
- Unedited / near-identical AI material — both client and server
- Templates (the 5 preset templates): no AI draft is present, so Jaccard doesn't apply — but templates ARE materially different from AI bullets (they're fixed text, not student-specific)
