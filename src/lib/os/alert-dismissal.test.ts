import { describe, it, expect } from 'vitest';
import {
  alertKind, isDismissReason, withoutDismissed, readDismissedIds, DISMISS_LABEL,
} from './alert-dismissal';

describe('closing an alert the founder has already handled', () => {
  it('subtracts only the closed ids and keeps the rest in order', () => {
    const alerts = [{ id: 'unlock:p1' }, { id: 'buddy:s2' }, { id: 'unlock:p3' }];
    const out = withoutDismissed(alerts, new Set(['unlock:p1']));
    expect(out.map((a) => a.id)).toEqual(['buddy:s2', 'unlock:p3']);
  });

  it('leaves the list untouched when nothing is closed', () => {
    const alerts = [{ id: 'unlock:p1' }, { id: 'buddy:s2' }];
    expect(withoutDismissed(alerts, new Set())).toHaveLength(2);
  });

  it('reads the kind from the id, so a dismissal cannot be mislabelled', () => {
    expect(alertKind('unlock:abc-123')).toBe('unlock');
    expect(alertKind('buddy:def-456')).toBe('buddy');
    // A burst id carries two colons; the kind is still the first segment.
    expect(alertKind('sacred-fail:log_daily:2026-09-05T04:00')).toBe('sacred-fail');
    expect(alertKind('idwithnocolon')).toBe('idwithnocolon');
  });

  it('accepts only the founder vocabulary', () => {
    expect(isDismissReason('assigned')).toBe(true);
    expect(isDismissReason('completed')).toBe(true);
    expect(isDismissReason('other')).toBe(true);
    expect(isDismissReason('resolved')).toBe(false);
    expect(isDismissReason(null)).toBe(false);
    expect(isDismissReason(7)).toBe(false);
  });

  it('names the two buttons the founder asked for', () => {
    expect(DISMISS_LABEL.assigned).toBe('Already assigned');
    expect(DISMISS_LABEL.completed).toBe('Completed');
  });

  // ── THE DIRECTION OF FAILURE ──────────────────────────────────────────────
  //
  // If the dismissal table cannot be read we must show MORE alerts, never
  // fewer. Hiding a live money problem because a table hiccuped is the exact
  // silence this subsystem exists to prevent.
  it('shows every alert when the closed set cannot be read', async () => {
    const failing = { from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'timeout' } }) }) };
    expect(await readDismissedIds(failing)).toEqual(new Set());
  });

  it('shows every alert when the read throws', async () => {
    const throwing = { from: () => ({ select: () => Promise.reject(new Error('down')) }) };
    expect(await readDismissedIds(throwing)).toEqual(new Set());
  });

  it('returns the closed ids on a healthy read', async () => {
    const ok = {
      from: () => ({
        select: () => Promise.resolve({ data: [{ alert_id: 'unlock:p1' }, { alert_id: 'buddy:s2' }], error: null }),
      }),
    };
    expect(await readDismissedIds(ok)).toEqual(new Set(['unlock:p1', 'buddy:s2']));
  });
});
