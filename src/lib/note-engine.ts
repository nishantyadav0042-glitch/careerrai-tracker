// The Morning Note engine — the interpretation layer of the loop.
//
// This file is the company thesis (docs/CAREERRAI-THESIS.md, v1.4) made
// executable. It turns a snapshot of one student's real data into one morning
// note, obeying the Nine Laws structurally — not as review checklist items but
// as code paths that cannot emit a violating note:
//
//   Law 2  — detectors fire only past named thresholds; below them the note
//            says "steady", and steady is written as a positive.
//   Law 3  — the assembler physically places the earned delta first; there is
//            no code path that opens with the cut.
//   Law 4  — every note ends in Today's Win, capped at TWO items.
//   Law 9  — every observation carries its receipts (dates, counts) inline.
//   Law 8  — pace verdicts are plan-denominated; the word "percentile" never
//            appears in a promise.
//
// v0 is deliberately tier-1 only: every detector below is computable from
// sensors that exist in production TODAY (daily_reports, topic_coverage,
// profiles, streak) — nothing waits on new capture. This is the engine the
// 21-day WhatsApp pilot runs on: a human fetches the snapshot, this code
// writes the note, the founder sends it.
//
// Pure and clock-free (`today` is an argument) so every law is testable.

export interface SnapshotLog {
  date: string;              // 'YYYY-MM-DD'
  hours: number;             // 0 is honest rest / unknown-legacy; still a shown-up day
  sections: string[];        // e.g. ['QA','VARC'] — section-level, our real granularity
}

export interface SnapshotCoverage {
  topic: string;
  section: 'QA' | 'VARC' | 'DILR' | string;
  status: 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';
  updatedAt: string;         // 'YYYY-MM-DD'
}

export interface StudentSnapshot {
  firstName: string;
  targetPercentile: number | null;
  coachingName: string | null;   // 'TIME', 'PW', null = self-study
  isRepeater: boolean;
  weakSection: string | null;    // self-declared at onboarding
  weakTopic: string | null;
  daysToCat: number;
  logs: SnapshotLog[];           // most-recent-first not required; we sort
  coverage: SnapshotCoverage[];
}

export interface Observation {
  kind: 'avoidance' | 'drift' | 'revision_gap' | 'earned' | 'steady';
  text: string;
  /** Law 9: the proof, human-readable, shown WITH the claim. */
  receipts: string;
  /** Higher = more worth saying. Used to pick ONE. */
  weight: number;
  /** One-sentence form of the claim, for the 30-second interrupt format. */
  short?: string;
  /** The decision this observation implies: what gains time, what loses it.
   * `cut` is null when there is nothing dominant to take the minutes from. */
  swap?: { add: string; cut: string | null };
}

export interface MorningNote {
  /** Assembled, WhatsApp-ready. */
  text: string;
  /** The parts, for tests and for the eventual UI. */
  earned: Observation | null;
  observation: Observation | null;
  win: string[];
  paceLine: string;
}

// ── Thresholds (Law 2: named, with rationale — never inline magic) ──────────

/** Days of silence on the self-declared weak section before avoidance is a
 * pattern, not a gap. Below this, silence is noise. */
const AVOIDANCE_MIN_DAYS = 5;
/** A section must dominate this share of recent study days before we call it
 * drift. WHOOP-style banding: inside the band, say nothing. */
const DRIFT_DOMINANT_SHARE = 0.6;
const DRIFT_NEGLECTED_SHARE = 0.15;
/** Days without touching a practicing/revising topic before its revision
 * window is "expiring". Forgetting-curve coarse band, not false precision. */
const REVISION_GAP_DAYS = 10;
/** Window the note reasons over. Older evidence is the model's business, not
 * the note's — Law 6: recovered history stops being cited. */
const WINDOW_DAYS = 14;
/** Minimum logged days before behavioural claims are honest at all. Below
 * this the note runs on onboarding + calendar only (the tier-0 note). */
const MIN_DAYS_FOR_BEHAVIOUR = 3;

// ── Helpers ─────────────────────────────────────────────────────────────────

const dayMs = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);
}

