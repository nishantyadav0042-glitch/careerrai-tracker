import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── We link. We do not host, and we do not compel ─────────────────────────
//
// The founder's position on external content is four sentences long and every
// one of them is a constraint a future edit could quietly break:
//
//   We will not host anything, we will only send the student to the original
//   source. Options and choice — we mandate nothing. One link, never a list.
//   We will never link pirated or re-uploaded material.
//
// Each rule below is one of those sentences, expressed as something a diff
// cannot pass without someone noticing. See
// docs/RESOURCE-LINKING-PLAN-2026-08.md for the full plan and the SWOT.

const SURFACE = 'src/components/task-resource.tsx';
const CARD = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

const read = (p: string) => readFileSync(p, 'utf8');
// Comments explain the rules, so they would satisfy every check below on
// their own. Strip them and test the code that actually ships.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the resource is linked, never hosted', () => {
  it('sends the student to the original watch page', () => {
    expect(code(SURFACE)).toContain('https://www.youtube.com/watch?v=');
  });

  it('never embeds, frames, or proxies the video', () => {
    // An embed puts someone else's video inside our chrome and makes us look
    // like the publisher. That is the one posture the whole plan is built to
    // avoid — legally the interesting question, commercially a claim we have
    // not earned.
    const s = code(SURFACE);
    expect(s, 'an iframe would make us the publisher').not.toContain('<iframe');
    expect(s).not.toContain('youtube.com/embed');
    expect(s).not.toContain('youtube-nocookie');
    expect(s).not.toContain('dangerouslySetInnerHTML');
  });

  it('opens outside the app, without handing the target our referrer or window', () => {
    const s = code(SURFACE);
    expect(s).toContain("target=\"_blank\"");
    expect(s).toContain('rel="noopener noreferrer"');
  });
});

describe('the resource is optional', () => {
  it('does not gate task completion', () => {
    // Incident #2 is the standing lesson here: requiring an extra tick before
    // a student could log an honest day cost a whole cohort. A link they did
    // not open must never be able to do the same.
    const s = code(SURFACE);
    expect(s).not.toContain('complete-task');
    expect(s).not.toContain('disabled');
  });

  it('says so on the row, before the tap', () => {
    expect(read(SURFACE)).toContain('optional');
  });

  it('stops its taps from reaching the task row', () => {
    // The task row is one big button. Without this, opening a resource would
    // tick the task — recording progress the student never made, into the
    // completion data every other surface reads from.
    expect(code(SURFACE)).toContain('stopPropagation');
  });
});

describe('one link, never a list', () => {
  it('renders a single anchor', () => {
    const anchors = code(SURFACE).match(/<a\b/g) ?? [];
    expect(anchors.length, 'a list hands the decision back to the student').toBe(1);
  });

  it('takes one resource, not an array', () => {
    const s = read(SURFACE);
    expect(s).toContain('resource: TaskResource');
    expect(s).not.toContain('resources: TaskResource[]');
  });
});

describe('the source is always named', () => {
  it('shows the channel and the real runtime before the student commits', () => {
    // Twenty-two researched durations were wrong, one by more than twenty
    // minutes. A student told "13 min" who loses forty was misled by our
    // plan, not by YouTube — so the figure shown is the platform-read one.
    const s = read(SURFACE);
    expect(s).toContain('{resource.channel}');
    expect(s).toContain('{resource.realMinutes}');
  });
});

describe('the outcome signal exists and is honest', () => {
  it('asks only after the student actually left', () => {
    // We can see nothing on YouTube — no watch time, no completion. Asking
    // "did it help?" about a link nobody opened would manufacture an opinion.
    //
    // This used to scan for the inline condition. The rule now lives in
    // lib/resource-feedback (shouldAskVerdict) because three sequence defects
    // shipped while it was tangled in JSX and no render test could catch them;
    // resource-feedback.test.ts drives it through whole journeys instead. What
    // this guard still owns is that the component DELEGATES rather than
    // re-deciding.
    const s = code(SURFACE);
    expect(s).toContain('shouldAskVerdict(state)');
    expect(s, 'the surface must not re-implement the rule').not.toMatch(/opened && verdict === null/);
  });

  it('records impressions separately from opens', () => {
    // Otherwise "students ignore the links" and "students never saw the links"
    // are the same number. The three event names are now emitted from one place
    // driven by the reducer, so the guard checks the single emission point
    // exists and that nothing else in the file emits behind its back.
    const s = code(SURFACE);
    expect(s).toContain('function advance(');
    expect(s).toContain('for (const e of emit) track(e.event');
    const trackCalls = s.match(/track\(/g) ?? [];
    expect(trackCalls.length, 'exactly one emission point').toBe(1);
  });

  it('carries enough props to name a bad link in one query', () => {
    const s = code(SURFACE);
    expect(s).toContain('videoId: resource.videoId');
    expect(s).toContain('intent: resource.intent');
  });
});

describe('the plan card actually renders it', () => {
  it('shows the resource on both task shapes', () => {
    // The card renders a hero task and ordinary rows through two separate
    // branches. Wiring only one is the silent half-ship this guards against.
    const hits = code(CARD).match(/<TaskResource\b/g) ?? [];
    expect(hits.length, 'hero task and ordinary rows both need it').toBe(2);
  });

  it('never renders it on a finished task', () => {
    expect(code(CARD).match(/!done && task\.resource/g)?.length).toBe(2);
  });
});

describe('the secondary replaces the primary, never joins it', () => {
  it('holds the alternative back until the student says the primary missed', () => {
    // Two links side by side is the "list" rule broken by another name: the
    // student came here to be told what to do next, not to compare sources.
    const s = code(SURFACE);
    expect(s).toContain('canOffer');
    expect(s).toContain("verdict === 'did_not'");
    expect(s).toContain('onSecondary && secondary ? secondary : primary');
  });

  it('still renders exactly one anchor with a secondary in play', () => {
    // Belt and braces with the count above: the secondary must be swapped INTO
    // the existing anchor, never appended as a second one.
    const anchors = code(SURFACE).match(/<a\b/g) ?? [];
    expect(anchors.length).toBe(1);
  });

  it('tells the student when a resource is longer than the day asks for', () => {
    // A 78-minute lecture under a 30-minute task is honest only if the row
    // says so. The task target never changes; the row must not imply it did.
    expect(read(SURFACE)).toContain('resource.longForm');
    expect(read(SURFACE)).toContain('finish it today');
  });

  it('separates "did not open" from a verdict on the content', () => {
    // A student who never tapped is telling us about the row, not the video.
    // Recording that as an opinion on content they never saw would be a lie.
    const s = code(SURFACE);
    expect(s).toContain("ask('not_opened')");
    expect(s).toContain('shouldOfferNotOpened(state)');
  });
});
