import type { Section } from './prep-model';

// ── The mixed-day engine — one scheduler for both views ─────────────────────
//
// Founder, 10 Aug: "You made a blunder — the homepage shows a mixed day but the
// whole plan shows one subject a day, and single-subject days are boring and
// unrealistic. Toppers mix sections daily. Redesign it: zero inconsistency
// between the daily plan and the whole plan, and every day a mix of sections."
//
// The old whole-plan poured a single priority-sorted queue of topics into days
// one at a time, so a 30-hour topic ate three days whole — RC-only, then
// Mensuration-only. This engine instead builds EVERY day the way toppers study:
// touch more than one section, weighted toward the weaker one, with each
// section's topics progressing across days but always ALONGSIDE the others.
//
// It is pure and deterministic. The whole-plan projects forward by advancing
// per-section queues; the homepage's "today" is this engine's day 0, so the two
// can never disagree again.
//
// Founder-approved rules (10 Aug):
//   · Sections per day scale with hours: < 3h → 2 sections (weakest + one that
//     rotates); ≥ 3h → all three every day.
//   · Time split is weighted to weakness and section size: the weakest section
//     gets the most; QA and DILR carry more than VARC.
//   · Coaching class topics still anchor to their date; self-study fills the
//     OTHER sections around them (handled by the caller).

/** Threshold below which a day carries two sections instead of three. */
export const THREE_SECTION_MIN_HOURS = 3;

/** Smallest block worth putting on a screen — anything less is dropped/merged. */
export const MIN_BLOCK_HOURS = 0.5;

/** Base weight per section: QA and DILR are bigger/harder for most, VARC lighter. */
export const SECTION_BASE_WEIGHT: Record<Section, number> = { QA: 1.0, DILR: 1.0, VARC: 0.8 };

/** The weakest section is pulled up so it gets the most time. */
export const WEAK_MULTIPLIER = 1.6;

const SECTIONS_ALL: Section[] = ['QA', 'DILR', 'VARC'];
const half = (h: number) => Math.round(h * 2) / 2;

/**
 * Which sections a day covers, weakest first.
 *
 * ≥ 3h: all three. < 3h: the weakest plus ONE other, rotating the two
 * non-weakest by day so both are still touched every couple of days — the
 * founder's "scale by hours" call, so a 2h day is two ~60-minute blocks, not
 * three ~40-minute ones.
 */
export function sectionsForDay(hoursToday: number, weakest: Section, dayIndex: number): Section[] {
  const others = SECTIONS_ALL.filter((s) => s !== weakest);
  if (hoursToday >= THREE_SECTION_MIN_HOURS) return [weakest, ...others];
  const rotating = others[dayIndex % others.length];
  return [weakest, rotating];
}

/**
 * Split the day's hours across its sections, weighted to weakness and size,
 * rounded to half-hours, summing back to exactly hoursToday.
 */
export function splitDayHours(sections: Section[], hoursToday: number, weakest: Section): Map<Section, number> {
  const out = new Map<Section, number>();
  if (sections.length === 0 || hoursToday <= 0) return out;

  const weightOf = (s: Section) => SECTION_BASE_WEIGHT[s] * (s === weakest ? WEAK_MULTIPLIER : 1);
  const totalWeight = sections.reduce((sum, s) => sum + weightOf(s), 0);

  // First pass: proportional, half-hour rounded, floored at the minimum block.
  let assigned = 0;
  for (const s of sections) {
    const raw = (weightOf(s) / totalWeight) * hoursToday;
    const h = Math.max(MIN_BLOCK_HOURS, half(raw));
    out.set(s, h);
    assigned += h;
  }

  // Reconcile rounding drift onto the section that should flex — the weakest
  // when we overshot's inverse, else the largest block — so the day still sums
  // to what the student committed.
  let drift = half(hoursToday - assigned);
  if (drift !== 0) {
    const order = [...sections].sort((a, b) => (out.get(b)! - out.get(a)!)); // biggest first
    // Give extra to the weakest first; take back from the biggest first.
    const target = drift > 0
      ? (sections.includes(weakest) ? weakest : order[0])
      : order[0];
    const next = Math.max(MIN_BLOCK_HOURS, half(out.get(target)! + drift));
    drift = half(drift - (next - out.get(target)!));
    out.set(target, next);
    // Any residual (from the min-block floor) spreads over the rest.
    for (const s of order) {
      if (drift === 0) break;
      if (s === target) continue;
      const cur = out.get(s)!;
      const adj = Math.max(MIN_BLOCK_HOURS, half(cur + drift));
      drift = half(drift - (adj - cur));
      out.set(s, adj);
    }
  }
  return out;
}

export interface QueueTopic { topic: string; section: Section; hours: number; mode: 'learn' | 'practice' | 'revise' }
export interface MixItem { section: Section; topic: string; hours: number; mode: 'learn' | 'practice' | 'revise' }

/**
 * Fill one section's time slot from its own queue, advancing across days. A
 * topic can span days (RC is 30h) but only ever inside its section's daily slot,
 * so the day stays a mix. Mutates the queue (shifts finished topics off the
 * front) and returns the items placed today. `carry` tracks hours already spent
 * on the front topic on previous days.
 */
export function drawFromSection(queue: QueueTopic[], hours: number): MixItem[] {
  const items: MixItem[] = [];
  let left = hours;
  while (left >= MIN_BLOCK_HOURS && queue.length > 0) {
    const head = queue[0];
    const take = half(Math.min(head.hours, left));
    if (take < MIN_BLOCK_HOURS) break;
    items.push({ section: head.section, topic: head.topic, hours: take, mode: head.mode });
    head.hours = half(head.hours - take);
    left = half(left - take);
    if (head.hours < MIN_BLOCK_HOURS) queue.shift();
  }
  // If a whole section slot found no topic (queue emptied), nothing is placed —
  // the caller's other sections still fill the day.
  return items;
}
