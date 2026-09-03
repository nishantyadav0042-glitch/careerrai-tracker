import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── "INSTALLED BUT IN A BROWSER TAB" DETECTION WAS DEAD CODE ────────────────
 *
 * 1 Sep, push-subscription-gap audit. `checkInstalledRelatedApps()` in
 * use-install.ts calls `navigator.getInstalledRelatedApps()` with a header
 * comment claiming it "closes the installed-but-currently-in-a-browser-tab
 * gap that display-mode/navigator.standalone cannot see." It does not: that
 * Chromium API only reports a match against entries the manifest itself
 * declares in `related_applications`, and manifest.json had none — so the
 * call always resolved `[]`, `alreadyInstalled` could only ever come from
 * this session's own `appinstalled` event, and `useInstall().installed` was
 * false for the exact returning, already-installed, browser-tab student this
 * code says it identifies.
 *
 * Production evidence: of active Android students whose most recent session
 * was a plain browser tab, 56% had accepted a native install prompt at some
 * point — the icon is on their home screen, but nothing on a later browser
 * visit ever recognised that. A self-referencing `related_applications` entry
 * (Chrome's documented `platform: "webapp"` pattern) is what makes the API
 * answer the question it already claims, for anyone whose browser supports it.
 */

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'public', 'manifest.json'), 'utf8'),
);

describe('the manifest lets getInstalledRelatedApps() recognise this PWA', () => {
  it('declares itself as a related webapp', () => {
    const apps = manifest.related_applications;
    expect(Array.isArray(apps), 'related_applications is missing — getInstalledRelatedApps() always returns []').toBe(true);
    const self = apps.find((a: { platform?: string }) => a.platform === 'webapp');
    expect(self, 'no platform:"webapp" entry — Chrome needs exactly this to self-match').toBeTruthy();
    expect(self.url).toMatch(/\/manifest\.json$/);
  });

  it('prefer_related_applications stays false — the in-browser install prompt must keep firing', () => {
    // Flipping this true tells Chrome to steer installs toward the related
    // app INSTEAD of offering its own install UI — the opposite of what this
    // fix wants. The entry above is for detection only.
    expect(manifest.prefer_related_applications).toBe(false);
  });
});
