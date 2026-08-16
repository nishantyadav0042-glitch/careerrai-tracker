import { describe, it, expect } from 'vitest';
import { classifyActionAttribution } from './action-attribution';

const T = (iso: string) => iso; // readability alias

describe('classifyActionAttribution — the founder\'s rule, applied literally: never emit "acted" without a hard wire', () => {
  it('no action recorded at all: unknown', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'), clickedAt: null, appOpenedAt: null, actionCompletedAt: null,
    });
    expect(v).toBe('unknown');
  });

  it('action happened BEFORE the notification even existed: never attributed, regardless of click/open', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'),
      clickedAt: T('2026-08-16T10:01:00Z'), appOpenedAt: T('2026-08-16T10:01:00Z'),
      actionCompletedAt: T('2026-08-16T09:00:00Z'), // an hour BEFORE the notification
    });
    expect(v).toBe('not_attributed');
  });

  it('action happened after the notification, but the notification was never clicked: not attributed', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'), clickedAt: null, appOpenedAt: null,
      actionCompletedAt: T('2026-08-16T10:30:00Z'),
    });
    expect(v).toBe('not_attributed');
  });

  it('clicked, but app-open was never proven attributable: not attributed — the full chain is required', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'), clickedAt: T('2026-08-16T10:01:00Z'), appOpenedAt: null,
      actionCompletedAt: T('2026-08-16T10:05:00Z'),
    });
    expect(v).toBe('not_attributed');
  });

  it('clicked, app-opened, action completed 5 minutes later: correlated', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'),
      clickedAt: T('2026-08-16T10:01:00Z'), appOpenedAt: T('2026-08-16T10:01:30Z'),
      actionCompletedAt: T('2026-08-16T10:06:30Z'),
    });
    expect(v).toBe('correlated');
  });

  it('action completed well beyond the correlation window: not attributed — too weak a link to claim', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'),
      clickedAt: T('2026-08-16T10:01:00Z'), appOpenedAt: T('2026-08-16T10:01:30Z'),
      actionCompletedAt: T('2026-08-16T14:00:00Z'), // ~4 hours later
    });
    expect(v).toBe('not_attributed');
  });

  it('action completed BEFORE this specific app-open (but after the notification): not attributed', () => {
    // e.g. the student logged today's report on their own earlier, THEN
    // separately tapped this notification later — the log can't be this
    // notification's consequence if it predates the very app-open being
    // measured, even though it postdates notification creation.
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T08:00:00Z'),
      clickedAt: T('2026-08-16T10:00:00Z'), appOpenedAt: T('2026-08-16T10:00:30Z'),
      actionCompletedAt: T('2026-08-16T09:00:00Z'),
    });
    expect(v).toBe('not_attributed');
  });

  it('a custom, tighter window is respected', () => {
    const v = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'),
      clickedAt: T('2026-08-16T10:01:00Z'), appOpenedAt: T('2026-08-16T10:01:00Z'),
      actionCompletedAt: T('2026-08-16T10:11:00Z'), // 10 minutes after open
      windowMinutes: 5,
    });
    expect(v).toBe('not_attributed');
  });

  it('never returns "acted" for ANY input — the whole point of this module', () => {
    const anyVerdict = classifyActionAttribution({
      notificationCreatedAt: T('2026-08-16T10:00:00Z'),
      clickedAt: T('2026-08-16T10:01:00Z'), appOpenedAt: T('2026-08-16T10:01:00Z'),
      actionCompletedAt: T('2026-08-16T10:02:00Z'),
    });
    expect(['correlated', 'not_attributed', 'unknown']).toContain(anyVerdict);
    expect(anyVerdict).not.toBe('acted');
  });
});
