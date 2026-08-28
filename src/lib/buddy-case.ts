// ── The case for a Buddy, built from THIS student's own data ────────────────
//
// Founder, 13 Aug: "highlight the weakness of the student — you are weak in
// this, you are not consistent, your mocks aren't improving, you don't have a
// strategy. Not a random audit. The audit should come with a student problem."
//
// So this module answers one question: what is actually going wrong in this
// student's preparation, right now, that another pair of eyes would fix?
//
// The screen is diagnostic first and service second. "Want a mentor? Book a
// session." asks a student to self-diagnose and then pay. "Your last four
// mocks went 62 → 64 → 61 → 63, and your score isn't moving" tells them
// something they did not know about their own preparation — and the offer
// that follows is an answer to a question they now have.
//
// ── THE RULE THAT MATTERS MORE THAN THE CONVERSION ──────────────────────────
//
// Every finding here is COMPUTED FROM THE STUDENT'S OWN ROWS and shown with
// the numbers that produced it. We never:
//   · invent or estimate a national statistic (no "~50% of aspirants are
//     repeaters" — our own onboarded students self-report ~16%, and we have
//     no source for any wider figure. An unverifiable number on a paid
//     surface is the fastest way to lose a student who checks);
//   · report a population number that reveals how small we are (the
//     no-small-numbers rule — "only 6 students have a mentor" is true and
//     unpublishable);
//   · claim a problem we cannot show the working for. Below each detector's
//     evidence bar we stay SILENT rather than reaching for a softer claim.
//
// A student who reads a finding here and thinks "that's not true of me" has
// been told the product does not know them — which costs more than the sale.

// ── The one external fact we are willing to print ───────────────────────────
//
// Founder, 13 Aug, wanted "~50% of aspirants are repeaters" on the screen. We
// could not source 50%, and our own onboarded students self-report ~16%, so
// that number would have been indefensible the first time a student checked.
//
// He then sent the research, and it is better than the guess: Careers360 puts
// repeat test-takers at an ESTIMATED 30–40% of the ~2.6–2.9 lakh who sit CAT
// each year, and says plainly that official bodies publish no exact repeater
// breakdown. So we print the sourced range, hedged exactly as the source
// hedges it, and never a point estimate.
//
// And we do NOT claim the cause. "Students repeat because they have no
// mentor" is a causal claim nobody has evidence for. What is true, and enough:
// repeating the year is common; repeating the same preparation is the part
// that is avoidable.
export const REPEATER_FACT = 'Around 1 in 3 CAT aspirants is retaking the exam — an estimated 30–40%.';
/** The strip version: one line, no clause after it (founder, 14 Aug —
 *  "don't write anything else"). Still the sourced 1-in-3, never ~50%. */
export const REPEATER_HEADLINE = '1 in 3 students repeats CAT every year.';
export const REPEATER_SOURCE = 'Careers360 estimate; official repeater figures are not published.';
export const REPEATER_SO_WHAT = 'Repeating the year is common. Repeating the same preparation is the avoidable part.';

export type CaseKind =
  | 'consistency'
  | 'mock_plateau'
  | 'mock_drop'
  | 'no_strategy'
  | 'behind_timeline'
  | 'repeating_pattern'
  | 'section_gap'
  | 'mock_missing'
  | 'mock_gap'
  | 'topic_avoidance'
  | 'section_weak_mock'
  | 'stuck_learning'
  | 'not_started'
  | 'unreviewed';

export interface CaseFinding {
  kind: CaseKind;
  /** The headline — what is wrong, in the student's own words. */
  title: string;
  /** The EVIDENCE. Always the student's real numbers, never a description. */
  evidence: string;
  /** What a Buddy does about this specific thing. */
  soWhat: string;
  /** Ranking weight — higher surfaces first. */
  severity: number;
  /** Pointer form for the conversion screen: a short chip + one stat.
   *  "QA — 9/28 topics started", never a paragraph (founder, 14 Aug). */
  chip: string;
  stat: string;
}

