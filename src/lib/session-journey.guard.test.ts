import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── B and D are LIVE, or they are not built ─────────────────────────────────
//
// Both workstreams were data- and component-complete but mounted nowhere: a
// student could not have reached either surface. These guards assert the two
// are actually in the journey, and stay there.

const BOOK = readFileSync('src/components/buddy/book-session-card.tsx', 'utf8');
const STUDENT = readFileSync('src/app/student/buddy/page.tsx', 'utf8');
const ROUTE = readFileSync('src/app/api/sessions/book/route.ts', 'utf8');

describe('WHY is asked before the money — on EVERY payment path', () => {
  it('the intent picker is mounted in the real ₹299 card', () => {
    expect(BOOK).toMatch(/<IntentPicker/);
  });

  it('the standard CTA is disabled until the intent is complete', () => {
    expect(BOOK).toMatch(/disabled=\{busy \|\| !readyToPay\}/);
  });

  it('THERE IS NO ANCHOR PATH LEFT TO BYPASS THE GATE', () => {
    // The iOS hand-off was an <a href>, which navigates whatever its onClick
    // does — so gating only the button once left a whole platform able to
    // reach checkout with no stated reason.
    //
    // That anchor is now gone entirely (25 Aug: every surface pays in place),
    // which is strictly stronger than gating it: there is one button, and the
    // gate is on the button.
    expect(BOOK).not.toMatch(/href=\{iosUrl\}/);
    expect(BOOK).not.toMatch(/useIosPayUrl/);
    expect(BOOK).toMatch(/disabled=\{busy \|\| !readyToPay\}/);
  });

  it('the handler refuses even if a CTA is somehow reached', () => {
    expect(BOOK).toMatch(/if \(!readyToPay\) return;/);
  });

  it('and the SERVER refuses independently of the UI', () => {
    const validateAt = ROUTE.indexOf('validateIntents(');
    const orderAt = ROUTE.indexOf('createRazorpayOrder(');
    expect(validateAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(orderAt);
  });

  it('the intent travels with the booking request', () => {
    expect(BOOK).toMatch(/session_intents: intents/);
    expect(BOOK).toMatch(/session_intent_note/);
  });

  it('the student’s words stay SEPARATE from the product’s diagnosis', () => {
    // Both are sent. Collapsing them would erase the most interesting case:
    // a student who says QA while the mocks say DILR.
    expect(BOOK).toMatch(/finding_kind: findingKind/);
    expect(BOOK).toMatch(/session_intents: intents/);
  });
});

describe('feedback is live, and only where it is allowed to be', () => {
  it('the card is mounted on the student’s own buddy page', () => {
    expect(STUDENT).toMatch(/<SessionFeedbackCard/);
  });

  it('it is offered ONLY for a completed session', () => {
    // recentCompleted is the completed-session query; the prompt is derived
    // from it and from nothing else.
    expect(STUDENT).toMatch(/completedIds/);
    const derive = STUDENT.slice(STUDENT.indexOf('const completedIds'));
    expect(derive).toMatch(/recentCompleted/);
    // It must not be derived from the upcoming/scheduled list.
    const promptBlock = STUDENT.slice(
      STUDENT.indexOf('let awaitingFeedback'), STUDENT.indexOf('<BuddyPanelTabs'));
    expect(promptBlock).not.toMatch(/upcoming/);
  });

  it('an already-rated session is not asked again', () => {
    expect(STUDENT).toMatch(/from\('session_feedback'\)/);
    expect(STUDENT).toMatch(/done\.has/);
  });

  it('a failed read means no prompt, never a duplicate ask', () => {
    expect(STUDENT).toMatch(/if \(!ratedError\)/);
  });

  it('only ONE card is shown, not a stack of them', () => {
    // A queue of feedback forms is a queue nobody fills.
    expect(STUDENT).toMatch(/\.find\(/);
    expect(STUDENT).not.toMatch(/awaitingFeedback\.map\(/);
  });

  it('a session with no buddy is never offered for rating', () => {
    expect(STUDENT).toMatch(/x\.buddy_id != null/);
  });
});

describe('the ₹299 boundary survived this pass', () => {
  const ACTIVATE = readFileSync('src/lib/activate-payment.ts', 'utf8');

  it('the session path still grants no premium and no permanent buddy', () => {
    const fn = ACTIVATE.slice(ACTIVATE.indexOf('async function activateSessionCredit'),
      ACTIVATE.indexOf('export async function activatePaidOrder'));
    expect(fn).not.toMatch(/is_premium/);
    expect(fn).not.toMatch(/grantPremiumAndQueueBuddy/);

    // The one-time relationship must NOT become the ongoing one — meaning the
    // ₹299 path never writes profiles.buddy_id.
    //
    // The first version of this banned the STRING `buddy_id:` and fired the
    // moment assignment legitimately set it on mentor_grants. Pin the
    // behaviour: which TABLE is being updated, not which words appear.
    const profileWrites = [...fn.matchAll(/\.from\(['"]profiles['"]\)([\s\S]{0,240})/g)]
      .map((m) => m[1])
      .filter((tail) => /\.update\s*\(/.test(tail));
    for (const w of profileWrites) {
      expect(w, 'the ₹299 path writes profiles.buddy_id — that is the premium relationship')
        .not.toMatch(/buddy_id/);
    }
    // And the grant write, which IS allowed, must target mentor_grants.
    if (/buddy_id: assigned\.buddyId/.test(fn)) {
      const grantBlock = fn.slice(fn.lastIndexOf("from('mentor_grants')", fn.indexOf('buddy_id: assigned.buddyId')));
      expect(grantBlock).toMatch(/buddy_id: assigned\.buddyId/);
    }
  });

  it('it still issues exactly the three messages', () => {
    expect(ACTIVATE).toMatch(/messages_allowance: MENTOR_FREE_MESSAGES/);
  });
});