function recentLogs(s: StudentSnapshot, today: string): SnapshotLog[] {
  return s.logs
    .filter((l) => daysBetween(l.date, today) >= 0 && daysBetween(l.date, today) <= WINDOW_DAYS)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function fmtDates(dates: string[]): string {
  // '28 Jul, 30 Jul, 2 Aug' — receipts a student can check against memory.
  return dates
    .map((d) => {
      const dt = new Date(`${d}T00:00:00Z`);
      return `${dt.getUTCDate()} ${dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
    })
    .join(', ');
}

/** The section eating the most recent study days — the natural donor of
 * minutes in a swap. Null when nothing dominates or nothing is loggable. */
function dominantSection(logs: SnapshotLog[], exclude?: string | null): string | null {
  const counts = new Map<string, number>();
  for (const l of logs) for (const sec of new Set(l.sections)) {
    if (sec !== exclude) counts.set(sec, (counts.get(sec) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? null;
}

/** A concrete re-entry point inside a section, from the student's OWN record —
 * never an invented topic (Law 9). */
function startPoint(s: StudentSnapshot, section: string): string | null {
  const inSection = s.coverage
    .filter((c) => c.section === section && (c.status === 'learning' || c.status === 'practicing'))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return inSection[0]?.topic ?? null;
}

// ── Detectors (each returns null below threshold — Law 2) ───────────────────

/** The student told us their weak section, and their own logs show they've
 * stopped opening it. The founder's canonical WTF-class observation, writable
 * from week one. */
export function detectAvoidance(s: StudentSnapshot, today: string): Observation | null {
  if (!s.weakSection) return null;
  const logs = recentLogs(s, today);
  if (logs.length < MIN_DAYS_FOR_BEHAVIOUR) return null;

  const touched = logs.filter((l) => l.sections.includes(s.weakSection!));
  const lastTouch = touched[0]?.date ?? null;
  const silence = lastTouch ? daysBetween(lastTouch, today) : Math.min(WINDOW_DAYS, daysBetween(logs[logs.length - 1].date, today));
  if (silence < AVOIDANCE_MIN_DAYS) return null;

  const studiedInstead = [...new Set(logs.flatMap((l) => l.sections))].filter((x) => x !== s.weakSection);
  const entry = startPoint(s, s.weakSection);
  return {
    kind: 'avoidance',
    text: `You called ${s.weakSection} your weak section — and you've been behaving like someone who has quietly decided it can wait. ${silence} days without opening it.`,
    receipts: `${logs.length} study days in the last two weeks (${studiedInstead.join(', ') || 'other sections'}); last ${s.weakSection} session: ${lastTouch ? fmtDates([lastTouch]) : 'none on record'}.`,
    weight: 90 + Math.min(10, silence - AVOIDANCE_MIN_DAYS),
    short: `${silence} days since you last opened ${s.weakSection} — the section you yourself called weak.`,
    swap: {
      add: entry ? `${s.weakSection} (start: ${entry})` : s.weakSection,
      cut: dominantSection(logs, s.weakSection),
    },
  };
}

/** One section is eating the study time while another starves. Vedprakash's
 * real shape: 14 of 18 days on DILR. */
export function detectDrift(s: StudentSnapshot, today: string): Observation | null {
  const logs = recentLogs(s, today);
  if (logs.length < MIN_DAYS_FOR_BEHAVIOUR + 2) return null;

  const counts = new Map<string, number>();
  for (const l of logs) for (const sec of new Set(l.sections)) counts.set(sec, (counts.get(sec) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2) return null;

  const [topSec, topDays] = ranked[0];
  const core = ['QA', 'VARC', 'DILR'];
  const starved = core.filter((sec) => (counts.get(sec) ?? 0) / logs.length <= DRIFT_NEGLECTED_SHARE);
  if (topDays / logs.length < DRIFT_DOMINANT_SHARE || starved.length === 0) return null;

  const entry = startPoint(s, starved[0]);
  return {
    kind: 'drift',
    text: `${topDays} of your last ${logs.length} study days were ${topSec}. ${starved.join(' and ')} ${starved.length === 1 ? 'has' : 'have'} nearly disappeared from your prep — not because ${starved[0]} got easier.`,
    receipts: `${topSec}: ${topDays}/${logs.length} days · ${starved.map((x) => `${x}: ${counts.get(x) ?? 0}/${logs.length}`).join(' · ')}.`,
    weight: 70 + Math.round((topDays / logs.length) * 20),
    short: `${topDays} of your last ${logs.length} study days went to ${topSec}; ${starved.join(' and ')} ${starved.length === 1 ? 'has' : 'have'} nearly disappeared.`,
    swap: {
      add: entry ? `${starved[0]} (start: ${entry})` : starved[0],
      cut: topSec,
    },
  };
}

/** A topic the student worked to reach practicing/revising is going cold.
 * Decay moves even on zero-input days — this is the detector that keeps the
 * note alive when the student does nothing. */
export function detectRevisionGap(s: StudentSnapshot, today: string): Observation | null {
  const stale = s.coverage
    .filter((c) => (c.status === 'practicing' || c.status === 'revising'))
    .map((c) => ({ ...c, gap: daysBetween(c.updatedAt, today) }))
    .filter((c) => c.gap >= REVISION_GAP_DAYS)
    .sort((a, b) => b.gap - a.gap);
  if (stale.length === 0) return null;

  const worst = stale[0];
  const donor = dominantSection(recentLogs(s, today), worst.section);
  return {
    kind: 'revision_gap',
    text: `${worst.topic} — a topic you'd already pushed to ${worst.status === 'revising' ? 'revision' : 'practice'} — hasn't been touched in ${worst.gap} days. Work you've done is quietly evaporating.`,
    receipts: `Last touched ${fmtDates([worst.updatedAt])}; ${stale.length > 1 ? `${stale.length - 1} more topic${stale.length > 2 ? 's' : ''} in the same state.` : 'only one in this state — catch it early.'}`,
    weight: 50 + Math.min(20, worst.gap - REVISION_GAP_DAYS),
    short: `${worst.topic} — already at ${worst.status === 'revising' ? 'revision' : 'practice'} level — untouched for ${worst.gap} days. That work is decaying.`,
    swap: {
      add: `revising ${worst.topic}`,
      cut: donor ?? 'new material',
    },
  };
}

/** Law 3's fuel: the delta the student EARNED. There is always one to find —
 * that is what a real memory is for. */
export function detectEarned(s: StudentSnapshot, today: string): Observation | null {
  const logs = recentLogs(s, today);
  if (logs.length === 0) return null;

  // Consecutive shown-up days ending yesterday/today.
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * dayMs).toISOString().slice(0, 10);
    if (s.logs.some((l) => l.date === d)) streak++;
    else if (i > 0) break;
    else continue; // today itself may not be logged yet — skip without breaking
    if (i > WINDOW_DAYS) break;
  }
  if (streak >= 3) {
    return {
      kind: 'earned',
      text: `${streak} study days in a row — your longest active run this fortnight.`,
      receipts: `${fmtDates(logs.slice(0, Math.min(streak, 3)).map((l) => l.date))}${streak > 3 ? '…' : ''}.`,
      weight: 40 + streak,
    };
  }

  // Fallback earned: they showed up at all in a window where most don't.
  const days = logs.length;
  if (days >= 1) {
    const secs = [...new Set(logs.flatMap((l) => l.sections))];
    return {
      kind: 'earned',
      text: `${days} logged ${days === 1 ? 'day' : 'days'} this fortnight${secs.length ? ` across ${secs.join(', ')}` : ''} — the record is building.`,
      receipts: fmtDates(logs.slice(0, 3).map((l) => l.date)) + (days > 3 ? '…' : '.'),
      weight: 20 + days,
    };
  }
  return null;
}

/** Law 2's floor: when nothing crosses a threshold, steadiness IS the news,
 * and it is good news. */
export function steadyObservation(): Observation {
  return {
    kind: 'steady',
    text: 'Nothing important changed since yesterday. That is a steady day — and steady days are how plans get won.',
    receipts: 'No band crossed, no gap opened.',
    weight: 0,
  };
}

// ── Pace (Law 8: plan-denominated, banded, never a percentile promise) ──────

export function paceLine(s: StudentSnapshot): string {
  const total = s.coverage.length;
  if (total === 0) return `${s.daysToCat} days to CAT.`;
  const started = s.coverage.filter((c) => c.status !== 'not_started').length;
  const pct = Math.round((started / total) * 100);
  const target = s.targetPercentile ? `your ${s.targetPercentile}-percentile plan` : 'your plan';
  // Coarse banding on syllabus-time alignment; bands, not decimals (Law 2).
  const timeUsed = 1 - s.daysToCat / 120; // season ≈ 120 days from Aug
  const coverageRate = started / total;
  if (coverageRate >= timeUsed - 0.1) return `🟢 ON TRACK — ${target} is intact (${pct}% of topics started, ${s.daysToCat} days to go).`;
  if (coverageRate >= timeUsed - 0.25) return `🟠 SLIPPING — ${target} needs attention: ${pct}% started with ${s.daysToCat} days left. Recoverable this week.`;
  return `🔴 RECOVER — ${target} is behind: ${pct}% started, ${s.daysToCat} days left. Today matters more than usual.`;
}

// ── Today's Win (Law 4: ≤ 2 items, concrete, sized small) ───────────────────

export function todaysWin(s: StudentSnapshot, observation: Observation | null): string[] {
  const win: string[] = [];
  // The win answers the observation — Law 5: today's action is tomorrow's evidence.
  if (observation?.kind === 'avoidance' && s.weakSection) {
    win.push(`25 minutes of ${s.weakSection}${s.weakTopic ? ` (start with ${s.weakTopic})` : ''} — just reopen the door.`);
  } else if (observation?.kind === 'drift') {
    const starvedMatch = observation.receipts.match(/([A-Z]+): [01]\//);
    win.push(`One focused block on ${starvedMatch?.[1] ?? s.weakSection ?? 'your thinnest section'} before anything else.`);
  } else if (observation?.kind === 'revision_gap') {
    const topic = observation.text.split(' — ')[0];
    win.push(`20 minutes revising ${topic} — protect work you've already done.`);
  }
  // Second slot: continuity of whatever they're mid-way through, or a default.
  const learning = s.coverage.filter((c) => c.status === 'learning');
  if (win.length < 2 && learning.length > 0) {
    win.push(`Continue ${learning[0].topic} — finish what's started before opening anything new.`);
  }
  if (win.length === 0) {
    win.push(`One solid session on ${s.weakSection ?? 'QA'} — quality over hours.`);
  }
  return win.slice(0, 2); // Law 4: never more than two.
}

// ── The assembler (Law 3 is enforced HERE: earned always precedes the cut) ──

export function composeNote(s: StudentSnapshot, today: string): MorningNote {
  const logs = recentLogs(s, today);
  const behavioural = logs.length >= MIN_DAYS_FOR_BEHAVIOUR;

  const earned = detectEarned(s, today);
  const candidates = behavioural
    ? [detectAvoidance(s, today), detectDrift(s, today), detectRevisionGap(s, today)].filter(
        (o): o is Observation => o !== null
      )
    : [detectRevisionGap(s, today)].filter((o): o is Observation => o !== null);

  // ONE observation, the heaviest — one jaw-drop beats five useful (Law 9).
  const observation = candidates.sort((a, b) => b.weight - a.weight)[0] ?? null;
  const pace = paceLine(s);
  const win = todaysWin(s, observation);

  const coachingLine = s.coachingName
    ? `Stay with your ${s.coachingName} schedule today — we're not changing that.`
    : null;

  const lines: string[] = [];
  lines.push(`Before you study, ${s.firstName} —`);
  lines.push('');
  if (earned) lines.push(`✅ ${earned.text}`); // Law 3: the earned delta opens. Always.
  lines.push(pace);
  if (coachingLine) lines.push(coachingLine);
  lines.push('');
  const obs = observation ?? steadyObservation();
  if (obs.kind !== 'steady') {
    lines.push(`One thing you're not noticing: ${obs.text}`);
    lines.push(`(${obs.receipts})`); // Law 9: receipts travel with the claim.
  } else {
    lines.push(obs.text);
  }
  lines.push('');
  lines.push(`🎯 Today's Win:`);
  win.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
  lines.push('');
  lines.push(`That's enough. Everything else is optional. Go study — we'll review tonight.`);

  return { text: lines.join('\n'), earned, observation, win, paceLine: pace };
}

// ── v0.2: the Morning Interrupt (thesis v1.5) ───────────────────────────────
//
// The pivot: the pilot measures INFLUENCE, not interest. The KPI is the
// Decision Override Rate — did the student change today's plan because we
// said so. So the note leads with a DECISION (an explicit swap: minutes in,
// minutes out), the deficit rides behind it as the why, and the close asks
// for a trust verdict, not a diary entry.
//
// Law 3 as amended (v1.5): the interrupt opens decision-first or
// recognition-first — never deficit-first. "Today's plan changes" is a
// verdict, not an accusation; the ostrich research is about leading with
// failure, and a decision is not a failure.
//
// Wall sentence: CareerRai should change today's decision — not just
// describe today's preparation.

/** Share of days (in tenths) that open with recognition instead of a swap —
 * the "surprising positive" quota. Deterministic per student+date so the
 * pilot batch hits ~30% without a random source. */
const RECOGNITION_SHARE_TENTHS = 3;
/** Observations at or above this weight (avoidance-class) are too important
 * to defer for the recognition quota — the swap ships anyway. */
const CRITICAL_WEIGHT = 85;
/** Minutes moved per swap, by observation kind. Small on purpose: a swap the
 * student can actually execute beats a plan they admire. */
const SWAP_MINUTES: Record<string, number> = { avoidance: 25, drift: 25, revision_gap: 20 };

/** The compliance-learning close — fixed wording, one tap. The four options
 * ARE the Advice Trust Rate instrument; never reword them mid-pilot. */
export const TRUST_CLOSE =
  'Tonight, one tap — did you trust today’s advice?\n' +
  '✅ Followed exactly · 🟡 Mostly · 🔄 Modified it · ❌ Ignored';

export interface InterruptDecision {
  kind: 'swap' | 'hold';
  minutes: number | null;      // null on hold days
  add: string | null;
  cut: string | null;
}

export interface MorningInterrupt {
  /** Assembled, WhatsApp-ready, readable in ≤30 seconds. */
  text: string;
  decision: InterruptDecision;
  /** The observation behind the decision (the why), or the earned delta on
   * recognition days. */
  reason: Observation;
  /** True on surprising-positive days: the plan holds and we say why. */
  recognition: boolean;
}

/** Deterministic ~30% of student-days are recognition days. Pure function of
 * (student, date) so reruns produce the same batch. */
export function isRecognitionDay(firstName: string, today: string): boolean {
  let h = 0;
  for (const ch of `${firstName}|${today}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 10 < RECOGNITION_SHARE_TENTHS;
}

export function composeInterrupt(s: StudentSnapshot, today: string): MorningInterrupt {
  const logs = recentLogs(s, today);
  const behavioural = logs.length >= MIN_DAYS_FOR_BEHAVIOUR;

  const candidates = (behavioural
    ? [detectAvoidance(s, today), detectDrift(s, today), detectRevisionGap(s, today)]
    : [detectRevisionGap(s, today)]
  ).filter((o): o is Observation => o !== null);
  const observation = candidates.sort((a, b) => b.weight - a.weight)[0] ?? null;
  const earned = detectEarned(s, today);

  // Recognition day: the quota fires AND nothing critical is burning AND we
  // actually have something earned to recognise (never fabricate — Law 9).
  const critical = observation !== null && observation.weight >= CRITICAL_WEIGHT;
  const recognition =
    observation === null || (isRecognitionDay(s.firstName, today) && !critical && earned !== null);

  const lines: string[] = [];
  lines.push(`Before you study, ${s.firstName} —`);
  lines.push('');

  if (recognition) {
    const delta = earned ?? steadyObservation();
    lines.push('Today’s plan holds. Change nothing.');
    lines.push(`✅ ${delta.text} (${delta.receipts})`);
    // The surprise is real, not flattery: the median student's log dies at
    // day 2 — a production number, not a motivational poster.
    const loggedDays = logs.length;
    if (loggedDays > 2) {
      lines.push(`Most students’ logs die by day 2. Yours is at ${loggedDays} this fortnight.`);
    }
    if (s.coachingName) {
      lines.push(`${s.coachingName === 'coaching' ? 'Your coaching' : s.coachingName} sets the pace today — we checked, and it’s working for you.`);
    }
    lines.push('');
    lines.push(TRUST_CLOSE);
    return {
      text: lines.join('\n'),
      decision: { kind: 'hold', minutes: null, add: null, cut: null },
      reason: delta,
      recognition: true,
    };
  }

  const obs = observation!; // non-null: recognition covered the null case
  const minutes = SWAP_MINUTES[obs.kind] ?? 20;
  const add = obs.swap?.add ?? s.weakSection ?? 'your thinnest section';
  const cut = obs.swap?.cut ?? 'anything else';

  lines.push('Today’s plan changes.');
  lines.push(`➕ ${minutes} min → ${add}`);
  lines.push(`➖ ${minutes} min → ${cut}`);
  lines.push('');
  lines.push(`Why: ${obs.short ?? obs.text} (${obs.receipts})`);
  if (s.coachingName) {
    const batch = s.coachingName === 'coaching' ? 'Your coaching batch' : `Your ${s.coachingName} batch`;
    lines.push(`${batch} runs at batch pace — this swap is YOUR pace. Don’t confuse the two.`);
  }
  lines.push('');
  lines.push(TRUST_CLOSE);

  return {
    text: lines.join('\n'),
    decision: { kind: 'swap', minutes, add, cut },
    reason: obs,
    recognition: false,
  };
}
