import { describe, it, expect } from 'vitest';
import { messageCadenceVerdict, MIN_SECONDS_BETWEEN_MESSAGES } from './sales-message-cadence';

const at = (iso: string) => new Date(iso);

describe('a logged WhatsApp message must be one that could have been sent', () => {
  it('lets the first message of a session through', () => {
    expect(messageCadenceVerdict(null, at('2026-09-15T14:00:00Z')).ok).toBe(true);
    expect(messageCadenceVerdict(undefined, at('2026-09-15T14:00:00Z')).ok).toBe(true);
  });

  it('lets an honest pace through untouched', () => {
    // A real send — open WhatsApp, type, send, come back — takes far longer
    // than this. A rep doing the work never meets this rule.
    expect(messageCadenceVerdict(at('2026-09-15T14:00:00Z'), at('2026-09-15T14:00:45Z')).ok).toBe(true);
    expect(messageCadenceVerdict(at('2026-09-15T14:00:00Z'), at('2026-09-15T14:05:00Z')).ok).toBe(true);
  });

  // ── THE BURST THIS EXISTS FOR ─────────────────────────────────────────────
  //
  // 8 Sep 2026, 19:27:45 → 19:29:51: twenty-two "messages", same template,
  // gaps of 3–6 seconds. Every one of these would now be refused.
  it('refuses the four-second cadence that produced 277 of 316 rows', () => {
    const v = messageCadenceVerdict(at('2026-09-08T13:57:45Z'), at('2026-09-08T13:57:49Z'));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.waitSeconds).toBe(16);
      expect(v.message).toContain('WhatsApp first');
    }
  });

  it('refuses right up to the boundary and passes on it', () => {
    const prev = at('2026-09-15T14:00:00Z');
    const justUnder = messageCadenceVerdict(prev, at('2026-09-15T14:00:19Z'));
    expect(justUnder.ok).toBe(false);
    expect(messageCadenceVerdict(prev, at(`2026-09-15T14:00:${MIN_SECONDS_BETWEEN_MESSAGES}Z`)).ok).toBe(true);
  });

  it('never reports a wait of zero seconds', () => {
    // 19.9s elapsed rounds to a 1s wait, not "try again in 0s" — an
    // instruction the rep cannot act on reads as a broken button.
    const v = messageCadenceVerdict(at('2026-09-15T14:00:00.000Z'), at('2026-09-15T14:00:19.900Z'));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.waitSeconds).toBeGreaterThanOrEqual(1);
  });

  // ── THE DIRECTION OF FAILURE ──────────────────────────────────────────────
  //
  // Every ambiguous input passes. Refusing honest work is the expensive
  // mistake: it teaches a counsellor that the log lies, and then nothing in
  // this system can be trusted. Letting one doubtful row through costs a row.
  it('passes a clock-skewed timestamp from the future', () => {
    expect(messageCadenceVerdict(at('2026-09-15T14:05:00Z'), at('2026-09-15T14:00:00Z')).ok).toBe(true);
  });

  it('passes an unparseable timestamp rather than blocking on it', () => {
    expect(messageCadenceVerdict('not a date', at('2026-09-15T14:00:00Z')).ok).toBe(true);
  });

  it('accepts an ISO string as readily as a Date', () => {
    expect(messageCadenceVerdict('2026-09-15T14:00:00.000Z', at('2026-09-15T14:00:05Z')).ok).toBe(false);
  });

  it('keeps the floor generous enough for three messages a minute', () => {
    expect(MIN_SECONDS_BETWEEN_MESSAGES).toBe(20);
  });
});
