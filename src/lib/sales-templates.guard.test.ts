import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';
import {
  MESSAGE_TEMPLATES, TEMPLATE_KEYS, templateByKey, templateNote, templatesFor,
} from './sales-templates';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// The clipboard makes it one tap to send the same sentence to hundreds of
// students, so the things that can go wrong are not typos. They are: a key
// renamed and every recorded row orphaned; a message that promises a screen
// the product does not have; a template that reaches the student with
// "[Name]" still in it; and the server trusting a key the client made up.

const VARS = { firstName: 'Rohit', repFirstName: 'Anshul' };

describe('message template keys are an append-only contract', () => {
  // Written to sales_activity.template_key. A rename does not migrate the
  // rows already recorded under the old name — it silently splits one
  // template's history in two and makes "which message works?" unanswerable.
  // Retire a template by emptying its `lanes`, never by renaming its key.
  it('ships exactly the keys recorded in the database', () => {
    expect([...TEMPLATE_KEYS].sort()).toEqual([
      'app_difficulty',
      'busy_callback',
      'general_followup',
      'no_answer_reachout',
    ]);
  });

  it('has no duplicate keys', () => {
    expect(new Set(TEMPLATE_KEYS).size).toBe(TEMPLATE_KEYS.length);
  });
});

describe('every template produces a message that could be sent as-is', () => {
  it.each(MESSAGE_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s addresses the student by name and names no placeholder',
    (_key, t) => {
      const text = t.body(VARS);
      expect(text).toContain('Rohit');
      // The counsellor's own drafts used "[Name]". If one ever ships with the
      // bracket intact, the student receives it literally.
      expect(text).not.toMatch(/\[[A-Za-z ]+\]/);
      expect(text).not.toMatch(/\{\{?\s*\w+\s*\}?\}/);
      expect(text.trim().length).toBeGreaterThan(40);
    },
  );

  it('identifies the sender in every message', () => {
    // A WhatsApp from an unknown number with no sender is the one that gets
    // blocked. Either the body introduces the rep or it signs off as them.
    for (const t of MESSAGE_TEMPLATES) {
      expect(t.body(VARS)).toContain('Anshul');
      expect(t.body(VARS)).toContain('CareerRai');
    }
  });

  // ── INCIDENT #76 ──────────────────────────────────────────────────────────
  // Three timetable refusal messages ended "or add your classes by hand" — a
  // screen that has never existed anywhere in the product. A message that
  // names a door the student cannot find is worse than no message.
  it('names no screen or action the product does not have', () => {
    const PHANTOM = [
      /by hand/i, /manually add/i, /upload your (?:marksheet|report)/i,
      /click the link below/i, /reply\s+(?:YES|STOP|1)\b/i,
      /dashboard/i, /settings page/i,
    ];
    for (const t of MESSAGE_TEMPLATES) {
      const text = t.body(VARS);
      for (const p of PHANTOM) {
        expect(text, `${t.key} names a phantom door: ${p}`).not.toMatch(p);
      }
    }
  });

  it('asks a question rather than pitching a price', () => {
    // These four are follow-ups, not the conversion lane. A price in a
    // "how is prep going?" message turns a check-in into a sales call.
    for (const t of MESSAGE_TEMPLATES) {
      expect(t.body(VARS)).not.toMatch(/₹|\brs\.?\s*\d|\bprice\b|\bbuy\b/i);
    }
  });
});

describe('templateByKey never trusts the client', () => {
  it('resolves a shipped key', () => {
    expect(templateByKey('busy_callback')?.label).toBe('Busy / call back later');
  });

  it.each([
    ['unknown string', 'not_a_template'],
    ['empty', ''],
    ['null', null],
    ['number', 7],
    ['object', { key: 'busy_callback' }],
  ])('rejects %s', (_name, value) => {
    expect(templateByKey(value)).toBeNull();
  });
});

describe('the lane offer honours the no-canned-message doctrine', () => {
  it('offers the three follow-up lanes a real choice', () => {
    // The gap this module was built for: callback/retry/followup shared one
    // generic line, and were 386 of one rep's 1,066 cards over 14 days.
    for (const lane of ['retry', 'callback', 'followup'] as const) {
      expect(templatesFor({ lane, hasRemarks: false }).templates.length).toBeGreaterThan(0);
    }
  });

  it('cautions instead of leading with a template when the student spoke', () => {
    // call-queue.ts, 15 Sep: answering a student who told us why they could
    // not study "with a template wastes the one moment they chose to tell us
    // something." The templates stay reachable; they stop being the default.
    const quiet = templatesFor({ lane: 'attention', hasRemarks: false });
    const spoke = templatesFor({ lane: 'attention', hasRemarks: true });
    expect(quiet.caution).toBeNull();
    expect(spoke.caution).toBeTruthy();
    expect(spoke.templates).toEqual(quiet.templates);
  });

  it('never cautions about templates it does not offer', () => {
    const none = templatesFor({ lane: 'checkout_abandoned', hasRemarks: true });
    expect(none.templates).toEqual([]);
    expect(none.caution).toBeNull();
  });
});

describe('the log note carries the template, not the prose', () => {
  it('names the template so the row is readable without a join', () => {
    const t = templateByKey('general_followup')!;
    expect(templateNote(t)).toBe('Sent: General follow-up');
  });
});

// ── THE PIPE, NOT ONLY THE WRITER ───────────────────────────────────────────
//
// A previous guard in this repo tested that a module emitted an event and
// passed for a month while the route silently dropped it. So this asserts the
// two ends that must stay connected: the route must validate the key through
// templateByKey, and the card must record it.
describe('the template key survives the trip to the database', () => {
  const read = (p: string) => codeOnly(readFileSync(join(process.cwd(), p), 'utf8'));

  it('the log route validates the key server-side', () => {
    const route = read('src/app/api/sales/log/route.ts');
    expect(route).toMatch(/templateByKey/);
    expect(route).toMatch(/template_key/);
  });

  it('the call deck sends the key it used', () => {
    const deck = read('src/components/call-deck.tsx');
    expect(deck).toMatch(/templateKey/);
  });
});
