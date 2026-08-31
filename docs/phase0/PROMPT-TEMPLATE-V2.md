# The research prompt, v2 — it no longer asks for ids

The v1 prompt (`GEMINI-RESPONSES-VERBATIM.md`, repeated 46 times) asked one
model to do two jobs at once: **find** the videos and **judge** them. It was
good at the second and catastrophic at the first — eleven ids across four topics
were invented, and the "DURATION" field it produced was a guess dressed as a
measurement.

The split is now permanent:

| Job | Who does it | Why |
|---|---|---|
| Find the video; establish id, title, channel, runtime, upload date, views | **vidIQ** | The platform cannot invent a video that does not exist |
| Judge worked-question count, difficulty, paid push, student time, why-this-one | **the model, or you** | No platform field carries any of these |

The five fields on the left were never a model's to produce. The six on the
right are the ones you actually wanted, and they are exactly the fields the
round-2 log dropped.

---

## The prompt

Paste the block below into a new chat, with the VIDEOS list filled in from
`round3-three-topics-verified.json` (or any verified file). Nothing in it asks
the model to find anything.

```
I am building a free CAT-preparation app for Indian students. The app gives a
student a daily task, and under that task it shows ONE link where they can
learn or practise. Nothing is hosted, downloaded, copied or re-uploaded — the
student simply opens the original video on YouTube. Using a link is always
optional for the student.

Below are videos I have ALREADY verified against YouTube. The id, title,
channel and runtime are platform-read facts. Do not question them, do not
substitute a different video, and do not add videos of your own.

TOPIC: <topic>
SECTION: <section>
UNIT OF PRACTICE: <questions | sets>

VIDEOS:
  [L1 CONCEPT]       <videoId> — <title> — <channel> — <runtime>
  [L2 EASY PRACTICE] <videoId> — <title> — <channel> — <runtime>
  [L3 CAT-LEVEL]     <videoId> — <title> — <channel> — <runtime>
  [L4 EXAM-READY]    <videoId> — <title> — <channel> — <runtime>

For EACH video above, watch it and report ONLY these six fields:

WATCHED FULLY? (yes / no / partly)
WORKED QUESTIONS SOLVED: (count them — a number, or 0)
REAL DIFFICULTY: (basic / medium / CAT-level / above-CAT)
PAID-COURSE PUSH: (none / mild / heavy)
REAL STUDENT TIME: (a range, e.g. "30-40 min", assuming the student pauses,
  takes notes and attempts questions themselves — not just the video length)
WHY THIS ONE: (one or two lines)

Then answer one question about the set:

LEVEL FIT: for each video, does the level I assigned match what you actually
  watched? Answer "correct" or name the level it really belongs at. I assigned
  these levels from titles and runtimes, so this is the field I trust least.

RULES:
- If you cannot actually watch a video, write "NOT WATCHED" for it and leave
  its six fields blank. A blank is useful; a guess is not.
- Never write a number you did not count. WORKED QUESTIONS SOLVED is the field
  this whole feature rests on.
- Do not fill the template's example text back to me. If a field does not
  apply, say so in words.
- If a video is bad enough that it should not be linked at all, say
  "REJECT" and give the reason in one line. An honest rejection is more useful
  than a polite score.
```

---

## Why "NOT WATCHED" is now load-bearing

The v1 prompt already had this instruction and it was ignored — round 1 returned
confident question-counts for videos it demonstrably had not opened, and twelve
of the fifty-two shipped rows do not carry a clean "yes" on *watched fully*.

The difference in v2 is that a "NOT WATCHED" answer now costs nothing. In v1 it
meant the whole topic failed, so there was pressure to produce something. Here
the ids are already verified and shipping-ready except for the level; a model
that declines to judge simply leaves those six fields for you, and the link
still works.

## One trap this does not close

A model asked to judge a video it cannot open can still describe it plausibly
from the title and description — the same failure as before, one level up. The
tell is the same one that worked this morning: **cross-run disagreement**. Run
each topic twice in separate chats and diff the question-counts. Round 1's
figures disagreed with themselves on 8 of 33 repeated videos; that is what a
fabricated count looks like. A number that survives two independent runs is
worth something. One that does not is worth nothing, and belongs in the research
record rather than the shipped data — which is where `topic-resources.ts`
already refuses to store it.
