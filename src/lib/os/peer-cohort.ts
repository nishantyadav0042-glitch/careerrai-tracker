// ── "Students like me" / "You are not alone" — the peer intelligence engine ──
//
// Founder, 12 Aug 2026: engagement is the key to retention, and the two ideas
// worth building first are *students like me* and *you are not alone*. Build the
// structure for scale, not for today's cohort size.
//
// That instruction contains the whole engineering problem. A peer engine is
// trivial to write badly: slice the base, print a percentage, ship. It is hard
// to write HONESTLY, because every claim it makes is a claim about real people:
//
//   · At 100,000 students, "students like you" can mean students who match on
//     attempt, phase, intensity AND weak section — a precise, useful cohort.
//   · At 310 students, that same four-way slice contains two people, and a
//     statistic drawn from two people is noise wearing a lab coat. Incident #7
//     (an invented statistic nearly shipped) and Trust OS §2.1 (no invented
//     stats, ever) both say the same thing: we render nothing rather than a
//     number we cannot stand behind.
//
// So this module does NOT have a fixed cohort definition. It has a LADDER of
// definitions from tightest to broadest, walks down it until it finds one with
// enough real students behind it, and reports which rung it landed on. The same
// code that says "12 students like you — same attempt, same phase, same weak
// section" at scale says "31 students preparing for CAT this year" today. Both
// are true sentences; only the precision differs, and the precision improves on
// its own as the base grows. Nothing has to be rewritten later.
//
// Three kinds of output, deliberately separated because they carry different
// evidential weight:
//
//   1. peerPulse()      — whole-base presence. No slicing, so no privacy floor
//                         and no statistical claim. "19 students studied today"
//                         is a fact about the app, not about a cohort.
//   2. cohortInsights() — comparisons against people like you. Needs the ladder
//                         and the floor; stays silent when unsupported.
//   3. selfVsObserved() — what you SAID versus what you DID. Needs no peers at
//                         all, so it is the one insight that is fully precise
//                         from the very first week — and it is the most
//                         valuable, because it is the gap a student cannot see
//                         about themselves.

/** A student's shape, as this engine sees them. Flat and primitive-only so the
 *  whole engine is testable without a database. */
export interface PeerRow {
  studentId: string;
  /** First attempt vs repeater — the single biggest behavioural divider. */
  attemptYear: number | null;
  /** Hours the student SAID they would study. Self-report, not observation. */
  targetHours: number | null;
  /** Section the student SAID is their weakest. Self-report. */
  weakestSection: string | null;
  /** Days until their exam. Drives preparation phase. */
  daysToExam: number | null;
  /** Did they log a study day today? */
  loggedToday: boolean;
  /** Distinct days logged in the last 7. The honest consistency number. */
  loggedDaysLast7: number;
  /** Sections they actually studied today, from their log. */
  sectionsToday: string[];
  /** Mean hours per LOGGED day over the last 14. Observation, not self-report. */
  observedAvgHours: number | null;
}

// ── The privacy / honesty floor ─────────────────────────────────────────────
//
// Five, not one and not fifty. Below five, two things break at once: the
// statistic stops meaning anything, and the cohort gets small enough that a
// student could plausibly identify who else is in it ("3 repeaters aiming for
// 99th targeting IIM-A" is a name in a small base). Five is the smallest number
// that is both a weak statistic and a real crowd.
//
// This is a floor on COHORT CLAIMS only. Whole-base counts (peerPulse) are not
// subject to it: "19 students studied today" reveals nothing about anybody and
// makes no statistical claim.
export const MIN_COHORT = 5;

/** Preparation phase from days remaining. The bands are the ones the planner
 *  already reasons in, so a student is never in two different "phases" on two
 *  different screens. */
export type Phase = 'foundation' | 'building' | 'sharpening' | 'final';

export function phaseOf(daysToExam: number | null): Phase | null {
  if (daysToExam == null) return null;
  if (daysToExam > 180) return 'foundation';
  if (daysToExam > 90) return 'building';
  if (daysToExam > 30) return 'sharpening';
  return 'final';
}

