import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

/**
 * ── NUDGE THE STUDENT TOWARD THE ICON THEY ALREADY HAVE ─────────────────────
 *
 * See reopen-app-nudge.tsx's header for the full production evidence. This
 * pins the four-way decision the component's effect makes, as a pure
 * function, so the gating survives independent of React/jsdom.
 */

type Env = {
  isStandalone: boolean;
  displayMode: 'standalone' | 'twa' | 'ios_app' | 'browser' | 'unknown';
  appInstalled: boolean; // server truth
  installed: boolean;    // client's getInstalledRelatedApps() read
};

function wouldShow(e: Env): boolean {
  if (e.isStandalone) return false;
  if (e.displayMode === 'ios_app') return false;
  if (!e.appInstalled && !e.installed) return false;
  return true;
}

describe('the reopen nudge only fires for a student who already has the app', () => {
  it('never shows while already running standalone — nothing to nudge toward', () => {
    expect(wouldShow({ isStandalone: true, displayMode: 'standalone', appInstalled: true, installed: true })).toBe(false);
  });

  it('never shows in the iOS App Store wrapper — that IS the app, not a nudge target', () => {
    expect(wouldShow({ isStandalone: false, displayMode: 'ios_app', appInstalled: true, installed: true })).toBe(false);
  });

  it('never shows to a student who has genuinely never installed — that is InstallJourney\'s job', () => {
    expect(wouldShow({ isStandalone: false, displayMode: 'browser', appInstalled: false, installed: false })).toBe(false);
  });

  it('shows when the server confirms a prior standalone open, even if this session cannot re-detect it', () => {
    expect(wouldShow({ isStandalone: false, displayMode: 'browser', appInstalled: true, installed: false })).toBe(true);
  });

  it('shows when the client detects an install the server has not heard about yet', () => {
    expect(wouldShow({ isStandalone: false, displayMode: 'browser', appInstalled: false, installed: true })).toBe(true);
  });

  it('the exact gap this exists for: browser tab, both signals true', () => {
    expect(wouldShow({ isStandalone: false, displayMode: 'browser', appInstalled: true, installed: true })).toBe(true);
  });
});

describe('the source never touches push subscription code', () => {
  // The 22 Jul lesson this fix must not repeat: browser-context push subscriptions
  // died at ~75%. This nudge is scoped to navigation only — pin that it stays that
  // way, so a future edit doesn't fold a subscribe() call into this component and
  // quietly reopen that regression.
  const SOURCE = readFileSync(join(__dirname, '..', 'components', 'reopen-app-nudge.tsx'), 'utf8');

  it('never calls getLiveSubscription or persistSubscription', () => {
    expect(SOURCE).not.toMatch(/getLiveSubscription|persistSubscription/);
  });

  it('never calls Notification.requestPermission', () => {
    expect(SOURCE).not.toMatch(/requestPermission/);
  });
});

describe('the overlay and the banner never both speak to the same student', () => {
  // StandaloneNotifAsk gained a capability-based guidance panel on main
  // (push-capability.ts). For a browser tab its remedy is "install the app" —
  // correct for someone who has not installed, WRONG for the 133 of 238
  // Android tab-students who already accepted an install prompt. Two surfaces
  // would then talk at once, and the louder one (a full-screen overlay) would
  // be the one telling a returning student to fix a thing that is not broken.
  const ASK = readFileSync(join(__dirname, '..', 'components', 'standalone-notif-ask.tsx'), 'utf8');

  it('the ask defers to the banner for an already-installed browser tab', () => {
    expect(ASK).toMatch(/appInstalled && cap\.surface === 'browser_tab'/);
    expect(ASK).toContain("report('skipped', 'already_installed_tab')");
  });

  it('the deferral is BEFORE the guidance panel is armed, not after', () => {
    // setCannot() is what renders "Install app". Deferring after it would
    // still flash the wrong panel.
    const code = codeOnly(ASK);
    const defer = code.indexOf("'already_installed_tab'");
    const arm = code.indexOf('setCannot(cap)');
    expect(defer).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(-1);
    expect(defer, 'the deferral must come first').toBeLessThan(arm);
  });

  it('the layout actually passes the server truth in — a default of false silently restores the bug', () => {
    const layout = readFileSync(join(__dirname, '..', 'app', 'student', 'layout.tsx'), 'utf8');
    const tag = layout.slice(layout.indexOf('<StandaloneNotifAsk'), layout.indexOf('<StandaloneNotifAsk') + 260);
    expect(tag).toMatch(/appInstalled=\{appInstalled\}/);
  });
});
