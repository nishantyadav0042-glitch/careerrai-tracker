/**
 * ── The buddy nudge must say why it did nothing ────────────────────────────
 *
 * Production, 15 Sep: 124 `buddy_nudge_shown` all-time and ZERO since 1 Sep —
 * the day the push ask began rendering on every app open. The modal is the
 * best-converting surface we have (28 of 124 shown reached the CTA, 22.6%,
 * against 28 of 3,458 evening pushes, 0.8%), and it went silent with six
 * different bail-outs wearing one face.
 *
 * The failure mode this guards is the same one push-ask-telemetry guards:
 * someone adds a seventh early return, a whole cohort stops being counted, and
 * every test still passes because nothing threw.
 *
 * NOTIFICATION-OS §8 — every stage measured.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NUDGE = join(__dirname, '..', 'components', 'daily-buddy-nudge.tsx');
const JOURNEY = join(__dirname, 'journey.ts');
const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '');

/** The gate ladder: the settle timeout, where every silent bail-out lives. */
function gateLadder(): string {
  const s = code(NUDGE);
  const start = s.indexOf('timer = setTimeout(');
  expect(start, 'the settle timeout not found — this guard needs rewiring').toBeGreaterThan(-1);
  // Was `'}, 1400);'` until 16 Sep, when the settle became a named constant
  // shared with the announcement — the two delays ARE the priority between the
  // two auto-modals (Incident #92), so neither may be a literal any more.
  const end = s.indexOf('}, NUDGE_SETTLE_MS);', start);
  expect(end, 'the settle timeout has no terminator').toBeGreaterThan(start);
  return s.slice(start, end);
}

describe('every path out of the buddy nudge is counted', () => {
  it('every gate reports which one it was — none is silent', () => {
    // One `return;` is allowed and only one: the `shown` re-entry guard, which
    // is not a gate at all — the modal is already on screen. Everything else
    // must name itself.
    const ladder = gateLadder();
    const bareReturns = ladder.match(/^\s*if \([^)]*\) return;\s*$/gm)?.length ?? 0;
    const named = ladder.match(/return blocked\('/g)?.length ?? 0;
    expect(named, 'no gate reports itself').toBeGreaterThan(0);
    expect(bareReturns, 'a gate leaves the ladder without naming itself').toBe(1);
  });

  it('names each distinct gate, so the cohorts stay separable', () => {
    const s = code(NUDGE);
    for (const gate of [
      'tour_unfinished', 'notif_ask_open', 'insight_open', 'log_modal_open',
      'daily_slot_taken', 'already_pitched_today', 'claim_failed', 'claim_unreachable',
    ]) {
      expect(s, `missing gate: ${gate}`).toContain(`'${gate}'`);
    }
  });

  it('keeps the server claim answers apart', () => {
    // "This day was already pitched" is the founder's one-pitch-a-day rule
    // WORKING. "The claim errored" is it failing closed and costing a pitch
    // nobody made. Reading them as one number loses the only difference that
    // would change what we do next.
    const s = code(NUDGE);
    expect(s).toMatch(/claim\?\.reason === 'claim_failed'/);
  });

  it('says it mounted before any gate can decide', () => {
    const s = code(NUDGE);
    expect(s, 'the mount must be recorded exactly once').toContain("track('buddy_nudge_mounted'");
    expect(s.match(/'buddy_nudge_mounted'/g)?.length).toBe(1);
    // Guarded by a ref, or a re-render writes a row per render.
    expect(s).toMatch(/mounted\.current\s*=\s*true/);
    // Before the gate ladder, or it cannot answer the question it exists for:
    // a component that bails immediately still mounted.
    const body = s.slice(s.indexOf('useEffect(() => {'));
    expect(body.indexOf("track('buddy_nudge_mounted'"))
      .toBeLessThan(body.indexOf('timer = setTimeout('));
  });

  it('does not let the mount or a block masquerade as a pitch', () => {
    // `buddy_nudge_shown` is the number this funnel is judged on, and
    // promo_impressions is the pitch of record. Neither new event may touch
    // either — a mount is not an impression.
    const s = code(NUDGE);
    const mountLine = s.split('\n').find((l) => l.includes("track('buddy_nudge_mounted'")) ?? '';
    expect(mountLine).not.toContain('buddy_nudge_shown');
    expect(s.match(/'buddy_nudge_shown'/g)?.length, 'shown stays exactly one call site').toBe(1);
    // The blocked path must never claim the day's slot.
    const blockedFn = s.slice(s.indexOf('const blocked ='), s.indexOf('let timer'));
    expect(blockedFn).not.toContain('promo/claim');
    expect(blockedFn).not.toContain('claimDailyModal');
  });
});

describe('the instrumentation cannot flood', () => {
  it('emits at most once per distinct gate, not once per attempt', () => {
    // attempt() re-runs on each of three first-run events. A student whose
    // tour is unfinished must not write four identical rows for one page view.
    const s = code(NUDGE);
    expect(s).toContain('lastGate');
    expect(s).toMatch(/if \(lastGate\.current === gate\) return;/);
  });

  it('registers every event it emits', () => {
    const names = code(NUDGE).match(/track\('(buddy_nudge_[a-z_]+)'/g) ?? [];
    expect(names.length).toBeGreaterThan(0);
    // Read the EventName union itself — a name mentioned only in a comment
    // must not count as registered.
    const raw = read(JOURNEY);
    const from = raw.indexOf('export type EventName =');
    expect(from, 'EventName union not found').toBeGreaterThan(-1);
    const lines = raw.slice(from).split('\n');
    const endAt = lines.findIndex((l, i) => i > 0 && /;\s*$/.test(l));
    expect(endAt, 'EventName union has no terminator').toBeGreaterThan(0);
    const union = lines.slice(0, endAt + 1).join('\n');
    for (const m of names) {
      const ev = m.replace(/track\('|'/g, '');
      expect(union, `${ev} is emitted but not in EventName`).toContain(`'${ev}'`);
    }
  });
});

describe('measuring the silence changed nothing about who is pitched', () => {
  it('still waits for the whole first-run queue before it claims', () => {
    // Founder order, 21 July: the buddy pitch is LAST. Instrumentation is not
    // a licence to jump the queue.
    const ladder = gateLadder();
    const order = ['tourDone()', 'notifAskVisible()', 'insightVisible()', 'logModalOpen()', 'claimDailyModal()'];
    let at = -1;
    for (const gate of order) {
      const i = ladder.indexOf(gate);
      expect(i, `${gate} is no longer checked before the pitch`).toBeGreaterThan(at);
      at = i;
    }
  });

  it('still claims the server slot only at the moment of showing', () => {
    // A claim is a burned slot. It must stay below every gate, or a mount that
    // never shows eats the student's one pitch for the day.
    const ladder = gateLadder();
    expect(ladder.indexOf("fetch('/api/promo/claim'"))
      .toBeGreaterThan(ladder.indexOf('claimDailyModal()'));
  });
});