export const PHASE_LABEL: Record<Phase, string> = {
  foundation: 'building the base',
  building: 'covering the syllabus',
  sharpening: 'sharpening for the exam',
  final: 'in the final month',
};

/** Intensity band from self-reported target hours. Bands, not raw numbers —
 *  "4.5 hours" is false precision on a self-report. */
export type Intensity = 'light' | 'steady' | 'heavy';

export function intensityOf(hours: number | null): Intensity | null {
  if (hours == null || hours <= 0) return null;
  if (hours < 3) return 'light';
  if (hours <= 6) return 'steady';
  return 'heavy';
}

/** Is this a repeater? Null when we genuinely do not know — never guessed. */
export function isRepeater(attemptYear: number | null, thisYear: number): boolean | null {
  if (attemptYear == null) return null;
  return attemptYear < thisYear;
}

// ── The cohort ladder ───────────────────────────────────────────────────────
//
// Rung 0 is the cohort we WANT at scale. Rung 4 is "everyone preparing", which
// is always true and always available. We walk down until MIN_COHORT is met, so
// the claim is as specific as the data can honestly support and no more.

export type CohortRung = 0 | 1 | 2 | 3 | 4;

export interface CohortMatch {
  rung: CohortRung;
  /** How this cohort should be described to the student, in their own terms. */
  label: string;
  peers: PeerRow[];
}

interface Dimensions {
  repeater: boolean | null;
  phase: Phase | null;
  intensity: Intensity | null;
  weakest: string | null;
}

function dimensionsOf(row: PeerRow, thisYear: number): Dimensions {
  return {
    repeater: isRepeater(row.attemptYear, thisYear),
    phase: phaseOf(row.daysToExam),
    intensity: intensityOf(row.targetHours),
    weakest: row.weakestSection,
  };
}

/**
 * Find the tightest cohort around `me` that still contains at least
 * MIN_COHORT other students.
 *
 * Returns null only when even "everyone else preparing" is below the floor —
 * i.e. a base too small to say anything about, which is a real state on day one
 * of a new exam vertical and must render as silence, not as a zero.
 */
export function findCohort(me: PeerRow, all: PeerRow[], thisYear: number): CohortMatch | null {
  const others = all.filter((r) => r.studentId !== me.studentId);
  const mine = dimensionsOf(me, thisYear);

  // Each rung drops the least-load-bearing dimension first. Weak section goes
  // before phase because phase changes what a student should be DOING, while a
  // shared weak section only changes what they are worried about.
  const rungs: { rung: CohortRung; label: string; match: (d: Dimensions) => boolean }[] = [
    {
      rung: 0,
      label: cohortLabel(mine, ['repeater', 'phase', 'weakest']),
      match: (d) =>
        mine.repeater != null && d.repeater === mine.repeater &&
        mine.phase != null && d.phase === mine.phase &&
        mine.weakest != null && d.weakest === mine.weakest,
    },
    {
      rung: 1,
      label: cohortLabel(mine, ['repeater', 'phase']),
      match: (d) =>
        mine.repeater != null && d.repeater === mine.repeater &&
        mine.phase != null && d.phase === mine.phase,
    },
    {
      rung: 2,
      label: cohortLabel(mine, ['phase']),
      match: (d) => mine.phase != null && d.phase === mine.phase,
    },
    {
      rung: 3,
      label: cohortLabel(mine, ['intensity']),
      match: (d) => mine.intensity != null && d.intensity === mine.intensity,
    },
    {
      rung: 4,
      label: 'students preparing alongside you',
      match: () => true,
    },
  ];

  for (const r of rungs) {
    const peers = others.filter((o) => r.match(dimensionsOf(o, thisYear)));
    if (peers.length >= MIN_COHORT) return { rung: r.rung, label: r.label, peers };
  }
  return null;
}

