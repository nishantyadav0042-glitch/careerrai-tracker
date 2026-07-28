import { describe, it, expect } from 'vitest';
import {
  COMPANION_SLOTS, morningCopy, factCopy, openCopy, progressCopy, logCopy,
  closeCopy, planMorningCopy, planOpenCopy, planProgressCopy, planLogCopy,
  kickoffCopy, missedCheckInKickoffCopy, sparkCopy, windCopy,
  activationSlotCopy, reactivationSlotCopy, companionTip, companionStrategy,
  type SlotCopy,
} from './companion';
import { ONBOARDING_DAYS, onboardingCopy } from './notification-engine';

// ── Student vocabulary ──────────────────────────────────────────────────────
//
// Founder call, 29 Jul: the word "log" never appears in anything a student
// reads. It is record-keeping vocabulary, and a CAT aspirant does not think in
// records — they think in actions. They say "aaj kitna padha", "mocks diye",
// "questions solve kiye". Nobody says "I'll log my study."
//
// The replacement vocabulary: "Today's Study" as the noun, "Update today's
// study" as the action, and a natural question ("What did you study today?")
// wherever a question fits. The test for a good label is 0.1-second
// comprehension, not correct English.
//
// SCOPE — this guards STUDENT-FACING copy only. Code identifiers keep the old
// name on purpose and must NOT be renamed: submitLog, useLogging,
// LoggingModal, /api/logging/log-daily, log_date, the 'log' companion slot,
// companion_log, and the 'log_today' expected action. Those are data and
// contract names; renaming them breaks continuity with every historical row and
// notification-outcome record. Vocabulary is a UI concern, not a schema one.
//
// Staff-facing copy is also out of scope and deliberately still says "log":
// the buddy morning brief, the sales call queue, the founder mission queue and
// the admin dashboards. Mentors and the founder are not the audience this rule
// protects.

const BANNED = /\blogg?(ed|ing|s)?\b/i;

function assertNoLog(copy: SlotCopy | { title: string; body: string } | null, where: string) {
  if (!copy) return; // a skipped slot is silence, which is always allowed
  expect(copy.title, `${where} title says "log": ${copy.title}`).not.toMatch(BANNED);
  expect(copy.body, `${where} body says "log": ${copy.body}`).not.toMatch(BANNED);
}

describe('student-facing notification copy never says "log"', () => {
  it('holds for every fixed-argument slot', () => {
    assertNoLog(morningCopy('DILR', 3), 'morningCopy');
    assertNoLog(factCopy(companionTip('QA', 3)), 'factCopy');
    assertNoLog(openCopy('Geometry', 'QA', 2), 'openCopy(topic)');
    assertNoLog(openCopy(null, 'QA', 2), 'openCopy(no topic)');
    assertNoLog(progressCopy(5, 7), 'progressCopy');
    assertNoLog(logCopy('IIM Ahmedabad'), 'logCopy');
    assertNoLog(planMorningCopy('Aarav', 'Geometry', 'RC', 4, 2.5), 'planMorningCopy');
    assertNoLog(planMorningCopy('Aarav', 'Geometry', null, 1, 0), 'planMorningCopy(solo)');
    assertNoLog(planOpenCopy('Geometry', '20 questions', 2), 'planOpenCopy');
    assertNoLog(planOpenCopy('Geometry', null, 2), 'planOpenCopy(no target)');
    assertNoLog(planProgressCopy(2, 4, 'RC'), 'planProgressCopy');
    assertNoLog(planLogCopy('RC', 'IIM Bangalore'), 'planLogCopy');
    assertNoLog(planLogCopy(null, 'IIM Bangalore'), 'planLogCopy(no topic)');
    assertNoLog(missedCheckInKickoffCopy('27 Jul', 'DILR'), 'missedCheckInKickoffCopy');
    assertNoLog(sparkCopy(4), 'sparkCopy(even)');
    assertNoLog(sparkCopy(5), 'sparkCopy(odd)');
    assertNoLog(windCopy('VARC'), 'windCopy');
  });

  it('holds on both branches of the streak-dependent slots', () => {
    // closeCopy and kickoffCopy each have a "has a run" and a "fresh start"
    // branch. The regression this catches: fixing one and missing the other.
    for (const streak of [0, 1, 2, 21]) {
      assertNoLog(closeCopy(streak, 'QA'), `closeCopy(streak=${streak})`);
      assertNoLog(kickoffCopy(streak, 'QA', 'IIM Calcutta'), `kickoffCopy(streak=${streak})`);
    }
  });

  it('holds for every activation and reactivation slot', () => {
    for (const slot of COMPANION_SLOTS) {
      assertNoLog(
        activationSlotCopy(slot, {
          firstName: 'Aarav', daysToExam: 120, rotate: 3,
          weakest: 'DILR', dreamCollege: 'IIM Ahmedabad',
        }),
        `activationSlotCopy(${slot})`,
      );
      assertNoLog(
        reactivationSlotCopy(slot, {
          firstName: 'Aarav', daysToExam: 120, daysSinceLastLog: 4,
          weakest: 'DILR', dreamCollege: 'IIM Ahmedabad',
        }),
        `reactivationSlotCopy(${slot})`,
      );
    }
  });

  it('holds for the Hinglish onboarding ladder, every day and phase', () => {
    // These are the highest-volume student pushes we send, and the ones most
    // likely to be edited without an English-speaking reviewer noticing.
    for (const day of Object.keys(ONBOARDING_DAYS).map(Number)) {
      for (const phase of ['pending', 'done'] as const) {
        assertNoLog(onboardingCopy(day, phase, 'Aarav'), `onboardingCopy(day ${day}, ${phase})`);
      }
    }
  });

  it('keeps the strategy and tip banks clean too', () => {
    for (let i = 0; i < 14; i++) {
      expect(companionStrategy(i)).not.toMatch(BANNED);
      for (const s of ['VARC', 'DILR', 'QA'] as const) {
        expect(companionTip(s, i)).not.toMatch(BANNED);
      }
    }
  });
});

describe('the identifiers that must NOT be renamed', () => {
  it('keeps the "log" companion slot name for data continuity', () => {
    // companion_log has months of notification-outcome rows behind it. The
    // vocabulary rule is about what students read, never about what we store.
    expect(COMPANION_SLOTS).toContain('log');
  });

  it('keeps log_today as the expected action', () => {
    // Outcome attribution on /admin/notification-health keys off this string.
    expect(missedCheckInKickoffCopy('27 Jul', 'DILR').expectedAction).toBe('log_today');
  });
});
