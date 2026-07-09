// Lead intelligence for the admin Preparation CRM. Same discipline as every
// other engine in this codebase: deterministic rules over signals that
// already exist, every conclusion carries its stated reasons, and silence is
// a valid output ("no reason to call today" shows nothing rather than
// manufactured urgency). Deliberately NOT a numeric lead score — a tier plus
// its reasons tells the caller strictly more than an invented number would,
// and there's no conversion data yet to validate a score against.

export type LeadTier =
  | 'converted'      // paying / paired — not a lead anymore
  | 'dropped_setup'  // logged in, never finished the Builder
  | 'high_risk'      // was active, gone quiet — recovery window
  | 'ready'          // engaged right now — the buddy-call list
  | 'new'            // just joined, let them experience the product
  | 'inactive'       // long quiet or never started logging
  | 'warming';       // some activity, not hot yet

export const TIER_META: Record<LeadTier, { label: string; order: number }> = {
  ready: { label: 'Ready for Buddy', order: 0 },
  high_risk: { label: 'High risk', order: 1 },
  dropped_setup: { label: 'Dropped mid-setup', order: 2 },
  new: { label: 'New', order: 3 },
  warming: { label: 'Warming up', order: 4 },
  inactive: { label: 'Inactive', order: 5 },
  converted: { label: 'Converted', order: 6 },
};

export interface LeadSignals {
  onboardingCompleted: boolean;
  onboardingStepReached: number;
  daysSinceJoin: number;
  daysSinceLastLog: number | null; // null = never logged a day
  loggedDaysLast7: number;
  currentStreak: number;
  buddyCtaClicks: number;
  mocksLogged: number;
  isPremium: boolean;
  hasBuddy: boolean;
}

export interface LeadAssessment {
  tier: LeadTier;
  reasons: string[];
}

// Step names for the drop marker — mirrors the Builder's screen order
// (onboarding-modal.tsx). Index = onboarding_step_reached.
export const BUILDER_STEPS = [
  'Intro', 'Dream colleges', 'Exam context', 'About you', 'Daily commitment',
  'Topic coverage', 'Meet buddy', 'Success goal', 'Build', 'Reveal', 'Contract',
] as const;

export function stepLabel(stepReached: number): string {
  return BUILDER_STEPS[Math.min(stepReached, BUILDER_STEPS.length - 1)] ?? 'Intro';
}

export function assessLead(s: LeadSignals): LeadAssessment {
  if (s.isPremium || s.hasBuddy) {
    return { tier: 'converted', reasons: [s.hasBuddy ? 'Paired with a buddy' : 'Premium subscriber'] };
  }

  if (!s.onboardingCompleted) {
    return {
      tier: 'dropped_setup',
      reasons: [
        `Stopped at "${stepLabel(s.onboardingStepReached)}" (step ${s.onboardingStepReached + 1} of ${BUILDER_STEPS.length})`,
        `Signed up ${s.daysSinceJoin === 0 ? 'today' : `${s.daysSinceJoin}d ago`}`,
      ],
    };
  }

  // Quiet after real usage — the recovery window. Checked before "ready"
  // on purpose: past heat doesn't matter if they've gone silent.
  if (s.daysSinceLastLog != null && s.daysSinceLastLog >= 10) {
    return { tier: 'inactive', reasons: [`No activity for ${s.daysSinceLastLog} days`] };
  }
  if (s.daysSinceLastLog != null && s.daysSinceLastLog >= 4) {
    const reasons = [`Quiet for ${s.daysSinceLastLog} days after real usage`];
    if (s.buddyCtaClicks > 0) reasons.push(`Clicked buddy unlock ${s.buddyCtaClicks}×  before going quiet`);
    return { tier: 'high_risk', reasons };
  }

  const readyReasons: string[] = [];
  if (s.buddyCtaClicks > 0) readyReasons.push(`Clicked buddy unlock ${s.buddyCtaClicks}× — actively considering`);
  if (s.currentStreak >= 3) readyReasons.push(`${s.currentStreak}-day streak — habit is forming`);
  if (s.mocksLogged >= 1 && s.loggedDaysLast7 >= 3) readyReasons.push(`${s.mocksLogged} mock${s.mocksLogged === 1 ? '' : 's'} logged + active this week`);
  if (readyReasons.length > 0) {
    return { tier: 'ready', reasons: readyReasons };
  }

  if (s.daysSinceJoin <= 3) {
    return { tier: 'new', reasons: [`Day ${s.daysSinceJoin + 1} — let them experience the free product first`] };
  }

  if (s.daysSinceLastLog == null) {
    return { tier: 'inactive', reasons: ['Finished setup but never logged a single day'] };
  }

  return { tier: 'warming', reasons: [`Active ${s.loggedDaysLast7}/7 days this week — not hot yet`] };
}

// ─── "Why contact TODAY" — the one sentence at the top of a lead profile ────
// First rule with real evidence wins; if nothing fired, the card doesn't
// render. A sales team that catches this padding on a slow day stops
// trusting it on the days it's real.
export interface WhyTodayInput extends LeadSignals {
  revisionDueCount: number;
  daysSinceLastMock: number | null; // null = never
  avoidedSection: string | null;
}

export function whyContactToday(s: WhyTodayInput): string | null {
  if (s.isPremium || s.hasBuddy) return null;

  if (!s.onboardingCompleted) {
    return `Signed up ${s.daysSinceJoin === 0 ? 'today' : `${s.daysSinceJoin} days ago`} but stopped at "${stepLabel(s.onboardingStepReached)}" — a 2-minute nudge gets their plan built.`;
  }
  if (s.buddyCtaClicks > 0 && (s.daysSinceLastLog ?? 99) <= 3) {
    return `Clicked the buddy unlock ${s.buddyCtaClicks}× and still active — they're already considering. Strongest possible moment.`;
  }
  if (s.currentStreak >= 7 && s.revisionDueCount > 15) {
    return `Consistent for ${s.currentStreak} days but ${s.revisionDueCount} topics are overdue for revision — discipline is there, strategy is slipping. Classic buddy moment.`;
  }
  if (s.daysSinceLastMock != null && s.daysSinceLastMock <= 2) {
    return `Logged a mock ${s.daysSinceLastMock === 0 ? 'today' : `${s.daysSinceLastMock}d ago`} — perfect time for a mock-analysis pitch.`;
  }
  if (s.daysSinceLastLog != null && s.daysSinceLastLog >= 4 && s.daysSinceLastLog < 10 && s.currentStreak === 0 && s.loggedDaysLast7 === 0) {
    return `Went quiet ${s.daysSinceLastLog} days ago after real usage — recovery call, not a sales call.`;
  }
  if (s.avoidedSection && s.currentStreak >= 3) {
    return `Studying consistently but avoiding ${s.avoidedSection} — they can't see it themselves; a buddy naming it is the pitch.`;
  }
  if (s.mocksLogged === 0 && s.loggedDaysLast7 >= 4) {
    return `Active ${s.loggedDaysLast7}/7 days but zero mocks — "who checks your level?" is the opener.`;
  }
  return null;
}
