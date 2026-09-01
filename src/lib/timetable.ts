import { VERBAL_TOPICS, LRDI_TOPICS, QUANT_TOPICS } from '@/lib/topics-constants';
import { resolveChapter, resolveTopic, resolveActivity } from '@/lib/coaching-vocab';

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
  /**
   * Real coaching sheets come in three shapes and all three must survive:
   *   A. recurring weekly  -> day 0-6            ("Mon 6-8pm")
   *   B. dated calendar    -> date 'YYYY-MM-DD'  ("26 Sep 23 ... Geometry Basics 1")
   *   C. relative plan     -> dayIndex 1..N      ("Day 1 ... Day 5")
   * At least ONE must be present. Forcing everything into day-of-week
   * collapsed a five-week dated syllabus into five identical Tuesdays, and
   * dropped every row of a Day 1-5 plan outright.
   */
  day: number | null;
  date: string | null;
  dayIndex: number | null;
  /**
   * The QA chapter a coaching named when no leaf topic is identifiable —
   * "Algebra", "Arithmetic", "Geometry", "Number System", "Modern Math".
   *
   * Carried BESIDE topic, never as one. Coachings teach at this level while
   * every one of our topics is a leaf beneath it, so a sheet reading "Algebra
   * - JP Sir" used to resolve to nothing and be counted unreadable. Expanding
   * it into its six units instead would over-claim: one Algebra class is not
   * Logarithms AND Progressions AND Functions, and timetable topics flow into
   * topic_coverage, so that lie would corrupt the revision schedule. Coverage
   * therefore reads `topic` only; this field exists so an honest partial read
   * stops being reported as a failure.
   */
  chapter?: string | null;
  /** null on all-day entries ("Whole Day", "Practice Session"). */
  start: string | null;
  end: string | null;
  allDay: boolean;
  section: TimetableSection | null;
  /** Always one of OUR topics, or null. Never a name the model made up. */
  topic: string | null;
  /** What the timetable actually said, kept verbatim so nothing is lost. */
  label: string;
  /**
   * Planned minutes for this task, when the sheet states them ("Planned mins
   * 480", "2 hrs: ...") or the times imply them. null when nothing is printed
   * — never estimated. This is what lets the app CHECK a student's daily
   * hours against what their own timetable actually plans (founder, 7 Aug).
   */
  minutes: number | null;
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

  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;

    // Position in time — any ONE of the three anchors is enough.
    const dayNum = Number(b.day);
    const day = Number.isInteger(dayNum) && dayNum >= 0 && dayNum <= 6 ? dayNum : null;

    const dateRaw = typeof b.date === 'string' ? b.date.trim() : '';
    const date = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateRaw) ? dateRaw : null;

    const idxNum = Number(b.dayIndex);
    const dayIndex = Number.isInteger(idxNum) && idxNum >= 1 && idxNum <= 400 ? idxNum : null;

    if (day === null && date === null && dayIndex === null) continue;

    // Times are optional: "Whole Day" and "Practice Session" are real rows.
    const startRaw = typeof b.start === 'string' ? b.start.trim() : '';
    const endRaw = typeof b.end === 'string' ? b.end.trim() : '';
    const hasStart = TIME_RE.test(startRaw);
    const hasEnd = TIME_RE.test(endRaw);
    // A window is only kept when BOTH ends are valid and ordered. Coaching
    // sheets legitimately run past midnight ("10 PM - 12 AM"), so an end that
    // is not after the start is treated as all-day rather than discarded —
    // dropping it would lose a real class.
    // "10 PM - 12 AM" is the standard late batch, and every row of a real
    // dated sheet looked like that — treating end <= start as unusable turned
    // the entire timetable into "All day". An end at or before the start just
    // means it crosses midnight, which is a real window, not a broken one.
    const timed = hasStart && hasEnd;
    const start = timed ? startRaw : null;
    const end = timed ? endRaw : null;
    const allDay = !timed;

    const section = typeof b.section === 'string' && SECTIONS.has(b.section)
      ? (b.section as TimetableSection) : null;

    const labelRaw = (typeof b.label === 'string' ? b.label : '').trim().slice(0, 120);

    // The critical guard: a topic the model invented is thrown away. But before
    // giving up we run the raw text through our own alias table — "TSD",
    // "Arithmetic : Percentages", "Venn Diagrams" are ours, the model just
    // didn't spell them our way. Deterministic lookup, never a fuzzy guess.
    const topicRaw = typeof b.topic === 'string' ? b.topic.trim() : '';
    const topic = ALLOWED_SET.has(topicRaw)
      ? topicRaw
      : (resolveTopic(topicRaw) ?? resolveTopic(labelRaw));

    // Only when no leaf topic was identified: a precise topic always wins, and
    // a block never carries both.
    const chapter = topic ? null : (resolveChapter(topicRaw) ?? resolveChapter(labelRaw));

    const label = labelRaw || topic || chapter || section || 'Class';

    // Minutes: printed value wins; a start-end pair implies one; else null.
    let minutes: number | null = null;
    const minsRaw = Number((b as { minutes?: unknown }).minutes);
    if (Number.isFinite(minsRaw) && minsRaw >= 15 && minsRaw <= 960) {
      minutes = Math.round(minsRaw);
    } else if (start && end) {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const span = (eh * 60 + em) - (sh * 60 + sm);
      minutes = span > 0 ? span : span + 24 * 60; // 22:00-00:00 runs overnight
    }
    out.push({ day, date, dayIndex, start, end, allDay, section, topic, chapter, label, minutes });
  }

  // Chronological where we can be: real dates first, then Day N, then weekday.
  return out.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? '');
    if (a.dayIndex != null && b.dayIndex != null) return a.dayIndex - b.dayIndex || (a.start ?? '').localeCompare(b.start ?? '');
    if (a.day != null && b.day != null) return a.day - b.day || (a.start ?? '').localeCompare(b.start ?? '');
    return 0;
  });
}

