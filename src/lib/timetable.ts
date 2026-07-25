import { VERBAL_TOPICS, LRDI_TOPICS, QUANT_TOPICS } from '@/lib/topics-constants';

// Coaching timetable: shared types + the ONLY place that decides what counts as
// a valid extracted block.
//
// Doctrine (src/lib/gemini.ts GOVERNING_RULE): the model may EXTRACT what is
// printed on the page. It may not decide what the student should study. So the
// model returns blocks, and the deterministic code below is what turns those
// blocks into plan priorities. No model output ever reaches the planner
// unvalidated.

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** What the student uploaded. Drives copy only — parsing is identical. */
export type TimetableKind = 'weekly' | 'monthly' | 'syllabus';

/** Which plan a student follows. Stored on profiles.plan_source. */
export type PlanSource = 'careerrai' | 'coaching';

/**
 * A coaching TARGET — the production quota coaching actually hands out, which
 * is usually not a timetable at all. Real example (Rodha R8):
 *   "Lrdi: 200 sets", "15-20 Sectional of Quant", "100-150+ topic test".
 * count is null when the target names no number ("finish Arithmetic revision").
 */
export type TargetKind =
  | 'sectional' | 'topic_test' | 'mock' | 'questions' | 'sets'
  | 'revision' | 'classes' | 'other';

export interface CoachingTarget {
  kind: TargetKind;
  label: string;
  count: number | null;
  section: TimetableSection | null;
  deadline: string | null;
}

export type TimetableSection = 'VARC' | 'DILR' | 'QA';

export interface TimetableBlock {
  /** 0 = Monday … 6 = Sunday */
  day: number;
  /** 24h 'HH:MM' */
  start: string;
  end: string;
  section: TimetableSection | null;
  /** Always one of OUR topics, or null. Never a name the model made up. */
  topic: string | null;
  /** What the timetable actually said, kept verbatim so nothing is lost. */
  label: string;
}

/** Every topic name the extractor is allowed to choose from. */
export const ALLOWED_TOPICS: string[] = [...VERBAL_TOPICS, ...LRDI_TOPICS, ...QUANT_TOPICS];

const ALLOWED_SET = new Set(ALLOWED_TOPICS);
const SECTIONS = new Set(['VARC', 'DILR', 'QA']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Hard gate between the model and everything downstream. Anything malformed is
 * dropped; anything unrecognised degrades to null rather than being guessed.
 * A block with no usable day or time is worthless, so it's discarded entirely.
 */
export function sanitizeBlocks(raw: unknown): TimetableBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: TimetableBlock[] = [];

  for (const item of raw.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;

    const day = Number(b.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;

    const start = typeof b.start === 'string' ? b.start.trim() : '';
    const end = typeof b.end === 'string' ? b.end.trim() : '';
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) continue;
    if (end <= start) continue; // string compare is safe on zero-padded HH:MM

    const section = typeof b.section === 'string' && SECTIONS.has(b.section)
      ? (b.section as TimetableSection) : null;

    // The critical guard: a topic the model invented is thrown away, not stored.
    const topicRaw = typeof b.topic === 'string' ? b.topic.trim() : '';
    const topic = ALLOWED_SET.has(topicRaw) ? topicRaw : null;

    const label = (typeof b.label === 'string' ? b.label : '').trim().slice(0, 120)
      || topic || section || 'Class';

    out.push({ day, start, end, section, topic, label });
  }

  return out.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

/** Distinct real topics the coaching covers — what we align the plan to. */
export function topicsTaught(blocks: TimetableBlock[]): string[] {
  return [...new Set(blocks.map((b) => b.topic).filter((t): t is string => !!t))];
}

/** Today's classes, for "you have class at 6" style awareness. */
export function blocksForDay(blocks: TimetableBlock[], date: Date = new Date()): TimetableBlock[] {
  const jsDay = date.getDay();          // 0 = Sunday
  const ourDay = (jsDay + 6) % 7;       // 0 = Monday
  return blocks.filter((b) => b.day === ourDay);
}

const TARGET_KINDS = new Set<string>([
  'sectional', 'topic_test', 'mock', 'questions', 'sets', 'revision', 'classes', 'other',
]);

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * A syllabus completion date is only accepted if the document literally printed
 * one AND it is a sane future date. This value can move a student's whole
 * target, so an invented or misread date is far worse than no date at all —
 * when in doubt we return null and keep our own projection.
 */
export function sanitizeSyllabusEndDate(raw: unknown, now: Date = new Date()): string | null {
  if (typeof raw !== 'string' || !ISO_DATE_RE.test(raw)) return null;
  const parsed = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const days = (parsed - now.getTime()) / 86_400_000;
  // Must be ahead of us, and not implausibly far out (a misread year is the
  // classic OCR failure — "2026" read as "2062" would wreck the pace ring).
  if (days < 1 || days > 550) return null;
  return raw;
}

/**
 * Same hard gate as sanitizeBlocks, for targets. A count is only kept when it
 * is a sane positive integer — a misread "200 sets" as 200000 would produce a
 * daily pace that makes the student give up, so implausible numbers are
 * dropped to null rather than trusted.
 */
export function sanitizeTargets(raw: unknown, now: Date = new Date()): CoachingTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachingTarget[] = [];

  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;

    const label = (typeof t.label === 'string' ? t.label : '').trim().slice(0, 120);
    if (!label) continue;

    const kindRaw = typeof t.kind === 'string' ? t.kind : '';
    const kind = (TARGET_KINDS.has(kindRaw) ? kindRaw : 'other') as TargetKind;

    const n = Number(t.count);
    const count = Number.isInteger(n) && n > 0 && n <= 5000 ? n : null;

    const section = typeof t.section === 'string' && SECTIONS.has(t.section)
      ? (t.section as TimetableSection) : null;

    out.push({ kind, label, count, section, deadline: sanitizeSyllabusEndDate(t.deadline, now) });
  }
  return out;
}

export function isTimetableKind(v: unknown): v is TimetableKind {
  return v === 'weekly' || v === 'monthly' || v === 'syllabus';
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}
