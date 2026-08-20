import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SESSION_PRICE_PAISE } from './session-credit';

// ── The outbound sales script may only promise what a student can receive ──
//
// First written 13 Aug 2026, when the queue script promised free mentor
// messages nobody could collect and a "no risk" refund without its condition.
// Rewritten 20 Aug (founder ruling): the 10-call experiment sells exactly ONE
// offer — the Rs 299 single session — and the script, the landing surface
// (/student/buddy) and the checkout (/api/sessions/book) must quote the same
// number. The price here is IMPORTED from the checkout's own constant, so the
// script literally cannot drift from what Razorpay charges.
//
// Sessions carry NO money-back promise (founder ruling: the 7-day credit
// toward Till-CAT is a discount, not money back). So unlike the old guard,
// which required the refund's condition to travel with it, the script files
// now must not make refund claims AT ALL.

// Claims are what students RECEIVE — strip // comment lines before matching,
// so the guard reads the copy, not the engineering notes about the copy.
function copyOf(file: string): string {
  return readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

const SCRIPT_FILES = [
  'src/lib/sales-conversion.ts', // the pitch + objection playbook read on a call
  'src/lib/mission-queue.ts',    // the founder's daily-45 WhatsApp drafts
];

describe('one offer, one price, imported from checkout', () => {
  const want = `Rs ${SESSION_PRICE_PAISE / 100}`;

  it.each(SCRIPT_FILES)('%s quotes only the session price the checkout charges', (file) => {
    const src = copyOf(file);
    const quoted = [...new Set(src.match(/Rs \d{1,3}(?:,\d{3})*/g) ?? [])];
    // Every literal price in the file must be the session price. Prices built
    // from ${SESSION_RS} interpolation are tied to the constant by construction.
    for (const q of quoted) expect(q, `${file} quotes ${q}`).toBe(want);
  });

  it('the conversion script computes its price from SESSION_PRICE_PAISE', () => {
    const src = readFileSync('src/lib/sales-conversion.ts', 'utf8');
    expect(src).toContain('SESSION_PRICE_PAISE / 100');
  });

  it('the script sends students to the surface that sells the session', () => {
    const src = readFileSync('src/lib/sales-conversion.ts', 'utf8');
    expect(src).toContain('/student/buddy');
  });
});

describe('the quoted price is the charged price', () => {
  it('while GST is off, the script quotes the flat session price a student actually pays', async () => {
    // GST_ENABLED=false → checkout charges exactly Rs 299 (verified in
    // production: every session row has gst_paise=0). The day GST_ENABLED
    // flips true the student pays Rs 353, and this test fails on purpose:
    // update the script copy to say "+ GST" in the same commit as the flag.
    const { GST_ENABLED } = await import('./gst');
    if (!GST_ENABLED) {
      for (const file of SCRIPT_FILES) expect(copyOf(file)).not.toMatch(/\+\s*GST/i);
    } else {
      expect(copyOf('src/lib/sales-conversion.ts')).toMatch(/\+\s*GST/i);
    }
  });
});

describe('no undeliverable promises', () => {
  it.each(SCRIPT_FILES)('%s makes no refund / money-back claim', (file) => {
    expect(copyOf(file)).not.toMatch(/refund|money.?back|paise wapas/i);
  });

  it.each(SCRIPT_FILES)('%s does not offer the dormant free-message mechanic', (file) => {
    const src = copyOf(file);
    expect(src).not.toMatch(/(?<!-)free\s+(message|question)/i);
    expect(src).not.toContain('MENTOR_FREE_MESSAGES');
  });

  it.each(SCRIPT_FILES)('%s never claims zero risk', (file) => {
    expect(copyOf(file)).not.toMatch(/no risk|risk[- ]free/i);
  });

  // wa-messages is a separate campaign surface (not the call script); it keeps
  // the original rules: no free-message offers, no unconditioned claims.
  it('wa-messages stays free of the dormant free-message offer', () => {
    const src = readFileSync('src/lib/wa-messages.ts', 'utf8');
    expect(src).not.toMatch(/(?<!-)free\s+(message|question)/i);
    expect(src).not.toContain('MENTOR_FREE_MESSAGES');
  });
});
