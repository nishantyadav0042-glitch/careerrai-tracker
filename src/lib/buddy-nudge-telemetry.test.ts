import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G12: the daily Buddy nudge becomes measurable ───────────────────────────
//
// An instrumentation gate, not a conversion gate. The nudge is shown to a
// standing pool of 349 eligible students, at most once per student per
// study-day, competing with every other auto-modal for ONE slot a day — and
// until now it emitted nothing at all. We changed its copy and added the ₹299
// rung on 19 Aug with no way to find out whether either worked.
//
// THE TRAP THIS FILE EXISTS TO HOLD SHUT. Four controls call the same
// setShow(false): the backdrop, the ✕, "Maybe tomorrow", and the ₹299 rung.
// Wiring a dismissal event to that call would record the rung — the deepest
// engagement available on the screen — as an abandonment, and the rung would
// read as if it repelled students. One concept, two meanings: ENGINEERING-
// MEMORY #4/#5/#9. The rung is a conversion and is counted as one.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const NUDGE = 'src/components/daily-buddy-nudge.tsx';
const JOURNEY = 'src/lib/journey.ts';

const EVENTS = [
  'buddy_nudge_shown',
  'buddy_nudge_dismissed',
  'buddy_nudge_cta',
  'buddy_nudge_rung',
] as const;

describe('the event contract exists and is closed', () => {
  it('every G12 name is in the EventName union', () => {
    const j = read(JOURNEY);
    for (const e of EVENTS) {
      expect(j, `${e} must be declared — EventName is the allow-list`).toContain(`'${e}'`);
    }
  });

  it('the nudge emits all four, and nothing else', () => {
    const s = read(NUDGE);
    for (const e of EVENTS) expect(s, `${e} must fire`).toContain(`'${e}'`);
    const emitted = [...s.matchAll(/track\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(emitted), 'no event beyond the agreed contract').toEqual(new Set(EVENTS));
  });

  it('no new table and no schema change — EventName is client-side only', () => {
    // The ingest route takes any string; the union is the only gate. That is
    // what makes this gate migration-free, and it must stay that way.
    const route = read('src/app/api/events/track/route.ts');
    expect(route, 'ingest must stay allow-list-free — a server enum would need a deploy to add an event')
      .not.toMatch(/buddy_nudge/);
  });
});

describe('a dismissal is never confused with a conversion', () => {
  it('the ₹299 rung reports itself as a rung click, not a dismissal', () => {
    const s = read(NUDGE);
    const rung = s.slice(s.indexOf('href="/student/buddy"'));
    const handler = rung.slice(0, rung.indexOf('</Link>'));
    expect(handler, 'the rung must emit buddy_nudge_rung').toContain('buddy_nudge_rung');
    expect(handler, 'the rung must NOT emit a dismissal — it is the deepest engagement on this screen')
      .not.toContain('buddy_nudge_dismissed');
  });

  it('dismissals say which control was used', () => {
    const s = read(NUDGE);
    for (const via of ['backdrop', 'close', 'maybe_tomorrow']) {
      expect(s, `via: '${via}' must be distinguishable — a tap-away is not a considered no`)
        .toContain(`'${via}'`);
    }
  });

  it('via is a closed enum, not free text', () => {
    const s = read(NUDGE);
    expect(s, 'the dismissal reason must be typed at the call site')
      .toMatch(/type\s+DismissVia\s*=|DismissVia/);
  });
});

describe('the impression is honest', () => {
  it('fires on render, not on claiming the daily slot', () => {
    // claimDailyModal() succeeding is an INTENT to show; setShow(true) is the
    // show. Same instant today, but an impression count that can exceed the
    // impressions is the exact overstatement this project spent the week
    // removing from the data layer.
    const s = read(NUDGE);
    const claim = s.indexOf('claimDailyModal');
    const effectShown = s.indexOf('buddy_nudge_shown');
    expect(effectShown, 'the impression must be emitted').toBeGreaterThan(-1);
    expect(s.slice(claim, s.indexOf('}', claim) + 1), 'do not fire the impression inside the claim branch alone')
      .not.toContain('buddy_nudge_shown');
  });

  it('cannot fire twice from one mount', () => {
    const s = read(NUDGE);
    expect(s, 'the shown-once guard must survive').toMatch(/if\s*\(shown\)\s*return/);
  });
});

describe('scope containment — this gate changes nothing but telemetry', () => {
  it('behaviour, timing, eligibility and routing are untouched', () => {
    const s = read(NUDGE);
    expect(s, 'the 1400ms settle stands').toContain('1400');
    expect(s, 'the daily slot claim stands').toContain('claimDailyModal()');
    expect(s, 'the first-run queue conditions stand')
      .toMatch(/!tourDone\(\)\s*\|\|\s*notifAskVisible\(\)\s*\|\|\s*insightVisible\(\)\s*\|\|\s*logModalOpen\(\)/);
    expect(s, 'the rung still routes to the gated card').toContain('href="/student/buddy"');
    expect(s, 'the CTA is still the shared sheet button').toContain('UnlockBuddyButton');
  });

  it('the copy is untouched — G12 is not a conversion gate', () => {
    const s = read(NUDGE);
    expect(s).toContain('Don&apos;t prep alone');
    expect(s).toContain('An IIM senior who has cleared CAT');
    expect(s).toContain('Try one session — ₹299');
    expect(s).toContain('Maybe tomorrow');
  });

  it('no payment inference and no PII in telemetry', () => {
    const s = read(NUDGE);
    for (const forbidden of ['fullName:', 'email', 'phone', 'amountPaise', 'razorpay', 'is_premium']) {
      expect(s, `${forbidden} must never reach an event payload`)
        .not.toMatch(new RegExp(`track\\([^)]*${forbidden}`, 'i'));
    }
    expect(s, 'no client event may imply a payment succeeded').not.toMatch(/paid|purchase|success/i);
  });
});
