# Gemini Prompts — Round 2 (22 pending)

> **Everything still outstanding, in one file.** Open a NEW Gemini chat per
> prompt, paste the whole block between the ``` markers, and send the reply back.
>
> Each block now carries six extra anti-fabrication rules at the end, written
> from the audit of round 1 — nine of those videos did not exist, twenty-two
> durations were wrong and three channels were misattributed. The rules name
> each of those failures explicitly so the model has to confront them.
>
> **Order matters.** The five re-runs come first because those topics currently
> hold data we have already proven false — they are worse than empty. Then the
> seventeen never-run topics, in the plan engine's own week-1 serve order.

---


## 1. Prompt 9 — Average

```text
=== PROMPT 9 of 46 — Average ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Average
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Average from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Average and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Average has weak free coverage on YouTube, tell me that plainly.

NOTE: this topic was researched once already and the answer had to be
thrown away — L1 and L2 came back as the SAME video under two different titles. Please redo it from scratch.

=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 2. Prompt 17 — Selection & Distribution

```text
=== PROMPT 17 of 46 — Selection & Distribution ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Selection & Distribution
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Selection & Distribution from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Selection & Distribution and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED SETS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts DILR sets themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Selection & Distribution has weak free coverage on YouTube, tell me that plainly.

NOTE: this topic was researched once already and the answer had to be
thrown away — the L2 video does not exist. Please redo it from scratch.

=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 3. Prompt 20 — Hybrid DILR Sets

```text
=== PROMPT 20 of 46 — Hybrid DILR Sets ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Hybrid DILR Sets
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Hybrid DILR Sets from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Hybrid DILR Sets and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED SETS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts DILR sets themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Hybrid DILR Sets has weak free coverage on YouTube, tell me that plainly.

NOTE: this topic was researched once already and the answer had to be
thrown away — all three filled levels were invented — none of the videos exist. Please redo it from scratch.

=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 4. Prompt 24 — Reading Speed Practice

