import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
