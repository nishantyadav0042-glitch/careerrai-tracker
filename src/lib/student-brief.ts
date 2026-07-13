// Builds a rich brief on a fresh signup from the exact answers they gave in the
// /start form — so the Expedify AI agent walks into the call already knowing who
// this student is, what they want, and where they're strong vs weak. The
// `summary` field is a plain-language paragraph written to be read/spoken by the
// agent; the structured fields are there if Expedify wants to map them.

export interface OnboardingForm {
  ambition_date?: unknown;
  dream_colleges?: unknown;
  target_percentile?: unknown;
  hours_available?: unknown;
  coaching_enrolled?: unknown;
  is_repeater?: unknown;
  pain_points?: unknown;
  wants_mentor?: unknown;
  topic_matrix?: unknown;
}

interface SectionCoverage { total: number; covered: number; learning: number; notStarted: number; coveredPct: number }

export interface StudentBrief {
  attempt: string | null;              // 'first attempt' | 'repeater'
  targetPercentile: number | null;
  dreamColleges: string[];
  hoursPerDay: number | null;
  coaching: boolean | null;
  wantsMentor: boolean | null;
  targetDate: string | null;
  painPoints: string[];
  strongestSection: string | null;
  weakestSection: string | null;
  coverage: Record<string, SectionCoverage>;
  summary: string;                     // human-readable, for the agent
}

const COVERED = new Set(['practicing', 'revising', 'exam_ready']);
const ACADEMIC = ['VARC', 'DILR', 'QA'] as const;

function humanize(code: string): string {
  return code.replace(/_/g, ' ').trim();
}

export function buildStudentBrief(name: string, o: OnboardingForm | null | undefined): StudentBrief {
  const firstName = (name || 'there').split(' ')[0];
  const dreamColleges = Array.isArray(o?.dream_colleges)
    ? (o!.dream_colleges as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const targetPercentile = typeof o?.target_percentile === 'number' ? o!.target_percentile : null;
  const hoursPerDay = typeof o?.hours_available === 'number' ? o!.hours_available : null;
  const coaching = typeof o?.coaching_enrolled === 'boolean' ? o!.coaching_enrolled : null;
  const isRepeater = typeof o?.is_repeater === 'boolean' ? o!.is_repeater : null;
  const wantsMentor = typeof o?.wants_mentor === 'boolean' ? o!.wants_mentor : null;
  const targetDate = typeof o?.ambition_date === 'string' ? o!.ambition_date : null;
  const painPoints = Array.isArray(o?.pain_points)
    ? (o!.pain_points as unknown[]).filter((p): p is string => typeof p === 'string').map(humanize)
    : [];
  const attempt = isRepeater == null ? null : isRepeater ? 'repeater' : 'first attempt';

  // Per-section coverage from the 53-topic self-assessment.
  const matrix = Array.isArray(o?.topic_matrix)
    ? (o!.topic_matrix as { section?: string; status?: string }[])
    : [];
  const coverage: Record<string, SectionCoverage> = {};
  for (const s of ACADEMIC) {
    const rows = matrix.filter((m) => m.section === s);
    if (!rows.length) continue;
    const covered = rows.filter((r) => COVERED.has(r.status ?? '')).length;
    const learning = rows.filter((r) => r.status === 'learning').length;
    const notStarted = rows.filter((r) => r.status === 'not_started').length;
    coverage[s] = { total: rows.length, covered, learning, notStarted, coveredPct: Math.round((covered / rows.length) * 100) };
  }
  const ranked = Object.entries(coverage).sort((a, b) => b[1].coveredPct - a[1].coveredPct);
  const strongestSection = ranked.length ? ranked[0][0] : null;
  const weakestSection = ranked.length ? ranked[ranked.length - 1][0] : null;

  // ── Plain-language brief for the agent ──────────────────────────────────
  const bits: string[] = [];
  const who = [attempt, coaching == null ? null : coaching ? 'in coaching' : 'self-study (no coaching)']
    .filter(Boolean).join(', ');
  bits.push(`${firstName} is a CAT aspirant${who ? ` (${who})` : ''}${targetPercentile != null ? ` aiming for ${targetPercentile}%ile` : ''}.`);
  if (dreamColleges.length) bits.push(`Dream colleges: ${dreamColleges.join(', ')}.`);
  if (hoursPerDay != null) bits.push(`Can study ~${hoursPerDay}h/day.`);
  if (targetDate) bits.push(`Wants to finish the syllabus by ${targetDate}.`);
  if (wantsMentor != null) bits.push(wantsMentor ? 'Said YES to wanting an IIM mentor — high buying intent.' : 'Did not ask for a mentor.');
  if (strongestSection && weakestSection && strongestSection !== weakestSection) {
    bits.push(`Self-rated prep — strongest: ${strongestSection} (${coverage[strongestSection].coveredPct}% covered); weakest: ${weakestSection} (${coverage[weakestSection].coveredPct}% covered, ${coverage[weakestSection].notStarted}/${coverage[weakestSection].total} topics not started).`);
  } else if (Object.keys(coverage).length) {
    bits.push(`Self-rated prep is roughly even across sections (${ranked.map(([s, c]) => `${s} ${c.coveredPct}%`).join(', ')}).`);
  } else {
    bits.push('Has not mapped their topic coverage in detail yet.');
  }
  if (painPoints.length) bits.push(`Biggest struggles they named: ${painPoints.join(', ')}.`);
  bits.push('Just signed up — has not logged a study session yet. Goal of the call: welcome them, build trust, and get them to start.');

  return {
    attempt, targetPercentile, dreamColleges, hoursPerDay, coaching, wantsMentor,
    targetDate, painPoints, strongestSection, weakestSection, coverage,
    summary: bits.join(' '),
  };
}
