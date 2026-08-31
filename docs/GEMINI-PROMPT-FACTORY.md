# Gemini Prompt Factory — YouTube resource discovery, all 46 CAT topics

> **How to use:** open a NEW Gemini chat for each prompt, paste the whole
> block between the `===` markers, and paste the reply back to Claude for
> verification. Order is deliberate: **prompts are sorted by how early our
> own plan engine actually serves each topic to a week-1 student**
> (simulation in `docs/RESOURCE-LINKING-PLAN-2026-08.md` §6), so the
> highest-impact topics are done first. If you stop halfway, you have
> still covered what most students actually see.
>
> Total: 46 prompts across 6 pages, 8 per page.
> Never paste two prompts into one chat — one topic per chat keeps the
> answers clean and comparable.
>
> Generated from the canonical unit list in `src/lib/topics-constants.ts`;
> the practice unit (question / set / passage) mirrors
> `routine-engine.unitFor()` so Gemini is asked for the same unit our task
> targets are written in.

---


## Page 1 of 6

```text
=== PROMPT 1 of 46 — Reading Comprehension ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Reading Comprehension
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: RC passages

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Reading Comprehension from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve RC passages, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty RC passages solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Reading Comprehension and now wants exam pace.

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
WORKED PASSAGES SOLVED: (count them — write a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts RC passages themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Be blunt. If Reading Comprehension has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 2 of 46 — Percentages ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Percentages
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Percentages from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Percentages and now wants exam pace.

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

Be blunt. If Percentages has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 3 of 46 — Arrangements ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Arrangements
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Arrangements from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Arrangements and now wants exam pace.

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

Be blunt. If Arrangements has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 4 of 46 — Editorial Reading ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Editorial Reading
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Editorial Reading from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Editorial Reading and now wants exam pace.

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

Be blunt. If Editorial Reading has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 5 of 46 — Tables ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Tables
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Tables from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Tables and now wants exam pace.

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

Be blunt. If Tables has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 6 of 46 — Ratio & Proportion ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Ratio & Proportion
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Ratio & Proportion from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Ratio & Proportion and now wants exam pace.

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

Be blunt. If Ratio & Proportion has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 7 of 46 — Para Jumbles ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Para Jumbles
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Para Jumbles from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Para Jumbles and now wants exam pace.

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

Be blunt. If Para Jumbles has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 8 of 46 — Charts ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Charts
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Charts from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Charts and now wants exam pace.

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

Be blunt. If Charts has weak free coverage on YouTube, tell me that plainly.
```


## Page 2 of 6

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
```

```text
=== PROMPT 10 of 46 — Odd One Out ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Odd One Out
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Odd One Out from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Odd One Out and now wants exam pace.

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

Be blunt. If Odd One Out has weak free coverage on YouTube, tell me that plainly.
```

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
```

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
```

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
```

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
```

```text
=== PROMPT 15 of 46 — Progressions ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Progressions
SECTION: QA / Algebra (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Progressions from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Progressions and now wants exam pace.

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

Be blunt. If Progressions has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 16 of 46 — Vocabulary ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Vocabulary
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Vocabulary from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Vocabulary and now wants exam pace.

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

Be blunt. If Vocabulary has weak free coverage on YouTube, tell me that plainly.
```


## Page 3 of 6

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
```

```text
=== PROMPT 18 of 46 — Profit & Loss ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Profit & Loss
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Profit & Loss from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Profit & Loss and now wants exam pace.

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

Be blunt. If Profit & Loss has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 19 of 46 — Para Summary ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Para Summary
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Para Summary from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Para Summary and now wants exam pace.

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

Be blunt. If Para Summary has weak free coverage on YouTube, tell me that plainly.
```

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
```

```text
=== PROMPT 21 of 46 — Caselets ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Caselets
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Caselets from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Caselets and now wants exam pace.

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

Be blunt. If Caselets has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 22 of 46 — Games & Tournaments ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Games & Tournaments
SECTION: DILR (CAT exam)
UNIT OF PRACTICE: DILR sets

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Games & Tournaments from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve DILR sets, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty DILR sets solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Games & Tournaments and now wants exam pace.

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

Be blunt. If Games & Tournaments has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 23 of 46 — Grammar ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Grammar
SECTION: VARC (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Grammar from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Grammar and now wants exam pace.

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

Be blunt. If Grammar has weak free coverage on YouTube, tell me that plainly.
```

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
```


## Page 4 of 6

```text
=== PROMPT 25 of 46 — Time & Work ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Time & Work
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Time & Work from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Time & Work and now wants exam pace.

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

Be blunt. If Time & Work has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 26 of 46 — Time Speed Distance ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Time Speed Distance
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Time Speed Distance from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Time Speed Distance and now wants exam pace.

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

Be blunt. If Time Speed Distance has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 27 of 46 — SI & CI ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: SI & CI
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches SI & CI from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows SI & CI and now wants exam pace.

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

Be blunt. If SI & CI has weak free coverage on YouTube, tell me that plainly.
```

```text
=== PROMPT 28 of 46 — Mixtures ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Mixtures
SECTION: QA / Arithmetic (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Mixtures from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Mixtures and now wants exam pace.

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

Be blunt. If Mixtures has weak free coverage on YouTube, tell me that plainly.
```

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
```

```text
=== PROMPT 30 of 46 — Quadratic Equations ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Quadratic Equations
SECTION: QA / Algebra (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Quadratic Equations from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Quadratic Equations and now wants exam pace.

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

Be blunt. If Quadratic Equations has weak free coverage on YouTube, tell me that plainly.
```

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
```

```text
=== PROMPT 32 of 46 — Inequalities ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Inequalities
SECTION: QA / Algebra (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Inequalities from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Inequalities and now wants exam pace.

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

Be blunt. If Inequalities has weak free coverage on YouTube, tell me that plainly.
```


## Page 5 of 6

```text
=== PROMPT 33 of 46 — Logarithms ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Logarithms
SECTION: QA / Algebra (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Logarithms from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Logarithms and now wants exam pace.

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

Be blunt. If Logarithms has weak free coverage on YouTube, tell me that plainly.
```

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
```

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
```

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
```

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
```

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
```

```text
=== PROMPT 39 of 46 — Coordinate Geometry ===
[Paste this whole block into a NEW Gemini chat]

I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

TOPIC: Coordinate Geometry
SECTION: QA / Geometry (CAT exam)
UNIT OF PRACTICE: questions

Find the best FREE YouTube video for each of these 4 levels:

L1 CONCEPT — first exposure. Teaches Coordinate Geometry from scratch to someone who has
   never studied it for CAT.
L2 EASY PRACTICE — worked examples at basic-to-medium difficulty. Must
   actually solve questions, not just explain theory.
L3 CAT-LEVEL PRACTICE — real CAT-difficulty questions solved end to end.
L4 EXAM-READY — speed techniques, shortcuts, common traps, for a student who
   already knows Coordinate Geometry and now wants exam pace.

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

Be blunt. If Coordinate Geometry has weak free coverage on YouTube, tell me that plainly.
```

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
```


## Page 6 of 6

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
```

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
```

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
```

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
```

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
```

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
```

