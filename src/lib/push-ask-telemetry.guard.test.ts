/**
 * ── The push ask must say why it did nothing ───────────────────────────────
 *
 * StandaloneNotifAsk is the only place a student is ever asked for push
 * permission, and until 1 Sep it tracked ONLY success. Production that day:
 * 996 students, 692 with the app installed, 156 reachable by push — and no
 * way to tell whether the missing 536 declined, were blocked, or were never
 * shown the ask at all. `push_ask_skipped.why` is what separates those.
 *
 * The failure mode this guards is silent: someone adds a fifth early return
 * to evaluate(), a whole cohort stops being counted, and every test still
 * passes because nothing threw.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ASK = join(__dirname, '..', 'components', 'standalone-notif-ask.tsx');
const JOURNEY = join(__dirname, 'journey.ts');
const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The body of evaluate(), where every silent bail-out lives. */
function evaluateBody(): string {
  const s = code(ASK);
  const start = s.indexOf('const evaluate = () => {');
  expect(start, 'evaluate() not found — this guard needs rewiring').toBeGreaterThan(-1);
  const end = s.indexOf('\n    };', start);
  return s.slice(start, end);
}

describe('every path out of the push ask is counted', () => {
  it('every early return reports a skip reason', () => {
    const body = evaluateBody();
    const returns = body.match(/return;/g)?.length ?? 0;
    const reported = body.match(/report\('skipped',/g)?.length ?? 0;
    expect(returns, 'no early returns found').toBeGreaterThan(0);
    expect(reported, 'an early return leaves evaluate() without reporting why').toBe(returns);
  });

  it('names each distinct reason, so the cohorts stay separable', () => {
    const body = evaluateBody();
    for (const why of ['not_standalone', 'ios_wrapper', 'unsupported', 'already_granted']) {
      expect(body, `missing skip reason: ${why}`).toContain(`'${why}'`);
    }
  });

  it('reports the ask when it actually renders', () => {
    expect(evaluateBody()).toContain("report('shown')");
  });

  it('counts the outcomes a student drives, not just success', () => {
    const s = code(ASK);
    for (const ev of ['push_ask_later', 'push_ask_blocked', 'push_ask_dismissed', 'push_ask_failed']) {
      expect(s.match(new RegExp(`'${ev}'`, 'g'))?.length, `${ev} must be emitted exactly once`).toBe(1);
    }
    // The pre-existing success event stays the conversion signal.
    expect(s).toContain("track('push_enabled'");
  });
});

describe('the instrumentation cannot flood or leak', () => {
  it('emits at most once per distinct outcome, not once per foreground', () => {
    // evaluate() re-runs on every visibilitychange. An iOS PWA switched to and
    // from ten times must not write ten rows.
    const s = code(ASK);
    expect(s).toContain('lastOutcome');
    expect(s).toMatch(/if \(lastOutcome\.current === outcome\) return;/);
  });

  it('caps the failure reason rather than writing whatever the browser threw', () => {
    expect(code(ASK)).toMatch(/\.slice\(0, 80\)/);
  });

  it('registers every event it emits', () => {
    const names = code(ASK).match(/track\('(push_[a-z_]+)'/g) ?? [];
    expect(names.length).toBeGreaterThan(0);
    // Read the EventName union itself, not the whole file — a name mentioned
    // only in a comment must not count as registered.
    const raw = read(JOURNEY);
    const from = raw.indexOf('export type EventName =');
    expect(from, 'EventName union not found').toBeGreaterThan(-1);
    // Walk to the first line that terminates the union. A `;` inside one of
    // its comments would truncate a naive indexOf(';') search.
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

// ── A blocked student must never face a button that cannot work ─────────────
//
// Production, 1 Sep: `push_ask_blocked` fired 14 times for ONE student. Those
// were 14 taps. Once the OS has denied permission, requestPermission() resolves
// to 'denied' instantly and forever, so the primary CTA could never succeed —
// and the overlay stayed up offering it, with no other way forward.

describe('the blocked student has a way out', () => {
  it('detects the denial up front rather than only after a tap', () => {
    expect(code(ASK)).toMatch(/Notification\.permission === 'denied'/);
  });

  it('does not re-ask the OS once it has refused', () => {
    // The dead end itself: recheck() must RE-READ the permission, never
    // request it again.
    const s = code(ASK);
    const recheck = s.slice(s.indexOf('async function recheck()'), s.indexOf('async function enable()'));
    expect(recheck, 'recheck() must exist').toContain('Notification.permission');
    expect(recheck, 'recheck() must not call requestPermission').not.toContain('requestPermission');
  });

  it('swaps the primary action instead of leaving the dead one', () => {
    expect(code(ASK)).toContain('onClick={blocked ? recheck : enable}');
  });

  it('gives steps the student can actually follow', () => {
    // There is no web API that can open OS notification settings, so a button
    // claiming to would be a promise without a capability — the failure that
    // got EvidenceAnnounce deleted. Instructions are the honest substitute.
    const s = read(ASK);
    expect(s).toMatch(/App info/);
    expect(s).toMatch(/Notifications/);
    expect(s).toMatch(/can.t undo that from the inside|has to be[\s\S]{0,40}done in Settings/);
  });

  it('counts blocked students, not their taps', () => {
    // Emitted from the state flip, so tapping ten times is still one row.
    const s = code(ASK);
    expect(s).toMatch(/useEffect\(\(\) => \{\s*if \(blocked\) track\('push_ask_blocked'/);
    expect(s).toMatch(/\}, \[blocked\]\);/);
  });

  it('still returns on every app open — the founder rule is not weakened', () => {
    // A blocked student has an unresolved state with a real fix, so the ask
    // still shows. What changed is the panel, not the cadence.
    const s = code(ASK);
    const ev = s.slice(s.indexOf('const evaluate = () => {'), s.indexOf('\n    };', s.indexOf('const evaluate = () => {')));
    expect(ev).toContain('setBlocked(denied)');
    expect(ev, 'a denial must not become a silent skip').not.toMatch(/denied[\s\S]{0,80}report\('skipped'/);
  });
});