function cohortLabel(d: Dimensions, parts: ('repeater' | 'phase' | 'intensity' | 'weakest')[]): string {
  const bits: string[] = [];
  for (const p of parts) {
    if (p === 'repeater' && d.repeater != null) bits.push(d.repeater ? 'repeaters' : 'first-attempt students');
    if (p === 'phase' && d.phase) bits.push(PHASE_LABEL[d.phase]);
    if (p === 'intensity' && d.intensity) bits.push(`${d.intensity}-load students`);
    if (p === 'weakest' && d.weakest) bits.push(`stuck on ${d.weakest}`);
  }
  if (bits.length === 0) return 'students preparing alongside you';
  // "repeaters covering the syllabus, stuck on DILR"
  return bits.length === 1 ? bits[0] : `${bits[0]} ${bits.slice(1).join(', ')}`;
}

// ── 1. Presence — "you are not alone" ───────────────────────────────────────
//
// Deliberately NOT vanity. "1,482 students are preparing!" is a billboard; it
// says nothing a student can feel. What lands is specificity: how many people
// showed up TODAY, and how many are working on the same thing you are.
//
// Every number here is a direct count of real rows. None is projected, rounded
// up, or smoothed. If it is 3, we say 3.

export interface PeerPulse {
  /** Students who logged a study day today. */
  studiedToday: number;
  /** Of those, how many studied the same section as me. */
  sameSectionToday: number;
  /** The section most studied today across the base, and its count. */
  topSection: { section: string; count: number } | null;
  /** Students who share my self-reported weakest section (whole base). */
  shareMyWeakest: number;
}

