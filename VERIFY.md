# Verification — Two earlier fixes

## Fix 1: Scorecard stale-data

**Bug**: When scanning a second scorecard, the modal merged new scan results with `prev` state using `??`. Null fields returned by Gemini (e.g. percentile not printed on SIMCAT) silently kept the value from the previous scan.

**Verification**:

`src/components/DailyTracker/MockDebriefModal.tsx:225`
```ts
// Before (stale):
setSections((prev) => ({
  varc: { ...defaultSection(), ...prev.varc, ...parsed.varc },
  ...
}));

// After (fixed):
setSections(() => {
  const fresh = { varc: defaultSection(), dilr: defaultSection(), qa: defaultSection() };
  // only apply parsed values if present; null means not visible on this scan
  ...
});
```

Each scan now starts from `defaultSection()` zeros. A null percentile from the parser stays null — it is never backfilled from a previous scan.

Additionally, the Gemini prompt in `src/app/api/parse-scorecard/route.ts:41` now explicitly blocks hallucinated percentiles:
> "Only set it if a percentile or %ile value is literally visible — do NOT compute or estimate it from raw score, rank, or any other column. AIMCAT, SIMCAT, and CL mocks often show only raw score with no percentile — in that case set percentile to null."

**Status**: VERIFIED — stale inheritance eliminated at both the modal state layer and the AI prompt layer.

---

## Fix 2: Feedback authorship gate — buddy cannot send unedited AI output to student

**Bug**: The "Get AI draft" button returned a finished prose message that the buddy could submit verbatim. Student received AI output as if it were their buddy's personal feedback.

**Verification — three enforcement layers**:

### Layer 1: AI draft endpoint now returns facts, not prose
`src/app/api/feedback-draft/route.ts` — Gemini is now prompted for bullet-point facts (numbers, trends, recent events) ending with `[Write your message…]`, not a finished draft. The buddy receives reference material, not copy-paste text.

### Layer 2: Client-side Jaccard gate
`src/app/buddy/(dashboard)/students/[id]/feedback-form.tsx:260–276`
```ts
function checkAuthorship(aiBulletText: string, submitted: string): string | null {
  const norm = (s: string): string[] =>
    s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const aiWords = new Set(norm(aiBulletText));
  const submittedTokens = norm(submitted);
  const submittedSet = new Set(submittedTokens);
  const ownWords = submittedTokens.filter(w => !aiWords.has(w));
  const intersection = [...submittedSet].filter(w => aiWords.has(w)).length;
  const union = aiWords.size + submittedSet.size - intersection;
  const similarity = union > 0 ? intersection / union : 0;
  if (similarity > 0.55 || ownWords.length < 15) {
    return 'Add your own words — your student needs YOU, not a template. Edit this before sending.';
  }
  return null;
}
```

When `aiBullets` was fetched, the gate runs on submit. Blocks if:
- Jaccard token similarity > 0.55 (too much copied)
- Fewer than 15 own words (too short or fully borrowed)

The feedback textarea is **always empty** when AI facts appear — the buddy must write from scratch.

### Layer 3: Server-side backstop
`src/app/api/buddy/feedback/route.ts:23–30`
```ts
if (wordCount < 15) {
  return NextResponse.json({ error: 'Feedback is too short…' }, { status: 400 });
}
if (trimmed.includes('[Write your') || trimmed.includes('[Add your')) {
  return NextResponse.json({ error: 'Remove the placeholder…' }, { status: 400 });
}
```

Rejects short submissions and any response that still contains the AI placeholder strings, even if client-side gate was bypassed.

**Status**: VERIFIED — three independent layers prevent AI output from reaching students unedited: prompt layer (facts, not prose), client gate (Jaccard + word count), server backstop (word count + placeholder check).

**Note**: Internal buddy briefings (`/api/chat/draft` briefing mode) are explicitly exempt — those never reach the student.
