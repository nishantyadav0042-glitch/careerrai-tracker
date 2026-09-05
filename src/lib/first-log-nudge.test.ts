import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  shouldShow, afterShown, afterDismiss, afterLogged, FRESH, MAX_SIGHTINGS, type NudgeState,
} from '@/lib/first-log-nudge';

const D1 = '2026-09-05';
const D2 = '2026-09-06';
const D3 = '2026-09-07';
const D4 = '2026-09-08';

describe('the first-log nudge budget', () => {
  it('shows to a student who has never seen it', () => {
    expect(shouldShow(FRESH, D1)).toBe(true);
  });

  // THE regression. 242 of 335 dismissals were this nudge: median 9 seconds
  // open, 85.5% never touching a control. The old code wrote its flag on OPEN,
  // so a four-second reflex tap ended it permanently — 226 students sat in
  // exactly that state, never to be asked again on that device.
  it('a reflex dismissal does not spend the chance', () => {
    let s: NudgeState = afterShown(FRESH, D1);
    s = afterDismiss(s, false);
    expect(s.spent).toBe(false);
    expect(shouldShow(s, D2)).toBe(true);
  });

  it('but engaging with it does — they read it and chose', () => {
    let s: NudgeState = afterShown(FRESH, D1);
    s = afterDismiss(s, true);
    expect(s.spent).toBe(true);
    expect(shouldShow(s, D2)).toBe(false);
  });

  it('never twice in one day, however many times the page settles', () => {
    const s = afterShown(FRESH, D1);
    expect(shouldShow(s, D1)).toBe(false);
    expect(shouldShow(s, D2)).toBe(true);
  });

  it('gives up after MAX_SIGHTINGS — a nudge that keeps coming is nagging', () => {
    let s: NudgeState = FRESH;
    for (const d of [D1, D2, D3]) {
      expect(shouldShow(s, d)).toBe(true);
      s = afterDismiss(afterShown(s, d), false);
    }
    expect(s.shown).toBe(MAX_SIGHTINGS);
    expect(shouldShow(s, D4)).toBe(false);
  });

  it('retires for good the moment the student logs', () => {
    const s = afterLogged(afterShown(FRESH, D1));
    expect(shouldShow(s, D2)).toBe(false);
  });
});

describe('the tour gate', () => {
  // 21 days, 451 students opened CareerRai in a browser, ZERO saw the nudge,
  // ONE ever logged. app-tour starts only in the installed app, so `tourDone()`
  // is a condition a browser can never satisfy — the gate was a locked door.
  const src = readFileSync(
    join(process.cwd(), 'src/components/DailyTracker/DailyTrackerApp.tsx'), 'utf8');

  it('the first-log nudge waits on tourSettled, never on tourDone', () => {
    const effect = src.slice(src.indexOf('const maybeOpen'), src.indexOf('const maybeOpen') + 700);
    expect(effect).toContain('tourSettled()');
    expect(effect).not.toMatch(/[^A-Za-z]tourDone\(\)/);
  });

  it('reads its own localStorage key through the nudge module, not inline', () => {
    // The old inline `try { localStorage.getItem(KEY) } catch { return; }` did
    // not just forget state — it RETURNED, so a browser that throws on storage
    // (private mode, blocked site data) showed the nudge to nobody at all.
    expect(src).not.toContain("cr_first_log_prompt_v1");
    expect(src).toContain("from '@/lib/first-log-nudge'");
  });
});

describe('tourSettled', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/first-run-events.ts'), 'utf8');

  it('is tourDone OR no tour will ever run here', () => {
    const body = src.slice(src.indexOf('export function tourSettled'));
    expect(body).toMatch(/tourDone\(\)\s*\|\|\s*!tourApplies\(\)/);
  });

  it('tourApplies is the installed-app test the tour itself uses', () => {
    const body = src.slice(src.indexOf('export function tourApplies'), src.indexOf('export function tourSettled'));
    expect(body).toContain('display-mode: standalone');
    expect(body).toContain('standalone');
  });
});
