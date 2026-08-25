import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SESSION_INTENTS, PRODUCT_FINDINGS, INTENT_LABEL, INTENT_TO_SPECIALITY,
  isSessionIntent, intentNeedsNote, validateIntents, MAX_INTENTS, MIN_NOTE_LENGTH,
} from './session-intent';
import { FINDING_TO_SPECIALITY } from './session-credit';

const MIGRATION = 'supabase/migrations/20260824j_session_intent_and_feedback.sql';
const SQL = readFileSync(MIGRATION, 'utf8');
const MULTI_SQL = readFileSync('supabase/migrations/20260825b_session_intent_multi.sql', 'utf8');
const BOOK = readFileSync('src/app/api/sessions/book/route.ts', 'utf8');
const ACTIVATE = readFileSync('src/lib/activate-payment.ts', 'utf8');

// ONE VOCABULARY, TWO PROVENANCES. finding_kind is what the PRODUCT observed;
// session_intent is what the STUDENT said. Different facts, one list.

describe('the taxonomy was EXTENDED, not forked', () => {
  it('every legacy finding kind still resolves to a speciality', () => {
    // The six that already existed must keep working — mentor matching runs
    // on them today.
    for (const kind of Object.keys(FINDING_TO_SPECIALITY)) {
      expect(INTENT_TO_SPECIALITY[kind as keyof typeof INTENT_TO_SPECIALITY],
        `${kind} lost its speciality in the extension`).toBeTruthy();
    }
  });

  it('legacy kinds keep the SAME speciality they had before', () => {
    // Extending must not silently re-route an existing finding to a different
    // kind of mentor.
    for (const [kind, spec] of Object.entries(FINDING_TO_SPECIALITY)) {
      expect(INTENT_TO_SPECIALITY[kind as keyof typeof INTENT_TO_SPECIALITY]).toBe(spec);
    }
  });

  it('section weaknesses reuse the section_depth speciality that already existed', () => {
    // The answer existed before the question: FINDING_TO_SPECIALITY declared
    // 'section_depth' with nothing pointing at it.
    for (const k of ['varc_weak', 'dilr_weak', 'qa_weak'] as const) {
      expect(INTENT_TO_SPECIALITY[k]).toBe('section_depth');
    }
  });

  it('every intent and finding has a label and a speciality', () => {
    for (const k of [...SESSION_INTENTS, ...PRODUCT_FINDINGS]) {
      expect(INTENT_LABEL[k], `${k} has no label`).toBeTruthy();
      expect(INTENT_TO_SPECIALITY[k], `${k} has no speciality`).toBeTruthy();
    }
  });

  it('student-selectable and product-only kinds never overlap', () => {
    for (const k of PRODUCT_FINDINGS) {
      expect(SESSION_INTENTS as readonly string[]).not.toContain(k);
    }
  });
});