export interface BuddyCaseInput {
  /** Hours the plan asked for vs hours logged, over the last 7 days. */
  plannedHours7d: number | null;
  loggedHours7d: number | null;
  /** Days in the last 7 with a plan where nothing was completed. */
  missedDays7d: number | null;
  /** Overall percentiles of recent mocks, oldest → newest. */
  recentMockPercentiles: number[];
  /** Syllabus coverage 0–100, and days left to their own finish date. */
  coveragePct: number | null;
  daysToTarget: number | null;
  /** Did they set a finish date and daily hours at all? */
  hasPlanShape: boolean;
  isRepeater: boolean;
  /** Their weakest section now, and at signup — same one twice is the tell. */
  weakestSectionNow: string | null;
  weakestSectionAtSignup: string | null;
  hasMentor: boolean;
  /** Topics started per section — the founder's "9 of 28 QA" pointer. */
  sectionsStarted: { section: string; started: number; total: number }[];
  /** Has ANY mock ever been recorded, and how long since the last one. */
  mocksEver: boolean;
  daysSinceLastMock: number | null;
  /** One topic swapped out of the plan again and again — avoidance. */
  repeatSwapped: { topic: string; times: number } | null;
  /** Latest mock, per section. The sharpest weakness a student ever gives us:
   *  "VARC 89 when QA is 99" is undeniable and entirely theirs. */
  latestSectionPercentiles: { section: string; percentile: number }[];
  /** Topics OPENED but never finished, and never opened at all. "Started" is
   *  a weak signal; 22 chapters parked at Learning is the real weakness. */
  stuckLearning: number;
  notStartedCount: number;
}

/** A section under this share of topics started is a gap worth naming —
 *  but only once the student is genuinely studying elsewhere. */
export const SECTION_GAP_SHARE = 0.4;
export const SECTION_PROGRESS_SHARE = 0.3;
/** Days without a mock before the gap itself is the finding. */
export const MOCK_GAP_DAYS = 14;
/** Percentile points below their own best section before we call it weak. */
export const SECTION_WEAK_GAP = 5;
/** Topics parked at 'learning' before that backlog is the story. */
export const STUCK_LEARNING_MIN = 6;

/** Below this many mocks we cannot speak about a trend at all. */
export const MIN_MOCKS_FOR_TREND = 3;
/** Percentile spread within which a set of mocks counts as "not moving". */
export const PLATEAU_BAND = 5;
/** Falling this far below the plan is a real consistency problem. */
export const CONSISTENCY_SHORTFALL = 0.7;

function fmtHours(h: number): string {
  return Number.isInteger(h) ? `${h}` : h.toFixed(1);
}

/**
 * Every TRUE finding for this student, strongest first.
 *
 * Returns [] when we genuinely know nothing yet — a brand-new student gets no
 * manufactured problem, because inventing one to justify an offer is the
 * behaviour this whole module exists to avoid.
 */
