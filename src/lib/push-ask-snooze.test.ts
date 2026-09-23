import { describe, it, expect } from 'vitest';
import { snoozeLater, laterSnoozed, clearSnooze, PUSH_ASK_LATER_KEY, type SnoozeStore } from './push-ask-snooze';

function memStore(): SnoozeStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('Later persists until a real re-entry', () => {
  it('is not snoozed until the student says Later', () => {
    expect(laterSnoozed(memStore())).toBe(false);
  });

  it('a Later survives a reload within the session', () => {
    const s = memStore();
    snoozeLater(s, 1_000);
    expect(laterSnoozed(s)).toBe(true);
    // A reload re-reads the same sessionStorage: still snoozed.
    expect(laterSnoozed({ ...s, getItem: (k) => s.map.get(k) ?? null })).toBe(true);
  });

  it('a re-entry clears it, so the founder\'s every-open rule resumes', () => {
    const s = memStore();
    snoozeLater(s, 1_000);
    clearSnooze(s);
    expect(laterSnoozed(s)).toBe(false);
  });

  it('a new session (empty store) is not snoozed — the app was closed', () => {
    const first = memStore();
    snoozeLater(first, 1_000);
    expect(laterSnoozed(memStore())).toBe(false);
  });

  it('a corrupt value does not count as a snooze', () => {
    const s = memStore();
    s.setItem(PUSH_ASK_LATER_KEY, 'garbage');
    expect(laterSnoozed(s)).toBe(false);
  });

  it('a storage that throws never breaks the ask', () => {
    const broken: SnoozeStore = {
      getItem: () => { throw new Error('quota'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('quota'); },
    };
    expect(() => snoozeLater(broken, 1)).not.toThrow();
    expect(laterSnoozed(broken)).toBe(false);
    expect(() => clearSnooze(broken)).not.toThrow();
  });
});
