import { describe, it, expect } from 'vitest';
import { normalizeStoreSource } from './store-build';

// The one accepted-values list for "?source= says this is a store build."
// Guarded by tests because this exact concept once had TWO implementations —
// proxy.ts checked twa|ios for its cookie while install/detect.ts checked
// ios-app|android-app for its localStorage flag, so no single start URL
// satisfied both. Every layer now calls this function; these tests are what
// stop a third list from quietly appearing with different values.

describe('normalizeStoreSource', () => {
  it('accepts the canonical values', () => {
    expect(normalizeStoreSource('twa')).toBe('twa');
    expect(normalizeStoreSource('ios')).toBe('ios');
  });

  it('normalises the documented aliases to canonical values', () => {
    // These appeared in the App Store runbook before the two lists were
    // unified. A start URL configured from any doc version must keep working,
    // and must produce the canonical cookie value that regex consumers expect.
    expect(normalizeStoreSource('ios-app')).toBe('ios');
    expect(normalizeStoreSource('android-app')).toBe('twa');
  });

  it('rejects everything else', () => {
    for (const junk of ['IOS', 'Twa', 'web', 'pwa', 'ios-app-2', '', ' ios', 'twa ']) {
      expect(normalizeStoreSource(junk), `"${junk}" must not mark a store build`).toBeNull();
    }
    expect(normalizeStoreSource(null)).toBeNull();
    expect(normalizeStoreSource(undefined)).toBeNull();
  });
});
