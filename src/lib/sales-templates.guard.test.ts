import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';
import {
  MESSAGE_TEMPLATES, TEMPLATE_KEYS, NAME_PLACEHOLDER,
  templateByKey, templateNote, templatesFor, renderTemplate,
} from './sales-templates';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// The clipboard makes it one tap to send the same sentence to hundreds of
// students, so the things that can go wrong are not typos. They are: someone
// editing copy that is not theirs; a key renamed and every recorded row
// orphaned; a message reaching a student with "[Name]" still in it; and the
// server trusting a key the client made up.

const VARS = { firstName: 'Rohit' };

// ── ANSHUL'S COPY, PINNED ───────────────────────────────────────────────────
//
// Founder, 19 Sep 2026: "Do NOT change Anshul's four WhatsApp message
// templates ... Do not trim them, rewrite them, add a sender name, or modify
// them to fit any house style." The first implementation did exactly that, so
// the instruction is enforced here rather than trusted to memory.
//
// These four strings are the record of what he wrote. If a future change —
// mine, another agent's, a well-meant tidy-up — alters so much as an
// apostrophe, this test fails and names the template. Changing the copy means
// changing this block too, which is the point: it cannot happen quietly, and
// whoever does it is stating that they had the authority to.
const ANSHUL_COPY: Record<string, string> = {
  no_answer_reachout:
    'Hi [Name], I tried reaching you regarding your CAT preparation. I just wanted to understand where you currently stand with your preparation and whether your routine is going the way you planned. Whenever you get a moment, just drop me a message — I’d be happy to connect.',
  busy_callback:
    'Hi [Name], no worries, I understand you were occupied. Whenever you get a little time, just drop me a quick message and I’ll connect with you. I’d genuinely like to know how your preparation is shaping up and whether everything is on track.',
  general_followup:
    'Hi [Name], just checking in — how are things going with your CAT preparation? Are you able to follow the routine you had planned, or is something making it difficult to stay consistent? Whenever you’re free, feel free to share an update with me. I’ll be happy to help wherever I can.',
  app_difficulty:
    'Hi [Name], I wanted to check something with you regarding your preparation. Are you actually able to make the application work around your current routine, or are you facing any difficulty with the schedule/tasks? Just let me know whenever you’re free — we can figure it out together.',
};

describe("Anshul's copy ships exactly as he wrote it", () => {
  it.each(Object.keys(ANSHUL_COPY))('%s is verbatim', (key) => {
    const t = templateByKey(key);
    expect(t, `template ${key} is missing`).not.toBeNull();
    expect(t!.copy).toBe(ANSHUL_COPY[key]);
  });

  it('ships his four labels, named as he named them', () => {
    expect(MESSAGE_TEMPLATES.map((t) => t.label)).toEqual([
      'No Answer / First Reach-out',
      'Busy / Callback',
      'General Follow-up',
      'App / Preparation Follow-up',
    ]);
  });

  it('adds no sender name and no sign-off', () => {
    // The rewrite the founder rejected appended "— Anshul, CareerRai". Nothing
    // may be appended to his text, by us or by the renderer.
    for (const t of MESSAGE_TEMPLATES) {
      expect(renderTemplate(t, VARS)).toBe(ANSHUL_COPY[t.key].split(NAME_PLACEHOLDER).join('Rohit'));
    }
  });

  it('adds no template the founder did not approve', () => {
    expect(MESSAGE_TEMPLATES.length).toBe(4);
  });
});

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

describe('the placeholder is filled before the student sees it', () => {
  it.each(MESSAGE_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s renders the name and leaves no placeholder',
    (_key, t) => {
      // His copy carries "[Name]" on purpose — that is the placeholder doing
      // its job. The RENDERED message must never still contain it, or the
      // student receives the brackets literally.
      expect(t.copy).toContain(NAME_PLACEHOLDER);
      const sent = renderTemplate(t, VARS);
      expect(sent).toContain('Rohit');
      expect(sent).not.toContain(NAME_PLACEHOLDER);
      expect(sent).not.toMatch(/\{\{?\s*\w+\s*\}?\}/);
    },
  );

  it('fills every occurrence, not only the first', () => {
    const t = { key: 'x', label: 'x', copy: 'Hi [Name], bye [Name]', lanes: [] as never[] };
    expect(renderTemplate(t, VARS)).toBe('Hi Rohit, bye Rohit');
  });
});

// ── INCIDENT #76 ────────────────────────────────────────────────────────────
// Three timetable refusal messages ended "or add your classes by hand" — a
// screen that has never existed anywhere in the product. This guards the
// templates added AFTER Anshul's four; his are pinned verbatim above and pass
// it, which is part of why they were safe to ship unedited.
describe('no template names a door the product does not have', () => {
  it('names no screen or action that does not exist', () => {
    const PHANTOM = [
      /by hand/i, /manually add/i, /upload your (?:marksheet|report)/i,
      /click the link below/i, /reply\s+(?:YES|STOP|1)\b/i,
      /dashboard/i, /settings page/i,
    ];
    for (const t of MESSAGE_TEMPLATES) {
      for (const p of PHANTOM) {
        expect(renderTemplate(t, VARS), `${t.key} names a phantom door: ${p}`).not.toMatch(p);
      }
    }
  });

  it('asks a question rather than pitching a price', () => {
    // These four are follow-ups, not the conversion lane. A price in a
    // "how is prep going?" message turns a check-in into a sales call.
    for (const t of MESSAGE_TEMPLATES) {
      expect(renderTemplate(t, VARS)).not.toMatch(/₹|\brs\.?\s*\d|\bprice\b|\bbuy\b/i);
    }
  });
});

describe('templateByKey never trusts the client', () => {
  it('resolves a shipped key', () => {
    expect(templateByKey('busy_callback')?.label).toBe('Busy / Callback');
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
    expect(templateNote(t)).toBe('Sent: General Follow-up');
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

  it('the card opens WhatsApp with the rendered copy, not the raw placeholder', () => {
    const deck = read('src/components/call-deck.tsx');
    expect(deck).toMatch(/renderTemplate/);
  });
});
