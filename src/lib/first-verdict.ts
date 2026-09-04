import { TOPIC_METADATA, type TopicMetadata } from '@/lib/topics-constants';
import type { TopicMemoryEntry } from '@/lib/prep-memory';

// ── THE FIRST VERDICT (activation forensic, 4 Sep) ──────────────────────────
//
// Production audit: 785 of 1,044 real students never logged a single day.
// 78% who opened the logging modal did it inside their FIRST HOUR — their
// very first action on the product was being asked to report study they had
// not yet done. 249 opened it; 0 of them ever logged. The modal was not
// broken; the ASK was wrong for a student we met five minutes ago.
//
// The fix the founder signed off is narrower than "make onboarding better":
// interpret what onboarding ALREADY collected and show the student something
// true about themselves before asking for anything new. Not a question, not
// a diary, not a chatbot — a read of the 46-topic self-report matrix they
// just filled in, restated as a verdict instead of a form they already
// closed.
//
// THE ONE RULE THIS FILE ENFORCES: never claim ability. `topic_coverage` is
// self-reported COVERAGE ("have you touched this"), not measured ACCURACY
// ("are you good at this"). Every sentence this module can produce is a
// coverage-balance observation — "you've marked X, Y is comparatively
// untouched" — never "you are weak at Y". That distinction is the whole
// honesty budget of the feature; the moment it claims to know something it
// was never given evidence for, it is the same fiction the mission
// statement already forbids everywhere else in this codebase.

const SECTIONS = ['QA', 'VARC', 'DILR'] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABEL: Record<Section, string> = { QA: 'Quant', VARC: 'VARC', DILR: 'DILR' };

/** A topic counts as touched once the student has said anything beyond
 *  "haven't started" — matches COVERED_FLOOR's neighbourly definition
 *  elsewhere in this codebase, but deliberately looser here: "learning"
 *  already tells us something about attention, even before it's covered. */
function isTouched(status: string): boolean {
  return status !== 'not_started';
}

export interface SectionRead {
  section: Section;
  label: string;
  totalTopics: number;
  touchedTopics: number;
}

export interface FirstVerdict {
  totalTopics: number;
  touchedTopics: number;
  bySection: SectionRead[];
  /** The section with the most self-reported attention. */
  strongestSection: SectionRead;
  /** The section with the least — the one thing this verdict points at. */
  quietestSection: SectionRead;
  /** True only when the student's OWN stated weak section (onboarding) is a
   *  DIFFERENT section from the one their own coverage matrix says is
   *  quietest. This is the sharpest sentence the verdict can produce — not
   *  because we know better, but because we can show them their own two
   *  answers disagreeing. Never rendered as "you're wrong". */
  selfReportDisagreesWithCoverage: boolean;
  selfReportedWeakest: string | null;
}

/**
 * Compute the verdict, or null when there is nothing honest to say.
 *
 * Returns null — not a fabricated "welcome!" filler — when the student has
 * touched zero topics (a truly blank matrix carries no signal to interpret)
 * or when fewer than MIN_SECTIONS_WITH_DATA sections have any coverage at
 * all (comparing "QA: 3 touched" against "VARC: 0, DILR: 0" is not a real
 * comparison). Callers fall back to whatever they showed before this existed.
 */
export function firstVerdict(
  topicMemory: Pick<TopicMemoryEntry, 'topic' | 'status'>[],
  selfReportedWeakestSection: string | null,
): FirstVerdict | null {
  const bySection: Record<Section, SectionRead> = {
    QA: { section: 'QA', label: SECTION_LABEL.QA, totalTopics: 0, touchedTopics: 0 },
    VARC: { section: 'VARC', label: SECTION_LABEL.VARC, totalTopics: 0, touchedTopics: 0 },
    DILR: { section: 'DILR', label: SECTION_LABEL.DILR, totalTopics: 0, touchedTopics: 0 },
  };

  for (const entry of topicMemory) {
    const meta: TopicMetadata | undefined = TOPIC_METADATA[entry.topic];
    if (!meta) continue; // a stale/renamed topic key — skip rather than crash on unknown data
    const row = bySection[meta.section];
    row.totalTopics += 1;
    if (isTouched(entry.status)) row.touchedTopics += 1;
  }

  const totalTopics = bySection.QA.totalTopics + bySection.VARC.totalTopics + bySection.DILR.totalTopics;
  const touchedTopics = bySection.QA.touchedTopics + bySection.VARC.touchedTopics + bySection.DILR.touchedTopics;
  if (touchedTopics === 0) return null; // a blank matrix has no coverage story to tell

  const sectionsWithAnyData = SECTIONS.filter((s) => bySection[s].totalTopics > 0);
  const MIN_SECTIONS_WITH_DATA = 2;
  if (sectionsWithAnyData.length < MIN_SECTIONS_WITH_DATA) return null;

  const ranked = [...sectionsWithAnyData]
    .map((s) => bySection[s])
    .sort((a, b) => (b.touchedTopics / b.totalTopics) - (a.touchedTopics / a.totalTopics));
  const strongestSection = ranked[0];
  const quietestSection = ranked[ranked.length - 1];

  // No real gap to point at — every section has near-identical attention.
  if (strongestSection.touchedTopics / strongestSection.totalTopics
      - quietestSection.touchedTopics / quietestSection.totalTopics < 0.15) {
    return null;
  }

  const weakestLabel = selfReportedWeakestSection
    ? SECTION_LABEL[selfReportedWeakestSection as Section] ?? null
    : null;

  return {
    totalTopics,
    touchedTopics,
    bySection: SECTIONS.map((s) => bySection[s]),
    strongestSection,
    quietestSection,
    selfReportDisagreesWithCoverage: weakestLabel != null && weakestLabel !== quietestSection.label,
    selfReportedWeakest: weakestLabel,
  };
}