export function peerPulse(me: PeerRow, all: PeerRow[]): PeerPulse {
  const others = all.filter((r) => r.studentId !== me.studentId);
  const studiedToday = others.filter((r) => r.loggedToday).length;

  const mySections = new Set(me.sectionsToday);
  const sameSectionToday = others.filter(
    (r) => r.loggedToday && r.sectionsToday.some((s) => mySections.has(s))
  ).length;

  const counts = new Map<string, number>();
  for (const r of others) {
    if (!r.loggedToday) continue;
    for (const s of new Set(r.sectionsToday)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let topSection: { section: string; count: number } | null = null;
  for (const [section, count] of counts) {
    // Ties break alphabetically so the same day never renders two different ways.
    if (!topSection || count > topSection.count || (count === topSection.count && section < topSection.section)) {
      topSection = { section, count };
    }
  }

  const shareMyWeakest = me.weakestSection
    ? others.filter((r) => r.weakestSection === me.weakestSection).length
    : 0;

  return { studiedToday, sameSectionToday, topSection, shareMyWeakest };
}

// ── 2. Cohort insights — "students like me" ─────────────────────────────────
//
// An insight is only worth a line on the screen if it tells the student
// something they could not have worked out by looking at their own screen. So
// each one is a COMPARISON, it carries the cohort it came from, and it is
// suppressed unless the gap is material.

export interface PeerInsight {
  id: string;
  /** The sentence, already written for the student. */
  line: string;
  /** How many real students back it — rendered so the claim is auditable. */
  basis: number;
  /** Lower rung = more specific cohort. Surfaced so the UI can prefer precision. */
  rung: CohortRung;
}

/** A gap smaller than this is noise, not a finding. Two logged days out of
 *  seven is a real behavioural difference; half a day is measurement jitter. */
const MATERIAL_DAYS_GAP = 1.5;
const MATERIAL_HOURS_GAP = 0.75;

export function cohortInsights(me: PeerRow, all: PeerRow[], thisYear: number): PeerInsight[] {
  const cohort = findCohort(me, all, thisYear);
  if (!cohort) return [];

  const out: PeerInsight[] = [];
  const { peers, rung, label } = cohort;
  const basis = peers.length;

  // Consistency against the cohort — the single most predictive behaviour we
  // can observe, and the one a student most often misjudges about themselves.
  const peerDays = mean(peers.map((p) => p.loggedDaysLast7));
  if (peerDays != null) {
    const gap = me.loggedDaysLast7 - peerDays;
    if (Math.abs(gap) >= MATERIAL_DAYS_GAP) {
      out.push({
        id: 'consistency',
        basis,
        rung,
        line: gap > 0
          ? `You showed up ${me.loggedDaysLast7} of the last 7 days — more than most ${label} (${round1(peerDays)} on average).`
          : `${capitalize(label)} showed up ${round1(peerDays)} of the last 7 days. You logged ${me.loggedDaysLast7}.`,
      });
    }
  }

  // Hours actually studied, cohort-relative. Observation vs observation — never
  // self-report vs observation, which would compare two different things.
  const peerHours = mean(peers.map((p) => p.observedAvgHours).filter((h): h is number => h != null));
  if (peerHours != null && me.observedAvgHours != null) {
    const gap = me.observedAvgHours - peerHours;
    if (Math.abs(gap) >= MATERIAL_HOURS_GAP) {
      out.push({
        id: 'hours',
        basis,
        rung,
        line: gap > 0
          ? `On the days you study, you put in ${round1(me.observedAvgHours)}h — above the ${round1(peerHours)}h typical for ${label}.`
          : `${capitalize(label)} average ${round1(peerHours)}h on a study day. You are at ${round1(me.observedAvgHours)}h.`,
      });
    }
  }

  // What the cohort is worried about. Not a comparison — a belonging signal,
  // and a genuine "you are not the only one" for the most isolating part of
  // preparation.
  const weakCounts = new Map<string, number>();
  for (const p of peers) if (p.weakestSection) weakCounts.set(p.weakestSection, (weakCounts.get(p.weakestSection) ?? 0) + 1);
  const topWeak = [...weakCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topWeak && topWeak[1] >= MIN_COHORT) {
    out.push({
      id: 'shared-weakness',
      basis: topWeak[1],
      rung,
      line: `${topWeak[1]} ${label} say ${topWeak[0]} is their weakest section too.`,
    });
  }

  return out;
}

// ── 3. Self vs observed — the gap a student cannot see ──────────────────────
//
// The most valuable signal in the product and the cheapest to compute: what the
// student SAID they would do, against what they actually did. It needs no
// cohort, so it is precise from week one.
//
// The tone rule is absolute. This must never read as an accusation — "you said
// 6 hours and only did 2" is the sentence that makes a student delete the app.
// Trust OS forbids fear framing, and MISSION.md forbids anything that makes the
// free product worse for a student who will never pay. So the finding is stated
// as a fact about the PLAN being wrong, not the student being lazy: a plan built
// for hours nobody has is a bad plan, and that is our fault to fix.

export interface SelfVsObserved {
  claimedHours: number;
  observedHours: number;
  /** True when the plan is built on hours that are not happening. */
  planTooBig: boolean;
  line: string;
}

/** Below this the difference is not worth a sentence — plans are estimates. */
const PLAN_GAP_HOURS = 1.5;

export function selfVsObserved(me: PeerRow): SelfVsObserved | null {
  if (me.targetHours == null || me.observedAvgHours == null) return null;
  // Needs enough observed days to be a pattern rather than one bad week.
  if (me.loggedDaysLast7 < 2) return null;

  const gap = me.targetHours - me.observedAvgHours;
  if (Math.abs(gap) < PLAN_GAP_HOURS) return null;

  const planTooBig = gap > 0;
  return {
    claimedHours: me.targetHours,
    observedHours: round1(me.observedAvgHours),
    planTooBig,
    line: planTooBig
      ? `Your plan is built for ${round1(me.targetHours)}h a day. Your real days average ${round1(me.observedAvgHours)}h — the plan is the thing that is wrong here, and it can be resized.`
      : `Your plan is built for ${round1(me.targetHours)}h a day and you are averaging ${round1(me.observedAvgHours)}h. There is room to ask more of it.`,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
