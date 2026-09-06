import { describe, it, expect } from 'vitest';
import { TOPIC_RESOURCES } from './topic-resources';

// ── A series is not a difficulty ladder ───────────────────────────────────
//
// The defect this guards against, found 1 Sep: an earlier corpus built its
// levels by taking consecutive videos from one creator's series and mapping
// them onto consecutive difficulty rungs. Fourteen of fifty-two rows sat on
// the wrong rung. The clearest case opened "welcome to a very important topic
// of algebra called sequence and series... we study AP, then GP, then HP" and
// had been shipped as easy practice; the most harmful was part 9 on rational
// inequalities, shipped as beginner practice.
//
// A creator numbers videos by teaching order. Video 2 follows video 1 because
// it is next, not because it is harder.
//
// This corpus is much less exposed to that mistake than the one it replaced,
// because concept and worked_example describe a KIND of video rather than a
// difficulty, and there is no four-rung ladder to fill. But the same wrong
// reasoning still fits: "video 1 teaches, so video 2 must be the examples."
// That is a guess about content dressed as a rule about order, and this test
// makes the shape of it fail.
//
// Series position stays legitimate as SUPPORTING metadata — it is how we know
// "Circles 1" is the entry point of its series. It may never be the thing that
// decides what a video IS.

describe('what a resource IS never comes from where it sits in a series', () => {
  // Ordering alone cannot be the test. In a well-built course, video 1 really
  // IS the concept and video 2 really IS the examples — "concept precedes
  // examples" is what a good curriculum looks like, not evidence of a defect.
  // A guard that fires on a correct corpus gets deleted, so it must catch
  // something unambiguous instead.
  //
  // What IS unambiguous is a row whose own title states its role and is filed
  // as the other thing. A video called "Basic Concepts" shelved as a worked
  // example, or one called "Practice Questions" shelved as the concept lesson,
  // is mislabelled no matter what position it holds in a series. That is the
  // slip series-ordering produces, caught by content rather than by order.

  // Words a creator uses to announce that a video TEACHES the idea.
  const TEACHES = /\b(introduction|introducing|basics?|basic concepts?|fundamentals?|what is|101|concepts? class|from scratch|foundation)\b/i;
  // Words a creator uses to announce that a video WORKS PROBLEMS.
  // Deliberately narrow. Bare "problems", "solutions" and "questions" appear in
  // topic names — "Constant Distance Problems", "Linear Equation Solutions",
  // "Para Completion Questions" are all concept lessons — so only phrases that
  // describe the video's MODE count.
  const SOLVES = /\b(practice|solved examples?|worked examples?|pyqs?|previous year|question bank|practice questions?|set\s*-?\s*\d+|blitzkrieg)\b/i;

  it('never files a video whose title announces teaching as a worked example', () => {
    const wrong: string[] = [];
    for (const [topic, rows] of Object.entries(TOPIC_RESOURCES)) {
      for (const r of rows) {
        if (r.intent !== 'worked_example') continue;
        if (TEACHES.test(r.title) && !SOLVES.test(r.title)) {
          wrong.push(`${topic}: "${r.title}" (${r.videoId}) is filed as worked_example`);
        }
      }
    }
    expect(wrong, 'the title says this video teaches the idea — check it against the video').toEqual([]);
  });

  it('never files a video whose title announces problem-solving as the concept lesson', () => {
    const wrong: string[] = [];
    for (const [topic, rows] of Object.entries(TOPIC_RESOURCES)) {
      for (const r of rows) {
        if (r.intent !== 'concept') continue;
        if (SOLVES.test(r.title) && !TEACHES.test(r.title)) {
          wrong.push(`${topic}: "${r.title}" (${r.videoId}) is filed as concept`);
        }
      }
    }
    expect(wrong, 'the title says this video works problems — check it against the video').toEqual([]);
  });

  it('does not let one video serve two roles in the same topic', () => {
    // The other way order leaks in: reusing a video because it is "next" in the
    // list rather than because it does that job.
    for (const [topic, rows] of Object.entries(TOPIC_RESOURCES)) {
      const ids = rows.map((r) => r.videoId);
      expect(new Set(ids).size, `${topic} reuses a video across intents`).toBe(ids.length);
    }
  });
});