export function buildBuddyCase(input: BuddyCaseInput): CaseFinding[] {
  const out: CaseFinding[] = [];

  // 1. CONSISTENCY — they set the target themselves, so this is their own
  //    promise, not ours. That is what makes it land instead of nag.
  if (
    input.plannedHours7d != null && input.loggedHours7d != null &&
    input.plannedHours7d >= 5 &&
    input.loggedHours7d < input.plannedHours7d * CONSISTENCY_SHORTFALL
  ) {
    out.push({
      kind: 'consistency',
      title: "You're falling behind your own plan",
      evidence: `You planned ${fmtHours(input.plannedHours7d)} hrs this week and logged ${fmtHours(input.loggedHours7d)}.`,
      soWhat: 'A Buddy builds a routine around the week you actually have — and checks whether you followed it.',
      severity: 3,
      chip: 'PLAN',
      stat: `${fmtHours(input.loggedHours7d)}/${fmtHours(input.plannedHours7d)} hrs done this week`,
    });
  }

  // 2. MOCKS — the highest-value signal a student gives us, so it earns the
  //    strongest claim. Drop outranks plateau: going backwards is scarier and
  //    more urgent than standing still.
  const mocks = input.recentMockPercentiles.filter((p) => Number.isFinite(p) && p >= 0 && p <= 100);
  if (mocks.length >= MIN_MOCKS_FOR_TREND) {
    const window = mocks.slice(-4);
    const first = window[0];
    const last = window[window.length - 1];
    const spread = Math.max(...window) - Math.min(...window);
    const trail = window.join(' → ');

    if (last < first - PLATEAU_BAND) {
      out.push({
        kind: 'mock_drop',
        title: 'Your mock scores are going down',
        evidence: `Last ${window.length} mocks: ${trail}.`,
        soWhat: 'A Buddy reads your actual papers and finds what changed — before it becomes a pattern.',
        severity: 5,
        chip: 'MOCKS',
        stat: `falling: ${trail}`,
      });
    } else if (spread <= PLATEAU_BAND) {
      out.push({
        kind: 'mock_plateau',
        title: "Your mock score isn't moving",
        evidence: `Last ${window.length} mocks: ${trail}.`,
        soWhat: "A Buddy works out what's holding the ceiling — more mocks alone will not move it.",
        severity: 4,
        chip: 'MOCKS',
        stat: `stuck: ${trail}`,
      });
    }
  }

  // 2b. THE SECTION GAP — the founder's own example: "I've done 9 of 28 QA
  //     topics; which 15 do I cover next, weightage-wise?" Fires only when
  //     the student IS studying (some section moving) and one section is
  //     being left behind — a brand-new student with 0 everywhere has no gap,
  //     they have a start.
  const secs = input.sectionsStarted.filter((s) => s.total > 0);
  const anyProgress = secs.some((s) => s.started / s.total >= SECTION_PROGRESS_SHARE);
  if (anyProgress) {
    const worst = [...secs].sort((a, b) => a.started / a.total - b.started / b.total)[0];
    if (worst && worst.started / worst.total < SECTION_GAP_SHARE) {
      out.push({
        kind: 'section_gap',
        title: `${worst.section} is your biggest gap`,
        evidence: `Only ${worst.started} of ${worst.total} ${worst.section} topics started.`,
        soWhat: `A Buddy sequences your next ${worst.section} topics by weightage — highest marks first.`,
        severity: 4,
        chip: worst.section,
        stat: `${worst.started}/${worst.total} topics started`,
      });
    }
  }

  // 2c. MOCKS NOT HAPPENING AT ALL — different from a bad trend. Gated on
  //     real coverage so a day-one student is not scolded for a mock they
  //     could not sensibly sit yet.
  if (!input.mocksEver && input.coveragePct != null && input.coveragePct >= 20) {
    out.push({
      kind: 'mock_missing',
      title: "You haven't given a single mock",
      evidence: '0 mocks recorded so far.',
      soWhat: 'A Buddy sets your mock day and reads the first paper with you.',
      severity: 4,
      chip: 'MOCKS',
      stat: '0 mocks recorded',
    });
  } else if (input.mocksEver && input.daysSinceLastMock != null && input.daysSinceLastMock >= MOCK_GAP_DAYS) {
    out.push({
      kind: 'mock_gap',
      title: `No mock in ${input.daysSinceLastMock} days`,
      evidence: `Your last recorded mock was ${input.daysSinceLastMock} days ago.`,
      soWhat: 'Weekly mocks are the #1 signal now — a Buddy holds you to them.',
      severity: 3,
      chip: 'MOCKS',
      stat: `${input.daysSinceLastMock} days since your last mock`,
    });
  }

  // 2d. AVOIDANCE — the same topic pushed out of the plan again and again.
  //     Their own swaps, counted, never guessed.
  if (input.repeatSwapped && input.repeatSwapped.times >= 2) {
    out.push({
      kind: 'topic_avoidance',
      title: `You keep pushing ${input.repeatSwapped.topic} away`,
      evidence: `Swapped out of your plan ${input.repeatSwapped.times} times in 2 weeks.`,
      soWhat: 'Avoided topics don\'t disappear — a Buddy breaks them down with you.',
      severity: 3,
      chip: 'SKIPPED',
      stat: `${input.repeatSwapped.topic} pushed away ×${input.repeatSwapped.times}`,
    });
  }

  // 2e. THE WEAKEST SECTION, FROM THEIR OWN MOCK. The sharpest, least
  //     deniable weakness we can show: their own percentiles, side by side.
  const secPct = input.latestSectionPercentiles
    .filter((s) => Number.isFinite(s.percentile) && s.percentile >= 0 && s.percentile <= 100);
  if (secPct.length >= 2) {
    const ranked = [...secPct].sort((a, b) => a.percentile - b.percentile);
    const worst = ranked[0];
    const best = ranked[ranked.length - 1];
    if (best.percentile - worst.percentile >= SECTION_WEAK_GAP) {
      out.push({
        kind: 'section_weak_mock',
        title: `${worst.section} is dragging your score`,
        evidence: `${worst.section} ${worst.percentile}%ile vs ${best.percentile} in ${best.section}.`,
        soWhat: `A Buddy rebuilds your ${worst.section} approach — that gap is where your marks are.`,
        severity: 6,
        chip: worst.section,
        stat: `${worst.percentile}%ile — your weakest section`,
      });
    }
  }

  // 2f. OPENED BUT NEVER FINISHED. "Started" flatters; a pile of chapters
  //     parked at Learning is the honest weakness underneath it.
  if (input.stuckLearning >= STUCK_LEARNING_MIN) {
    out.push({
      kind: 'stuck_learning',
      title: 'Too many topics left half-done',
      evidence: `${input.stuckLearning} topics opened but never finished.`,
      soWhat: 'A Buddy closes them in order of marks, instead of opening more.',
      severity: 5,
      chip: 'HALF-DONE',
      stat: `${input.stuckLearning} topics stuck at Learning`,
    });
  }

  // 2g. NEVER OPENED — only once they are clearly underway elsewhere.
  if (input.notStartedCount > 0 && input.coveragePct != null && input.coveragePct >= 20) {
    out.push({
      kind: 'not_started',
      title: 'Untouched topics still on your syllabus',
      evidence: `${input.notStartedCount} topics not started yet.`,
      soWhat: 'A Buddy tells you which of them actually carry marks.',
      severity: 3,
      chip: 'UNTOUCHED',
      stat: `${input.notStartedCount} topics not started`,
    });
  }

  // 3. STRATEGY — no finish date, no daily hours: they are studying without a
  //    shape, which is the thing a plan cannot fix on its own.
  if (!input.hasPlanShape) {
    out.push({
      kind: 'no_strategy',
      title: "You're studying without a clear strategy",
      evidence: 'You have not set a finish date and daily hours yet.',
      soWhat: 'A Buddy helps you commit to a realistic shape for your week, then holds it.',
      severity: 3,
      chip: 'STRATEGY',
      stat: 'no finish date or daily hours set',
    });
  }

  // 4. TIMELINE — coverage against their OWN date. Only spoken when the gap
  //    is real and there is still time to act on it.
  if (
    input.coveragePct != null && input.daysToTarget != null &&
    input.daysToTarget > 0 && input.daysToTarget <= 120 && input.coveragePct < 50
  ) {
    out.push({
      kind: 'behind_timeline',
      title: "You're behind your own finish date",
      evidence: `${Math.round(input.coveragePct)}% of the syllabus covered, ${input.daysToTarget} days to the date you set.`,
      soWhat: 'A Buddy decides what to cut and what to protect, so the date stops slipping.',
      severity: 4,
      chip: 'SYLLABUS',
      stat: `${Math.round(input.coveragePct)}% covered · ${input.daysToTarget} days left`,
    });
  }

  // 5. THE REPEATER TELL — not "you are a repeater" (they know), but the
  //    specific, checkable fact that the weak section they came in with is
  //    still the weak one. That is repeating the attempt, not just the year.
  if (
    input.isRepeater && input.weakestSectionNow &&
    input.weakestSectionNow === input.weakestSectionAtSignup
  ) {
    out.push({
      kind: 'repeating_pattern',
      title: "You're repeating last year's weak spot",
      evidence: `${input.weakestSectionNow} was your weakest section when you joined — it still is.`,
      soWhat: 'Someone who has already sat CAT twice can tell you what to change, not just what to revise.',
      severity: 5,
      chip: 'REPEAT',
      stat: `${input.weakestSectionNow} still your weakest section`,
    });
  }

  // 6. THE FLOOR — always true for a student without a mentor, and the only
  //    finding that needs no data at all. It ranks last on purpose: it is the
  //    honest thing to say when we have nothing specific, never a substitute
  //    for looking.
  if (!input.hasMentor) {
    out.push({
      kind: 'unreviewed',
      title: 'Nobody is reviewing your preparation',
      evidence: 'Most CAT aspirants prepare alone — and when something stops working, nobody tells them.',
      soWhat: 'A Buddy looks at your week every week, and says the thing you cannot see from inside it.',
      severity: 1,
      chip: 'REVIEW',
      stat: 'no one checks your prep week-to-week',
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
}

// statusBullets() was deleted on 14 Aug. It padded the card to three with
// neutral facts (SYLLABUS 41/46 · MOCKS 1 day ago · TARGET 42 days) whenever a
// student had fewer than three findings — which turned a WEAKNESS card into a
// status card, exactly the blunder the founder called out. The card now shows
// weaknesses or nothing; if a student genuinely has one weakness, they see one.

/**
 * The three findings the screen shows. Three is the founder's number and it
 * is the right one: one reads as nitpicking, five reads as an attack.
 */
export function topFindings(all: CaseFinding[], limit = 3): CaseFinding[] {
  return all.slice(0, limit);
}

/**
 * The session this student should be offered, chosen by their strongest
 * finding — so the session is an answer to a problem they just read about,
 * never a product bolted onto the page.
 */
export function sessionPitch(top: CaseFinding | undefined): { label: string; cta: string } {
  switch (top?.kind) {
    case 'mock_drop':
    case 'mock_plateau':
      return { label: 'Mock Strategy Session', cta: 'Get my mocks reviewed' };
    case 'consistency':
      return { label: 'Prep Routine Session', cta: 'Fix my routine' };
    case 'no_strategy':
    case 'behind_timeline':
      return { label: 'Strategy Session', cta: 'Fix my strategy' };
    case 'repeating_pattern':
      return { label: 'Second-Attempt Session', cta: 'Change what went wrong' };
    default:
      return { label: 'Prep Review Session', cta: 'Get my prep reviewed' };
  }
}