/** Distinct real topics the coaching covers — what we align the plan to. */
export function topicsTaught(blocks: TimetableBlock[]): string[] {
  return [...new Set(blocks.map((b) => b.topic).filter((t): t is string => !!t))];
}

// blocksForDay lived here until the 14 Aug sweep, which found it referenced by
// exactly one line in the entire repository: its own definition. No import, no
// test, no doc, no string literal, no config.
//
// It is not a loss. It carried both of the date defects this codebase spent
// August removing — a raw date.toISOString() slice instead of the student's
// study day, and date.getDay(), the HOST's local weekday, which is only right
// because Vercel happens to run UTC. timetable-month.coachingBlocksForDate is
// the live answer to "what does this student's sheet put on this date", and it
// anchors to the confirmed month rather than trusting whatever dates the OCR
// read — the fix that stopped Riya being told her timetable had run out three
// years ago.

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

    // Coaching vocabulary is wildly inconsistent — FLM / AIMCAT / SimCAT are
    // all one thing, as are Sheet / Exercise / HW / Assignment. When the model
    // doesn't commit to a kind, the alias table reads it off the label.
    const kindRaw = typeof t.kind === 'string' ? t.kind : '';
    const kind = (TARGET_KINDS.has(kindRaw) && kindRaw !== 'other'
      ? kindRaw
      : (resolveActivity(label) ?? (TARGET_KINDS.has(kindRaw) ? kindRaw : 'other'))) as TargetKind;

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

/** "26 Sep", "Day 3", "Tue" — whichever anchor this row actually has. */
export function whenLabel(b: TimetableBlock): string {
  if (b.date) {
    const d = new Date(`${b.date}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? b.date
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  if (b.dayIndex != null) return `Day ${b.dayIndex}`;
  if (b.day != null) return DAY_LABELS[b.day];
  return '';
}

/** "6pm–8pm", or "All day" when the sheet gave no usable window. */
export function timeLabel(b: TimetableBlock): string {
  if (b.allDay || !b.start || !b.end) return 'All day';
  // Crossing midnight is normal for late batches; mark it so "10pm–12am"
  // never reads as a twenty-two-hour class.
  const overnight = b.end <= b.start;
  return `${formatTime(b.start)}–${formatTime(b.end)}${overnight ? ' +1' : ''}`;
}