describe('code and the database hold the SAME vocabulary', () => {
  const rows = [...SQL.matchAll(/\('([a-z_]+)',\s*'[^']*',\s*'([a-z_]+)',\s*(true|false),\s*\d+\)/g)]
    .map((m) => ({ kind: m[1], speciality: m[2], selectable: m[3] === 'true' }));

  it('the migration seeds every kind the code knows', () => {
    expect(rows.length).toBeGreaterThanOrEqual(15);
    const dbKinds = rows.map((r) => r.kind).sort();
    expect(dbKinds).toEqual([...SESSION_INTENTS, ...PRODUCT_FINDINGS].sort());
  });

  it('the speciality mapping agrees in both places', () => {
    for (const r of rows) {
      expect(INTENT_TO_SPECIALITY[r.kind as keyof typeof INTENT_TO_SPECIALITY],
        `${r.kind} maps differently in code and DB`).toBe(r.speciality);
    }
  });

  it('exactly the student-facing kinds are selectable', () => {
    const dbSelectable = rows.filter((r) => r.selectable).map((r) => r.kind).sort();
    expect(dbSelectable).toEqual([...SESSION_INTENTS].sort());
  });
});

describe('"Something else" must be explained', () => {
  it('only other needs a note', () => {
    expect(intentNeedsNote('other')).toBe(true);
    for (const k of SESSION_INTENTS.filter((x) => x !== 'other')) {
      expect(intentNeedsNote(k)).toBe(false);
    }
  });

  it('other with no note is rejected', () => {
    expect(validateIntents(['other'], '').ok).toBe(false);
  });

  it('other with whitespace only is rejected', () => {
    expect(validateIntents(['other'], '   ').ok).toBe(false);
  });

  it('other with a real note is accepted and trimmed', () => {
    const r = validateIntents(['other'], '  coaching moved to mornings  ');
    expect(r.ok).toBe(true);
    expect(r.ok && r.note).toBe('coaching moved to mornings');
  });

  it('other as a SECOND pick still needs the note', () => {
    // The gap the single-value CHECK could not see: a real reason, then
    // "Something else", with nothing written after it.
    expect(validateIntents(['qa_weak', 'other'], '').ok).toBe(false);
    expect(validateIntents(['qa_weak', 'other'], 'abc').ok).toBe(true);
  });

  it('THE DATABASE enforces it too', () => {
    // Both, deliberately: the constraint is the guarantee, the function is the
    // readable error.
    expect(SQL).toMatch(/session_intent is distinct from 'other'\s*\n?\s*or \(session_intent_note is not null and length\(btrim\(session_intent_note\)\) >= 3\)/);
  });

  it('a missing intent is rejected outright — the reason is MANDATORY', () => {
    expect(validateIntents(undefined, '').ok).toBe(false);
    expect(validateIntents([], '').ok).toBe(false);
    expect(validateIntents(['made_up_kind'], '').ok).toBe(false);
    // One bad apple in an otherwise valid list still fails the whole list.
    expect(validateIntents(['qa_weak', 'made_up_kind'], '').ok).toBe(false);
  });

  it('a long note is truncated rather than rejected', () => {
    const r = validateIntents(['qa_weak'], 'x'.repeat(900));
    expect(r.ok).toBe(true);
    expect(r.ok && (r.note?.length ?? 0)).toBeLessThanOrEqual(500);
  });

  it('an optional empty note becomes null, not an empty string', () => {
    const r = validateIntents(['qa_weak'], '   ');
    expect(r.ok && r.note).toBeNull();
  });
});

describe('a student may state up to three reasons', () => {
  it('accepts one, two or three and keeps the picking order', () => {
    const r = validateIntents(['dilr_weak', 'qa_weak', 'consistency'], '');
    expect(r.ok).toBe(true);
    expect(r.ok && r.intents).toEqual(['dilr_weak', 'qa_weak', 'consistency']);
  });

  it('the FIRST pick is the primary — it is what chooses the mentor', () => {
    const r = validateIntents(['consistency', 'qa_weak'], '');
    expect(r.ok && r.primary).toBe('consistency');
    // Not the alphabetically first, not the "most severe" by some hidden
    // ranking. The student's own first tap.
    const flipped = validateIntents(['qa_weak', 'consistency'], '');
    expect(flipped.ok && flipped.primary).toBe('qa_weak');
  });

  it(`refuses more than ${MAX_INTENTS}`, () => {
    const r = validateIntents(['qa_weak', 'dilr_weak', 'consistency', 'varc_weak'], '');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/up to 3/);
  });

  it('refuses a repeated reason rather than silently collapsing it', () => {
    // Silently deduping would mean the student taps three things and the
    // mentor is briefed on two, with nothing saying so.
    expect(validateIntents(['qa_weak', 'qa_weak'], '').ok).toBe(false);
  });

  it('still accepts a bare string, so an un-updated client keeps working', () => {
    const r = validateIntents('qa_weak', '');
    expect(r.ok).toBe(true);
    expect(r.ok && r.intents).toEqual(['qa_weak']);
    expect(r.ok && r.primary).toBe('qa_weak');
  });

  it('THE DATABASE enforces every one of these too', () => {
    // Verified against careerrai-test with real INSERTs before this shipped:
    // 4 reasons, a primary that disagrees with element 1, a duplicate, an
    // unknown kind in a non-primary slot, and "other" without a note were all
    // refused, each with its own distinct message.
    expect(MULTI_SQL).toMatch(/must hold 1 to 3 reasons/);
    expect(MULTI_SQL).toMatch(/must equal the first reason picked/);
    expect(MULTI_SQL).toMatch(/must not repeat a reason/);
    expect(MULTI_SQL).toMatch(/unknown session intent/);
  });
});

describe('type guard', () => {
  it('accepts real intents and rejects product-only kinds as CHOICES', () => {
    for (const k of SESSION_INTENTS) expect(isSessionIntent(k)).toBe(true);
    // A student cannot claim the product's own diagnosis as their stated reason.
    for (const k of PRODUCT_FINDINGS) expect(isSessionIntent(k)).toBe(false);
    expect(isSessionIntent(null)).toBe(false);
  });
});

describe('the reason now actually reaches the credit', () => {
  it('booking validates the intent BEFORE creating a Razorpay order', () => {
    const validateAt = BOOK.indexOf('validateIntents(');
    const orderAt = BOOK.indexOf('createRazorpayOrder(');
    expect(validateAt).toBeGreaterThan(-1);
    expect(validateAt, 'a student must never be charged for a booking the DB would refuse')
      .toBeLessThan(orderAt);
  });

  it('the intent is written onto the payment row', () => {
    expect(BOOK).toMatch(/session_intent: intent\.primary/);
    expect(BOOK).toMatch(/session_intent_all: intent\.intents/);
    expect(BOOK).toMatch(/session_intent_note: intent\.note/);
  });

  it('THE ROOT CAUSE: the activation query now SELECTS the reason columns', () => {
    // activateSessionCredit read row.finding_kind from a column that was never
    // selected (and did not exist), so every credit was minted with null.
    const loader = ACTIVATE.slice(ACTIVATE.indexOf('readWebhookPaymentRow'));
    expect(loader).toMatch(/finding_kind/);
    expect(loader).toMatch(/session_intent/);
  });

  it('the credit carries the intent forward', () => {
    expect(ACTIVATE).toMatch(/session_intent: row\.session_intent/);
  });

  it('matching prefers the student’s stated intent over the diagnosis', () => {
    // And with several reasons stated it is the PRIMARY — the student's first
    // pick — never an arbitrary one of the three.
    expect(BOOK).toMatch(/findingKind: intent\.primary/);
  });

  it('the ₹299 path still refuses to grant premium', () => {
    const fn = ACTIVATE.slice(ACTIVATE.indexOf('async function activateSessionCredit'),
      ACTIVATE.indexOf('export async function activatePaidOrder'));
    expect(fn).not.toMatch(/is_premium/);
    expect(fn).not.toMatch(/grantPremiumAndQueueBuddy/);
  });
});

describe('the note floor is one number', () => {
  it('code and DB agree on the minimum', () => {
    expect(MIN_NOTE_LENGTH).toBe(3);
    expect(SQL).toContain('>= 3');
  });
});
