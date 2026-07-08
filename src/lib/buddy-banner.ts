// Buddy banner selection — the one recurring conversion surface a free
// student sees on Home and My CAT Plan. Two rules, both non-negotiable:
//
// 1. Never sell Buddy, sell the problem Buddy solves. No claim about the
//    buddies themselves ("cleared CAT at 95%ile+") — every founder-run
//    coaching brand already says that, so it reads as marketing, not advice.
//    Every line below names something true about the STUDENT'S OWN prep
//    (no mock yet, revision piling up, a dropped score) and lets the
//    contrast make the case.
// 2. Never rotate on a timer. A banner is picked because it's the truest
//    thing about this student right now, and it stays until that stops
//    being true — not until 4.5 seconds pass. Priority is behavior first
//    (something they actually did or didn't do), then profile (who they
//    are), then one generic fallback if nothing else fired.
//
// Pure and signal-optional by design: a caller that hasn't computed one
// signal (e.g. Home not fetching revision-due count) just passes it as
// undefined, and that rule is skipped rather than firing wrong.
export interface BuddyBannerSignals {
  mocksCount?: number;
  latestPercentile?: number | null;
  previousPercentile?: number | null;
  dueForRevisionCount?: number;
  daysStudiedLast30?: number;
  isRepeater?: boolean;
  isWorkingProfessional?: boolean;
}

export interface BuddyBanner {
  key: string;
  eyebrow?: string;
  headline: string;
  sub: string;
  cta: string;
}

export function selectBuddyBanner(signals: BuddyBannerSignals): BuddyBanner {
  const { mocksCount, latestPercentile, previousPercentile, dueForRevisionCount, daysStudiedLast30, isRepeater, isWorkingProfessional } = signals;

  // The four behavior-tier banners get a "Based on your progress" eyebrow —
  // it's true for these because a real signal fired. Profile-tier and the
  // generic fallback don't get it: claiming "based on your progress" for a
  // static fact (repeater) or a no-signal default would be the same kind of
  // dishonesty this file exists to avoid.
  if (latestPercentile != null && previousPercentile != null && latestPercentile < previousPercentile) {
    return {
      key: 'mocks_dropping',
      eyebrow: 'Based on your progress',
      headline: 'Your last mock dropped.',
      sub: "More hours won't fix this. Better feedback might.",
      cta: 'See how →',
    };
  }

  if (mocksCount === 0 && (daysStudiedLast30 ?? 0) >= 5) {
    return {
      key: 'no_mocks_yet',
      eyebrow: 'Based on your progress',
      headline: "You haven't taken a mock yet.",
      sub: 'A Buddy would start there.',
      cta: 'Meet a Buddy →',
    };
  }

  if ((dueForRevisionCount ?? 0) > 20) {
    return {
      key: 'revision_piling',
      eyebrow: 'Based on your progress',
      headline: `${dueForRevisionCount} topics need revision.`,
      sub: 'A Buddy keeps you accountable for it.',
      cta: 'See why →',
    };
  }

  if ((daysStudiedLast30 ?? 0) >= 14) {
    return {
      key: 'sustained_consistency',
      eyebrow: 'Based on your progress',
      headline: "You've built discipline.",
      sub: 'Now build strategy with someone who has done this before.',
      cta: 'Meet a Buddy →',
    };
  }

  if (isRepeater) {
    return {
      key: 'repeater',
      headline: "Don't repeat last year's mistakes.",
      sub: "A study plan won't tell you what went wrong. A Buddy will.",
      cta: 'Meet a Buddy →',
    };
  }

  if (isWorkingProfessional) {
    return {
      key: 'working_professional',
      headline: 'Every hour has to count.',
      sub: 'A Buddy helps you study smarter, not just longer.',
      cta: 'Meet a Buddy →',
    };
  }

  return {
    key: 'default',
    headline: 'Stop repeating the same mistakes.',
    sub: 'A Buddy catches what you can’t see in your own mocks.',
    cta: 'See how it works →',
  };
}