```text
=== PROMPT 24 of 46 — Reading Speed Practice ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Reading Speed Practice
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Reading Speed Practice from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Reading Speed Practice and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Reading Speed Practice has weak free coverage on YouTube, tell me that plainly.

NOTE: this topic was researched once already and the answer had to be
thrown away — the L1 video does not exist. Please redo it from scratch.

=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 5. Prompt 31 — Functions

```text
=== PROMPT 31 of 46 — Functions ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Functions
SECTION: QA / Algebra (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Functions from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Functions and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Functions has weak free coverage on YouTube, tell me that plainly.

NOTE: this topic was researched once already and the answer had to be
thrown away — all four videos were invented — none of them exist. Please redo it from scratch.

=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 6. Prompt 11 — Venn / Sets

```text
=== PROMPT 11 of 46 — Venn / Sets ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Venn / Sets
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Venn / Sets from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Venn / Sets and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED SETS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts DILR sets themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Venn / Sets has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 7. Prompt 12 — Linear Equations

```text
=== PROMPT 12 of 46 — Linear Equations ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Linear Equations
SECTION: QA / Algebra (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Linear Equations from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Linear Equations and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Linear Equations has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 8. Prompt 13 — Sentence Completion

```text
=== PROMPT 13 of 46 — Sentence Completion ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Sentence Completion
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Sentence Completion from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Sentence Completion and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Sentence Completion has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 9. Prompt 14 — Binary Logic

```text
=== PROMPT 14 of 46 — Binary Logic ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Binary Logic
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Binary Logic from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Binary Logic and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED SETS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts DILR sets themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Binary Logic has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 10. Prompt 29 — Pipes & Cisterns

```text
=== PROMPT 29 of 46 — Pipes & Cisterns ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Pipes & Cisterns
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Pipes & Cisterns from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Pipes & Cisterns and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Pipes & Cisterns has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 11. Prompt 34 — Lines & Angles

```text
=== PROMPT 34 of 46 — Lines & Angles ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Lines & Angles
SECTION: QA / Geometry (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Lines & Angles from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Lines & Angles and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Lines & Angles has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 12. Prompt 35 — Triangles

```text
=== PROMPT 35 of 46 — Triangles ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Triangles
SECTION: QA / Geometry (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Triangles from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Triangles and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Triangles has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 13. Prompt 36 — Quadrilaterals

```text
=== PROMPT 36 of 46 — Quadrilaterals ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Quadrilaterals
SECTION: QA / Geometry (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Quadrilaterals from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Quadrilaterals and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Quadrilaterals has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 14. Prompt 37 — Circles

```text
=== PROMPT 37 of 46 — Circles ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Circles
SECTION: QA / Geometry (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Circles from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Circles and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Circles has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 15. Prompt 38 — Mensuration

```text
=== PROMPT 38 of 46 — Mensuration ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Mensuration
SECTION: QA / Geometry (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Mensuration from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Mensuration and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Mensuration has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 16. Prompt 40 — Permutation & Combination

```text
=== PROMPT 40 of 46 — Permutation & Combination ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Permutation & Combination
SECTION: QA / Modern Math (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Permutation & Combination from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Permutation & Combination and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Permutation & Combination has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 17. Prompt 41 — Probability

```text
=== PROMPT 41 of 46 — Probability ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Probability
SECTION: QA / Modern Math (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Probability from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Probability and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Probability has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 18. Prompt 42 — Set Theory

```text
=== PROMPT 42 of 46 — Set Theory ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Set Theory
SECTION: QA / Modern Math (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Set Theory from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Set Theory and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Set Theory has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 19. Prompt 43 — Divisibility

```text
=== PROMPT 43 of 46 — Divisibility ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Divisibility
SECTION: QA / Number System (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Divisibility from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Divisibility and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Divisibility has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 20. Prompt 44 — HCF & LCM

```text
=== PROMPT 44 of 46 — HCF & LCM ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: HCF & LCM
SECTION: QA / Number System (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches HCF & LCM from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows HCF & LCM and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If HCF & LCM has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 21. Prompt 45 — Remainders

```text
=== PROMPT 45 of 46 — Remainders ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Remainders
SECTION: QA / Number System (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Remainders from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Remainders and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Remainders has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```


## 22. Prompt 46 — Base System

```text
=== PROMPT 46 of 46 — Base System ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Base System
SECTION: QA / Number System (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Base System from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Base System and now wants exam pace.

RULES (follow strictly):
- Actually WATCH each video before recommending it. If you cannot watch it,
  say "NOT WATCHED" for that video instead of guessing.
- Only videos from the creator's OWN channel. No re-uploads, no leaked or
  pirated coaching material, no Telegram mirrors, no unclear sources.
- Must play free, without login, and be accessible from India.
- Reject any video whose real purpose is pushing a paid course or batch.
- If a level genuinely has no good free video, write exactly
  "NO GOOD VIDEO FOUND" for that level. Do NOT invent or force a weak pick —
  an honest gap is more useful to me than a bad link.
- Never give a search link or a bare playlist link. Give the exact video URL.

For EVERY recommended video, output EXACTLY this block:

LEVEL:
TITLE:
CHANNEL:
URL:
DURATION:
WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Base System has weak free coverage on YouTube, tell me that plainly.
=== EXTRA RULES — added after auditing 96 videos from earlier rounds ===

We checked every video from the previous rounds against real YouTube metadata.
Nine did not exist at all, twenty-two durations were wrong (one by 45 minutes),
and three videos were credited to the wrong channel. So these rules are not
hypothetical — each one is a mistake that actually happened:

1. THE URL MUST BE A REAL YOUTUBE WATCH URL.
   It must start with https://www.youtube.com/watch?v=
   Do NOT give a google.com/search link, and do NOT wrap a YouTube URL inside
   a search link. Every single fabricated video in the last round arrived as a
   search link. If you cannot produce the direct watch URL, the honest answer
   is "NO GOOD VIDEO FOUND".

2. DO NOT INVENT A PLAUSIBLE VIDEO.
   If a level has no good free video, say "NO GOOD VIDEO FOUND" and stop. An
   honest gap is genuinely more useful to me than a good-looking guess — I can
   act on a gap; a fake link wastes a student's evening. In the last round one
   whole topic came back with four invented videos and clean-sounding titles.

3. GIVE THE TITLE EXACTLY AS IT APPEARS ON YOUTUBE.
   Real titles are messy: they carry instructor names, episode numbers,
   inconsistent punctuation and channel branding. If your title reads like a
   tidy description of what the video ought to be, you are describing a video
   rather than reporting one.

4. THE DURATION MUST BE THE REAL RUNTIME.
   Not an estimate, not a guess. If you are not certain of the exact runtime,
   write "DURATION NOT CONFIRMED" rather than a number. Last round the same
   video was reported with two different durations in two runs, which is how
   we discovered the numbers were being generated rather than read.

5. NAME THE CHANNEL THAT ACTUALLY OWNS THE VIDEO.
   Not the channel you would expect it to be on. We vet sources channel by
   channel, so a wrong channel name means the vetting was never really applied.

6. If you are uncertain about ANY field, write "NOT CONFIRMED" for that field.
   Uncertainty stated plainly is useful. Uncertainty dressed as fact is not.

```
